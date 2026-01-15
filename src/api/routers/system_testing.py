from fastapi import APIRouter, Depends, HTTPException

import json
from typing import Any

from core.processor.basic_handler import BasicHandler
from core.processor.system_prompt_tester import SystemPromptTester
from api.dependencies import get_current_user_id, get_user_ai_services
from api.schemas import (
    ApiResponse,
    ChatMessageInput,
    ChatTestInput,
    ChatTestDiffExplainInput,
    ChatTestDiffAnalysisGetInput,
    ChatTestDiffAnalysisSaveInput,
    SystemPromptTestInput,
    UserInput,
    VersionInput,
)
from api.session_store import session_store
from api.routers.versions import add_session_version, save_chat_test_message


router = APIRouter()

MODEL_CONFIG_MISSING_MESSAGE = (
    "AI model configuration not found in database. "
    "Please configure the model settings in the frontend interface first."
)


def _parse_json_array(text: str) -> list:
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            suggestions = parsed.get("suggestions")
            return suggestions if isinstance(suggestions, list) else []
        return parsed if isinstance(parsed, list) else []
    except Exception:
        pass

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        parsed = json.loads(text[start: end + 1])
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _fetch_chat_test_messages(
    *,
    db: Any,
    session_id: str,
    version_id: int,
    start_order: int,
    end_order: int,
) -> list[dict]:
    query = """
        SELECT
            ctm.id,
            ctm.message_type,
            ctm.content,
            ctm.message_order,
            ctm.created_at,
            ctm.response_time_ms,
            ctm.token_count
        FROM chat_test_messages ctm
        INNER JOIN chat_test_sessions cts ON ctm.chat_session_id = cts.id
        WHERE cts.session_id = %s
            AND cts.version_id = %s
            AND cts.is_active = 1
            AND ctm.message_order BETWEEN %s AND %s
        ORDER BY ctm.message_order ASC, ctm.created_at ASC
    """
    rows = db.execute_query(
        query, (session_id, version_id, start_order, end_order)
    )
    for row in rows:
        if "created_at" in row and row["created_at"]:
            try:
                row["created_at"] = row["created_at"].isoformat()
            except Exception:
                pass
    return rows


def _fetch_chat_test_messages_by_ids(
    *,
    db: Any,
    session_id: str,
    version_id: int,
    message_ids: list[int],
) -> list[dict]:
    if not message_ids:
        return []

    placeholders = ",".join(["%s"] * len(message_ids))
    query = f"""
        SELECT
            ctm.id,
            ctm.message_type,
            ctm.content,
            ctm.message_order,
            ctm.created_at,
            ctm.response_time_ms,
            ctm.token_count
        FROM chat_test_messages ctm
        INNER JOIN chat_test_sessions cts ON ctm.chat_session_id = cts.id
        WHERE cts.session_id = %s
            AND cts.version_id = %s
            AND cts.is_active = 1
            AND ctm.id IN ({placeholders})
        ORDER BY ctm.message_order ASC, ctm.created_at ASC
    """
    rows = db.execute_query(query, (session_id, version_id, *message_ids))
    for row in rows:
        if "created_at" in row and row["created_at"]:
            try:
                row["created_at"] = row["created_at"].isoformat()
            except Exception:
                pass
    return rows


def _generate_suggestions_for_test(
    *,
    user_ai_services: Any,
    system_prompt: str,
    user_test_message: str,
    model_response: str,
) -> list:
    try:
        import agent_prompt

        handler = BasicHandler(user_ai_services)
        suggestions_user_message = (
            f"System prompt:\n{system_prompt}\n\n"
            f"User test message:\n{user_test_message}\n\n"
            f"Model response:\n{model_response}\n"
        )
        raw = handler.call_llm(
            agent_prompt.validation_prompt_suggestions_system_prompt,
            suggestions_user_message,
        )
        suggestions = _parse_json_array(raw)
        return (
            suggestions[:5]
            if isinstance(suggestions, list) and suggestions
            else []
        )
    except Exception:
        return []


def _safe_load_metadata(raw: Any) -> dict:
    try:
        if raw is None:
            return {}
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str) and raw:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        return {}
    except Exception:
        return {}


def _upsert_diff_analysis_metadata(
    *,
    meta: dict,
    other_version_id: int,
    entry: dict,
) -> dict:
    updated = meta.copy() if isinstance(meta, dict) else {}
    diff_map = updated.get("diff_analysis")
    if not isinstance(diff_map, dict):
        diff_map = {}
    diff_map[str(other_version_id)] = entry
    updated["diff_analysis"] = diff_map
    return updated


async def _save_default_test_conversation(
    session_id: str,
    version_id: int,
    test_case: str,
    response: str,
    suggestions: list | None = None,
):
    try:
        from api.database_api import db

        check_query = "SELECT id FROM prompt_versions WHERE id = %s"
        version_exists = db.execute_query(check_query, (version_id,))

        if not version_exists:
            return

        await save_chat_test_message(
            ChatMessageInput(
                session_id=session_id,
                version_id=version_id,
                message_type="user",
                content=test_case,
                metadata={"is_default_test": True},
            )
        )
        await save_chat_test_message(
            ChatMessageInput(
                session_id=session_id,
                version_id=version_id,
                message_type="assistant",
                content=response,
                metadata={
                    "is_default_test": True,
                    **(
                        {"suggestions": suggestions}
                        if isinstance(suggestions, list) and suggestions
                        else {}
                    ),
                },
            )
        )
    except Exception as e:
        print(f"Warning: Failed to save default test conversation: {e}")
        import traceback

        traceback.print_exc()


async def _upsert_default_test_suggestions(
    *,
    session_id: str,
    version_id: int,
    suggestions: list,
):
    if not isinstance(suggestions, list) or not suggestions:
        return

    try:
        from api.database_api import db

        session_rows = db.execute_query(
            """
            SELECT id
            FROM chat_test_sessions
            WHERE session_id = %s AND version_id = %s AND is_active = 1
            ORDER BY id DESC
            LIMIT 1
            """,
            (session_id, version_id),
        )
        if not session_rows:
            return

        chat_session_id = session_rows[0]["id"]

        msg_rows = db.execute_query(
            """
            SELECT id, metadata
            FROM chat_test_messages
            WHERE chat_session_id = %s
              AND message_type = 'assistant'
              AND (
                metadata LIKE '%"is_default_test": true%'
                OR metadata LIKE '%"is_default_test":true%'
                OR metadata LIKE '%"is_default_test"%'
              )
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (chat_session_id,),
        )
        if not msg_rows:
            return

        row = msg_rows[0]
        meta = _safe_load_metadata(row.get("metadata"))
        meta["is_default_test"] = True
        meta["suggestions"] = suggestions[:5]
        db.execute_update(
            "UPDATE chat_test_messages SET metadata = %s WHERE id = %s",
            (json.dumps(meta), row["id"]),
        )
    except Exception:
        return


@router.post("/test-results", response_model=ApiResponse)
async def test_results(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        from api.database_api import get_messages

        session = session_store.get_session(user_input.session_id)

        messages = get_messages(user_input.session_id)

        latest_original_prompt = None
        latest_optimized_prompt = None

        for message in reversed(messages):
            if (
                message.get("step") == "structure"
                and message.get("type") == "assistant"
                and latest_original_prompt is None
            ):
                latest_original_prompt = message.get("content")
            elif (
                message.get("step") == "optimization"
                and message.get("type") == "assistant"
                and latest_optimized_prompt is None
            ):
                latest_optimized_prompt = message.get("content")

        original_prompt = latest_original_prompt or session.get("prompt", "")
        optimized_prompt = latest_optimized_prompt or session.get(
            "optimized_prompt", ""
        )

        if not original_prompt or not optimized_prompt:
            raise HTTPException(
                status_code=400, detail="Lack of effective prompt content"
            )

        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        system_tester = SystemPromptTester(user_ai_services)
        comparison_result = system_tester.compare_system_prompts(
            original_prompt, optimized_prompt
        )

        test_case = comparison_result["test_case"]
        original_response = comparison_result["original_result"]["response"]
        optimized_response = comparison_result["optimized_result"]["response"]

        original_suggestions = _generate_suggestions_for_test(
            user_ai_services=user_ai_services,
            system_prompt=original_prompt,
            user_test_message=test_case,
            model_response=original_response,
        )
        optimized_suggestions = _generate_suggestions_for_test(
            user_ai_services=user_ai_services,
            system_prompt=optimized_prompt,
            user_test_message=test_case,
            model_response=optimized_response,
        )

        session["test_results"] = {
            "test_case": test_case,
            "original_result": original_response,
            "optimized_result": optimized_response,
        }

        from api.database_api import db

        try:
            check_query = (
                "SELECT id, version_type, metadata FROM prompt_versions "
                "WHERE session_id = %s "
                "AND version_type IN ('original', 'optimized')"
            )
            existing_versions = db.execute_query(
                check_query,
                (user_input.session_id,),
            )
            existing_types = (
                [v["version_type"] for v in existing_versions]
                if existing_versions
                else []
            )
            existing_by_type = (
                {v["version_type"]: v for v in existing_versions}
                if existing_versions
                else {}
            )

            if "original" not in existing_types:
                original_version = VersionInput(
                    prompt_content=original_prompt,
                    test_result=original_response,
                    version_type="original",
                    metadata={
                        "timestamp": session.get("created_at", ""),
                        "isOriginal": True,
                        "isOptimized": False,
                        "test_case": test_case,
                    },
                )
                version_response = await add_session_version(
                    user_input.session_id, original_version
                )
                if version_response.status == "success":
                    original_version_id = version_response.result[
                        "version_id"
                    ]
                    await _save_default_test_conversation(
                        user_input.session_id,
                        original_version_id,
                        test_case,
                        original_response,
                        original_suggestions,
                    )
            else:
                original_row = existing_by_type.get("original")
                if original_row and original_row.get("id"):
                    try:
                        meta_raw = original_row.get("metadata")
                        meta = (
                            json.loads(meta_raw)
                            if isinstance(meta_raw, str) and meta_raw
                            else (meta_raw or {})
                        )
                        if not isinstance(meta, dict):
                            meta = {}
                        meta["test_case"] = test_case
                        db.execute_update(
                            "UPDATE prompt_versions SET metadata = %s "
                            "WHERE id = %s",
                            (json.dumps(meta), original_row["id"]),
                        )
                    except Exception:
                        pass
                    await _upsert_default_test_suggestions(
                        session_id=user_input.session_id,
                        version_id=original_row["id"],
                        suggestions=original_suggestions,
                    )

            if "optimized" not in existing_types:
                optimized_version = VersionInput(
                    prompt_content=optimized_prompt,
                    test_result=optimized_response,
                    version_type="optimized",
                    metadata={
                        "timestamp": session.get("created_at", ""),
                        "isOriginal": False,
                        "isOptimized": True,
                        "test_case": test_case,
                    },
                )
                version_response = await add_session_version(
                    user_input.session_id, optimized_version
                )
                if version_response.status == "success":
                    optimized_version_id = version_response.result[
                        "version_id"
                    ]
                    await _save_default_test_conversation(
                        user_input.session_id,
                        optimized_version_id,
                        test_case,
                        optimized_response,
                        optimized_suggestions,
                    )
            else:
                optimized_row = existing_by_type.get("optimized")
                if optimized_row and optimized_row.get("id"):
                    try:
                        meta_raw = optimized_row.get("metadata")
                        meta = (
                            json.loads(meta_raw)
                            if isinstance(meta_raw, str) and meta_raw
                            else (meta_raw or {})
                        )
                        if not isinstance(meta, dict):
                            meta = {}
                        meta["test_case"] = test_case
                        db.execute_update(
                            "UPDATE prompt_versions SET metadata = %s "
                            "WHERE id = %s",
                            (json.dumps(meta), optimized_row["id"]),
                        )
                    except Exception:
                        pass
                    await _upsert_default_test_suggestions(
                        session_id=user_input.session_id,
                        version_id=optimized_row["id"],
                        suggestions=optimized_suggestions,
                    )
        except Exception as save_error:
            print(
                f"Warning: Failed to save versions to database: {save_error}"
            )

        return {
            "status": "success",
            "result": {
                "original_prompt": original_prompt,
                "optimized_prompt": optimized_prompt,
                "test_case": test_case,
                "original_result": original_response,
                "optimized_result": optimized_response,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-system-prompt", response_model=ApiResponse)
async def test_system_prompt(
    test_input: SystemPromptTestInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        validation_result = user_ai_services.validate_model_config()
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": validation_result["message"],
                    "missing_fields": validation_result["missing_fields"],
                },
            )

        system_tester = SystemPromptTester(user_ai_services)
        result = system_tester.test_system_prompt(
            test_input.system_prompt, test_input.user_message
        )

        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat-test-version", response_model=ApiResponse)
async def chat_test_version(
    chat_input: ChatTestInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        validation_result = user_ai_services.validate_model_config()
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": validation_result["message"],
                    "missing_fields": validation_result["missing_fields"],
                },
            )

        from api.database_api import db

        query = (
            "SELECT prompt_content FROM prompt_versions "
            "WHERE session_id = %s AND id = %s"
        )
        version_data = db.execute_query(
            query,
            (chat_input.session_id, chat_input.version_number),
        )

        if not version_data:
            raise HTTPException(status_code=404, detail="Version not found")

        system_prompt = version_data[0]["prompt_content"]

        system_tester = SystemPromptTester(user_ai_services)
        result = system_tester.test_with_custom_message(
            system_prompt, chat_input.user_message
        )

        suggestions = _generate_suggestions_for_test(
            user_ai_services=user_ai_services,
            system_prompt=system_prompt,
            user_test_message=chat_input.user_message,
            model_response=result.get("response", ""),
        )

        result_payload = dict(result)
        result_payload["suggestions"] = suggestions
        return {"status": "success", "result": result_payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat-test-diff-explain", response_model=ApiResponse)
async def chat_test_diff_explain(
    payload: ChatTestDiffExplainInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        validation_result = user_ai_services.validate_model_config()
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": validation_result["message"],
                    "missing_fields": validation_result["missing_fields"],
                },
            )

        from api.database_api import db

        prompt_query = """
            SELECT id, version_number, prompt_content, version_name
            FROM prompt_versions
            WHERE session_id = %s AND id IN (%s, %s)
        """
        rows = db.execute_query(
            prompt_query,
            (
                payload.session_id,
                payload.left_version_id,
                payload.right_version_id,
            ),
        )
        prompt_map = {r["id"]: r for r in rows}
        left_row = prompt_map.get(payload.left_version_id) or {}
        right_row = prompt_map.get(payload.right_version_id) or {}
        left_prompt = left_row.get("prompt_content")
        right_prompt = right_row.get("prompt_content")
        left_vn = left_row.get("version_number")
        right_vn = right_row.get("version_number")
        left_name = left_row.get("version_name") or (
            f"Version {left_vn or payload.left_version_id}"
        )
        right_name = right_row.get("version_name") or (
            f"Version {right_vn or payload.right_version_id}"
        )
        if not left_prompt or not right_prompt:
            raise HTTPException(status_code=404, detail="Version not found")

        if payload.left_message_ids and payload.right_message_ids:
            left_messages = _fetch_chat_test_messages_by_ids(
                db=db,
                session_id=payload.session_id,
                version_id=payload.left_version_id,
                message_ids=payload.left_message_ids,
            )
            right_messages = _fetch_chat_test_messages_by_ids(
                db=db,
                session_id=payload.session_id,
                version_id=payload.right_version_id,
                message_ids=payload.right_message_ids,
            )
        else:
            left_messages = _fetch_chat_test_messages(
                db=db,
                session_id=payload.session_id,
                version_id=payload.left_version_id,
                start_order=payload.left_start_order,
                end_order=payload.left_end_order,
            )
            right_messages = _fetch_chat_test_messages(
                db=db,
                session_id=payload.session_id,
                version_id=payload.right_version_id,
                start_order=payload.right_start_order,
                end_order=payload.right_end_order,
            )

        def to_transcript(messages: list[dict]) -> str:
            lines = []
            for m in messages:
                role = (
                    "User" if m.get("message_type") == "user" else "Assistant"
                )
                order = m.get("message_order")
                content = m.get("content") or ""
                lines.append(f"{role} [{order}]: {content}")
            return "\n".join(lines)

        import agent_prompt

        handler = BasicHandler(user_ai_services)
        user_message = (
            "Explain why the two prompt versions produced different "
            "behaviors.\n\n"
            f"=== {left_name} System Prompt ===\n"
            f"{left_prompt}\n\n"
            f"=== {right_name} System Prompt ===\n"
            f"{right_prompt}\n\n"
            f"=== {left_name} Test Messages (selected) ===\n"
            f"{to_transcript(left_messages)}\n\n"
            f"=== {right_name} Test Messages (selected) ===\n"
            f"{to_transcript(right_messages)}\n"
        )
        explanation = handler.call_llm(
            agent_prompt.validation_diff_explainer_system_prompt,
            user_message,
        )

        return {
            "status": "success",
            "result": {"explanation": explanation},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat-test-diff-analysis-save", response_model=ApiResponse)
async def chat_test_diff_analysis_save(
    payload: ChatTestDiffAnalysisSaveInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        from api.database_api import db

        rows = db.execute_query(
            """
            SELECT id, metadata
            FROM prompt_versions
            WHERE session_id = %s AND id IN (%s, %s)
            """,
            (
                payload.session_id,
                payload.left_version_id,
                payload.right_version_id,
            ),
        )
        version_map = {r["id"]: r for r in (rows or [])}
        left_row = version_map.get(payload.left_version_id)
        right_row = version_map.get(payload.right_version_id)
        if not left_row or not right_row:
            raise HTTPException(status_code=404, detail="Version not found")

        from datetime import datetime, timezone

        now_iso = datetime.now(timezone.utc).isoformat()
        entry = {
            "left_version_id": payload.left_version_id,
            "right_version_id": payload.right_version_id,
            "left_message_ids": payload.left_message_ids,
            "right_message_ids": payload.right_message_ids,
            "explanation": payload.explanation,
            "updated_at": now_iso,
        }

        left_meta = _safe_load_metadata(left_row.get("metadata"))
        right_meta = _safe_load_metadata(right_row.get("metadata"))
        left_meta = _upsert_diff_analysis_metadata(
            meta=left_meta,
            other_version_id=payload.right_version_id,
            entry=entry,
        )
        right_meta = _upsert_diff_analysis_metadata(
            meta=right_meta,
            other_version_id=payload.left_version_id,
            entry=entry,
        )

        db.execute_update(
            "UPDATE prompt_versions SET metadata = %s WHERE id = %s",
            (json.dumps(left_meta), payload.left_version_id),
        )
        db.execute_update(
            "UPDATE prompt_versions SET metadata = %s WHERE id = %s",
            (json.dumps(right_meta), payload.right_version_id),
        )

        return {"status": "success", "result": {"updated_at": now_iso}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat-test-diff-analysis-get", response_model=ApiResponse)
async def chat_test_diff_analysis_get(
    payload: ChatTestDiffAnalysisGetInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        from api.database_api import db

        rows = db.execute_query(
            """
            SELECT id, metadata
            FROM prompt_versions
            WHERE session_id = %s AND id IN (%s, %s)
            """,
            (
                payload.session_id,
                payload.left_version_id,
                payload.right_version_id,
            ),
        )
        version_map = {r["id"]: r for r in (rows or [])}
        left_row = version_map.get(payload.left_version_id)
        right_row = version_map.get(payload.right_version_id)
        if not left_row or not right_row:
            raise HTTPException(status_code=404, detail="Version not found")

        meta = _safe_load_metadata(left_row.get("metadata"))
        diff_map = meta.get("diff_analysis")
        if not isinstance(diff_map, dict):
            return {"status": "success", "result": {"analysis": None}}

        analysis = diff_map.get(str(payload.right_version_id))
        return {"status": "success", "result": {"analysis": analysis}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-test-case", response_model=ApiResponse)
async def generate_test_case(
    test_input: SystemPromptTestInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        validation_result = user_ai_services.validate_model_config()
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": validation_result["message"],
                    "missing_fields": validation_result["missing_fields"],
                },
            )

        system_tester = SystemPromptTester(user_ai_services)
        test_case = system_tester.test_case_generator.generate_test_case(
            test_input.system_prompt
        )

        return {"status": "success", "result": {"test_case": test_case}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-multiple-test-cases", response_model=ApiResponse)
async def generate_multiple_test_cases(
    test_input: SystemPromptTestInput,
    user_id: int = Depends(get_current_user_id),
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": [
                        "modelApiUrl",
                        "modelApiKey",
                        "modelName",
                    ],
                },
            )

        validation_result = user_ai_services.validate_model_config()
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": validation_result["message"],
                    "missing_fields": validation_result["missing_fields"],
                },
            )

        system_tester = SystemPromptTester(user_ai_services)
        test_case_generator = system_tester.test_case_generator
        test_cases = test_case_generator.generate_multiple_test_cases(
            test_input.system_prompt,
            test_input.count,
        )

        return {"status": "success", "result": {"test_cases": test_cases}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get-version-prompt", response_model=ApiResponse)
async def get_version_prompt(session_id: str, version_number: int):
    try:
        from api.database_api import db

        query = (
            "SELECT prompt_content FROM prompt_versions "
            "WHERE session_id = %s AND version_number = %s"
        )
        version_data = db.execute_query(query, (session_id, version_number))

        if not version_data:
            raise HTTPException(status_code=404, detail="Version not found")

        return {
            "status": "success",
            "result": {"prompt_content": version_data[0]["prompt_content"]},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
