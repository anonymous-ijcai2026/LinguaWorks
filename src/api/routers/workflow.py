import json
from typing import Any, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException

from core import processor
from api.dependencies import get_current_user_id, get_user_ai_services
from api.schemas import AnalysisInput, ApiResponse, UserFeedback, UserInput
from api.session_store import session_store


router = APIRouter()

MODEL_CONFIG_MISSING_MESSAGE = (
    "AI model configuration not found in database. Please configure the "
    "model settings in the frontend interface first."
)
MODEL_CONFIG_MISSING_FIELDS = ["modelApiUrl", "modelApiKey", "modelName"]
DEFAULT_OPTIMIZATION_PROMPT = (
    "You are an expert prompt engineer. Please analyze and optimize the given "
    "prompt to make it clearer, more specific, and more effective. Focus on "
    "improving clarity, specificity, structure, and expected outcomes."
)


def _requirements_checklist_key(session_id: str) -> str:
    return f"requirements_checklist:{session_id}"


def _load_requirements_checklist(
    *, user_id: int, session_id: str
) -> dict:
    try:
        from api.database_api import db

        query = (
            "SELECT setting_value FROM user_settings "
            "WHERE user_id = %s AND setting_key = %s "
            "LIMIT 1"
        )
        rows = db.execute_query(
            query, (user_id, _requirements_checklist_key(session_id))
        )
        if not rows:
            return {}

        value = rows[0].get("setting_value")
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        return {}
    except Exception:
        return {}


def _save_requirements_checklist(
    *, user_id: int, session_id: str, checklist: dict
) -> None:
    try:
        from api.database_api import db

        query = """
        INSERT INTO user_settings (user_id, setting_key, setting_value)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE setting_value = %s
        """
        json_value = json.dumps(checklist, ensure_ascii=False)
        db.execute_update(
            query,
            (
                user_id,
                _requirements_checklist_key(session_id),
                json_value,
                json_value,
            ),
        )
    except Exception:
        return


def _get_optimization_prompt(user_id: int = 1) -> str:
    try:
        from api.database_api import get_user_settings

        settings = get_user_settings(user_id)
        return settings.get(
            "optimizationPrompt",
            DEFAULT_OPTIMIZATION_PROMPT,
        )
    except Exception:
        return DEFAULT_OPTIMIZATION_PROMPT


def _require_ai_services(
    user_id: int, *, message: str, missing_fields: list[str]
):
    user_ai_services = get_user_ai_services(user_id)
    if user_ai_services is None:
        raise HTTPException(
            status_code=400,
            detail={
                "type": "config_error",
                "message": message,
                "missing_fields": missing_fields,
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

    return user_ai_services


def _parse_json_object(text: str) -> dict:
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return {}


def _get_selected_prompt_template_keys(
    user_id: int, *, category: Optional[str] = "prompt_crafter"
) -> list[str]:
    from api.database_api import db

    params: list = [user_id]
    category_filter_sql = ""
    if category:
        category_filter_sql = """
        AND (
            EXISTS (
                SELECT 1 FROM prompt_templates pt
                WHERE pt.template_key = spt.template_key AND pt.category = %s
            )
            OR EXISTS (
                SELECT 1 FROM custom_prompt_templates cpt
                WHERE cpt.user_id = %s AND cpt.template_key = spt.template_key AND cpt.category = %s
            )
        )
        """
        params.extend([category, user_id, category])

    query = f"""
    SELECT template_key FROM selected_prompt_templates spt
    WHERE user_id = %s AND is_selected = TRUE
    {category_filter_sql}
    """
    rows = db.execute_query(query, tuple(params))
    return [row["template_key"] for row in rows]


def _get_prompt_templates_by_keys(
    user_id: int, template_keys: list[str]
) -> dict[str, dict]:
    if not template_keys:
        return {}

    from api.database_api import db

    placeholders = ", ".join(["%s"] * len(template_keys))
    params = tuple(template_keys)

    default_rows = db.execute_query(
        f"""
        SELECT template_key, name, description, category, content, variables, FALSE AS is_custom
        FROM prompt_templates
        WHERE is_active = TRUE AND template_key IN ({placeholders})
        """,
        params,
    )
    custom_rows = db.execute_query(
        f"""
        SELECT template_key, name, description, category, content, variables, TRUE AS is_custom
        FROM custom_prompt_templates
        WHERE user_id = %s AND is_active = TRUE AND template_key IN ({placeholders})
        """,
        (user_id,) + params,
    )

    templates: dict[str, dict] = {}
    for row in default_rows:
        templates[row["template_key"]] = row
    for row in custom_rows:
        templates[row["template_key"]] = row
    return templates


def _choose_template_with_llm(
    prompt_generator: processor.PromptGenerator,
    *,
    original_prompt: str,
    analysis_results: Any,
    candidates: list[dict],
    feedback: Optional[str] = None,
    avoid_template_key: Optional[str] = None,
) -> Tuple[Optional[str], str]:
    if not candidates:
        return None, ""

    candidates_payload = [
        {
            "template_key": c.get("template_key"),
            "name": c.get("name"),
            "description": c.get("description"),
            "category": c.get("category"),
            "is_custom": bool(c.get("is_custom")),
        }
        for c in candidates
    ]

    avoid_text = (
        f"Avoid selecting template_key '{avoid_template_key}' if possible.\n"
        if avoid_template_key
        else ""
    )
    feedback_text = f"User feedback about the last generated prompt:\n{feedback}\n" if feedback else ""

    import agent_prompt

    system_message = agent_prompt.template_selector_system_prompt
    user_message = (
        f"User original prompt:\n{original_prompt}\n\n"
        f"Analysis results:\n{json.dumps(analysis_results, ensure_ascii=False)}\n\n"
        f"{feedback_text}"
        f"{avoid_text}"
        f"Candidates:\n{json.dumps(candidates_payload, ensure_ascii=False)}\n"
    )

    raw = prompt_generator.call_llm(system_message, user_message)
    parsed = _parse_json_object(raw)
    template_key = parsed.get("template_key")
    reason = parsed.get("reason") or ""
    if isinstance(template_key, str):
        template_key = template_key.strip()
    if not template_key:
        return None, reason
    return template_key, reason


def _build_generation_thinking(
    *,
    candidates: list[dict],
    selected_template_key: Optional[str],
    selection_reason: str,
    is_manual_selection: bool,
) -> str:
    candidates_lines = []
    for c in candidates:
        name = c.get("name") or c.get("template_key") or ""
        suffix = " (Custom)" if c.get("is_custom") else ""
        candidates_lines.append(f"- {name}{suffix}")

    candidates_block = (
        "\n".join(candidates_lines) if candidates_lines else "- (none)"
    )

    if selected_template_key:
        selected_name = next(
            (
                (c.get("name") or c.get("template_key"))
                for c in candidates
                if c.get("template_key") == selected_template_key
            ),
            selected_template_key,
        )
    else:
        selected_name = "(none)"

    mode_text = "Manual selection" if is_manual_selection else "Auto selection"
    reason_text = selection_reason.strip() or (
        "No reason available; used the best available option."
    )

    return (
        f"## Template Selection\n"
        f"- Mode: {mode_text}\n"
        f"- Candidates ({len(candidates)}):\n{candidates_block}\n"
        f"- Selected: {selected_name}\n"
        f"- Reason: {reason_text}\n\n"
        f"## What This Changes In The Generated Prompt\n"
        f"- The selected template controls sections, ordering, and formatting.\n"
        f"- Analysis results are incorporated into role, constraints, steps, and output format.\n"
        f"- The final output is a prompt only (not task execution).\n"
    )


def _build_generation_user_message(
    *, original_prompt: str, analysis_results: Any, feedback: Optional[str] = None
) -> str:
    msg = (
        f"The user's prompt\n{original_prompt}\n"
        f"The analysis result of user's prompt:\n{str(analysis_results)}\n"
    )
    if feedback:
        msg = f"{msg}\nThe supplementary information is:\n{feedback}"
    return msg


@router.post("/check-structure", response_model=ApiResponse)
async def check_structure(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = _require_ai_services(
            user_id, message="请先配置模型设置", missing_fields=["model_config"]
        )

        session = session_store.get_session(user_input.session_id)
        structure_checker = processor.StructureChecker(user_ai_services)
        if (
            "dialogues_history" not in session
            or not session["dialogues_history"]
        ):
            session["dialogues_history"] = []
        if "requirements_checklist" not in session or not isinstance(
            session["requirements_checklist"], dict
        ):
            session["requirements_checklist"] = {}
        if not session["requirements_checklist"]:
            session["requirements_checklist"] = _load_requirements_checklist(
                user_id=user_id, session_id=user_input.session_id
            )

        end_flag, result, thinking_result, updated_checklist = structure_checker.run(
            initial_prompt=user_input.content,
            dialogues_history=session["dialogues_history"],
            requirements_checklist=session["requirements_checklist"],
        )
        session["requirements_checklist"] = updated_checklist
        _save_requirements_checklist(
            user_id=user_id,
            session_id=user_input.session_id,
            checklist=updated_checklist,
        )

        if isinstance(result, dict) and "answer" in result:
            answer = result["answer"]
        else:
            answer = result

        if end_flag == "OK":
            session["prompt"] = answer
        elif end_flag == "CLARIFY":
            end_flag = "NEED_CLARIFICATION"
        else:
            end_flag = "NEED_MORE_INFO"

        return {
            "status": "success",
            "result": {
                "end_flag": end_flag,
                "answer": answer,
                "needs_supplement": end_flag != "OK",
                "thinking": thinking_result,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/structure-feedback", response_model=ApiResponse)
async def structure_feedback(
    user_input: UserFeedback, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": "请先配置模型设置",
                    "missing_fields": ["model_config"],
                },
            )

        session = session_store.get_session(user_input.session_id)
        structure_checker = processor.StructureChecker(user_ai_services)
        if "requirements_checklist" not in session or not isinstance(
            session["requirements_checklist"], dict
        ):
            session["requirements_checklist"] = {}
        if not session["requirements_checklist"]:
            session["requirements_checklist"] = _load_requirements_checklist(
                user_id=user_id, session_id=user_input.session_id
            )
        if user_input.feedback == "yes":
            if "prompt" not in session or not session["prompt"]:
                if (
                    session["dialogues_history"]
                    and "you" in session["dialogues_history"][-1]
                ):
                    session["prompt"] = session["dialogues_history"][-1]["you"]
                else:
                    raise HTTPException(
                        status_code=400, detail="No valid Prompt content found"
                    )
            return {
                "status": "success",
                "result": session["prompt"],
                "message": "结构检查完成，进入分析元素阶段",
            }
        if user_input.feedback == "supplement":
            if not user_input.content:
                raise HTTPException(
                    status_code=400,
                    detail="Supplement information cannot be empty",
                )

            if session["dialogues_history"]:
                session["dialogues_history"].append(
                    {"user": user_input.content}
                )
            else:
                session["dialogues_history"] = [{"user": user_input.content}]

            end_flag, result, thinking_result, updated_checklist = structure_checker.run(
                dialogues_history=session["dialogues_history"],
                requirements_checklist=session["requirements_checklist"],
            )
            session["requirements_checklist"] = updated_checklist
            _save_requirements_checklist(
                user_id=user_id,
                session_id=user_input.session_id,
                checklist=updated_checklist,
            )

            if isinstance(result, dict) and "answer" in result:
                answer = result["answer"]
            else:
                answer = result

            if end_flag == "OK":
                session["prompt"] = answer
            elif end_flag == "CLARIFY":
                end_flag = "NEED_CLARIFICATION"
            else:
                end_flag = "NEED_MORE_INFO"
            return {
                "status": "success",
                "result": {
                    "end_flag": end_flag,
                    "answer": answer,
                    "needs_supplement": end_flag != "OK",
                    "thinking": thinking_result,
                },
            }

        if not user_input.content:
            raise HTTPException(
                status_code=400, detail="Feedback content cannot be empty"
            )

        end_flag, result, thinking_result, updated_checklist = structure_checker.process_feedback(
            feedback=user_input.content,
            dialogues_history=session["dialogues_history"],
            requirements_checklist=session["requirements_checklist"],
        )
        session["requirements_checklist"] = updated_checklist
        _save_requirements_checklist(
            user_id=user_id,
            session_id=user_input.session_id,
            checklist=updated_checklist,
        )

        if isinstance(result, dict) and "answer" in result:
            answer = result["answer"]
        else:
            answer = result

        if end_flag == "OK":
            session["prompt"] = answer
        elif end_flag == "CLARIFY":
            end_flag = "NEED_CLARIFICATION"

        return {
            "status": "success",
            "result": {
                "end_flag": end_flag,
                "answer": answer,
                "needs_supplement": end_flag != "OK",
                "thinking": thinking_result,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-elements", response_model=ApiResponse)
async def analyze_elements(
    user_input: AnalysisInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
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

        session = session_store.get_session(user_input.session_id)
        elements_analyzer = processor.ElementsAnalyzer(user_ai_services)

        prompt_to_analyze = session["prompt"]

        analysis_results = elements_analyzer.run(
            prompt_to_analyze,
            selected_methods=user_input.selected_methods,
            custom_methods=user_input.custom_methods,
            auto_select=user_input.auto_select,
        )

        session["analysis_results"] = analysis_results
        session["selected_methods"] = user_input.selected_methods
        session["custom_methods"] = user_input.custom_methods
        session["auto_select"] = user_input.auto_select

        return {"status": "success", "result": analysis_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis-feedback", response_model=ApiResponse)
async def analysis_feedback(
    feedback: UserFeedback, user_id: int = Depends(get_current_user_id)
):
    try:
        from api.database_api import get_messages

        session = session_store.get_session(feedback.session_id)
        if feedback.feedback.lower() == "yes":
            return {
                "status": "success",
                "result": session["analysis_results"],
                "message": "Analysis completed",
            }

        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
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

        elements_analyzer = processor.ElementsAnalyzer(user_ai_services)
        messages = get_messages(feedback.session_id)

        latest_prompt = None
        for message in reversed(messages):
            if (
                message.get("step") == "structure"
                and message.get("type") == "assistant"
                and latest_prompt is None
            ):
                latest_prompt = message.get("content")
                break

        prompt_to_analyze = latest_prompt or session.get("prompt")

        selected_methods = session.get("selected_methods")
        custom_methods = session.get("custom_methods")
        analysis_results = elements_analyzer.run(
            prompt=prompt_to_analyze,
            feedback=feedback.content,
            selected_methods=selected_methods,
            custom_methods=custom_methods,
        )
        session["analysis_results"] = analysis_results

        return {"status": "success", "result": analysis_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-prompt", response_model=ApiResponse)
async def generate_prompt(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = _require_ai_services(
            user_id,
            message=MODEL_CONFIG_MISSING_MESSAGE,
            missing_fields=MODEL_CONFIG_MISSING_FIELDS,
        )

        from api.database_api import get_messages

        session = session_store.get_session(user_input.session_id)
        prompt_generator = processor.PromptGenerator(user_ai_services)

        messages = get_messages(user_input.session_id)

        latest_prompt = None
        latest_analysis_results = None

        for message in reversed(messages):
            if (
                message.get("step") == "structure"
                and message.get("type") == "assistant"
                and latest_prompt is None
            ):
                latest_prompt = message.get("content")
            elif (
                message.get("step") == "analysis"
                and message.get("type") == "assistant"
                and latest_analysis_results is None
            ):
                try:
                    latest_analysis_results = json.loads(
                        message.get("content", "{}")
                    )
                except Exception:
                    latest_analysis_results = message.get("content")

        analysis_results = latest_analysis_results or session.get(
            "analysis_results"
        )
        original_prompt = latest_prompt or session.get("prompt")
        requested_template_key = (
            user_input.template_key.strip()
            if isinstance(user_input.template_key, str)
            and user_input.template_key.strip()
            else None
        )

        selected_keys = _get_selected_prompt_template_keys(user_id)
        keys_to_fetch: list[str] = list(selected_keys)
        if requested_template_key and requested_template_key not in keys_to_fetch:
            keys_to_fetch.append(requested_template_key)
        templates_map = _get_prompt_templates_by_keys(user_id, keys_to_fetch)
        candidates = [
            templates_map[k] for k in selected_keys if k in templates_map
        ]

        selected_template_key: Optional[str] = None
        selection_reason = ""

        if requested_template_key:
            selected_template_key = requested_template_key
        else:
            previous_key = session.get("selected_prompt_template_key")
            llm_selected_key, llm_reason = _choose_template_with_llm(
                prompt_generator,
                original_prompt=original_prompt,
                analysis_results=analysis_results,
                candidates=candidates,
                avoid_template_key=previous_key,
            )
            if llm_selected_key and llm_selected_key in templates_map:
                selected_template_key = llm_selected_key
                selection_reason = llm_reason
            elif candidates:
                selected_template_key = candidates[0]["template_key"]
                selection_reason = llm_reason

        template_content = None
        selected_template_meta = None
        if selected_template_key:
            selected_template_meta = templates_map.get(selected_template_key)
            if selected_template_meta:
                template_content = selected_template_meta.get("content")

        import agent_prompt

        base_system_prompt = agent_prompt.structuring_prompt
        if template_content:
            system_message = (
                f"{base_system_prompt}\n\n"
                f"# Prompt Framework\n{template_content}\n"
            )
        else:
            system_message = base_system_prompt
            selected_template_key = (
                selected_template_key or "built_in_structuring_prompt"
            )
            if not requested_template_key and not selection_reason:
                selection_reason = (
                    "No checked template was available; used the default framework."
                )

        user_message = _build_generation_user_message(
            original_prompt=original_prompt,
            analysis_results=analysis_results,
        )
        generated_prompt = (
            prompt_generator.call_llm(system_message, user_message).replace("```", "")
        )

        session["generated_prompt"] = generated_prompt
        session["selected_prompt_template_key"] = selected_template_key

        candidates_payload = [
            {
                "template_key": c.get("template_key"),
                "name": c.get("name"),
                "description": c.get("description"),
                "category": c.get("category"),
                "is_custom": bool(c.get("is_custom")),
            }
            for c in candidates
        ]

        thinking = _build_generation_thinking(
            candidates=candidates_payload,
            selected_template_key=selected_template_key,
            selection_reason=selection_reason,
            is_manual_selection=bool(requested_template_key),
        )

        result_payload = {
            "prompt": generated_prompt,
            "selected_template": {
                "template_key": selected_template_key,
                "name": (selected_template_meta or {}).get("name"),
                "description": (selected_template_meta or {}).get("description"),
                "category": (selected_template_meta or {}).get("category"),
                "is_custom": (selected_template_meta or {}).get("is_custom"),
            },
            "template_candidates": candidates_payload,
            "thinking": thinking,
        }

        return {"status": "success", "result": result_payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generation-feedback", response_model=ApiResponse)
async def generation_feedback(
    feedback: UserFeedback, user_id: int = Depends(get_current_user_id)
):
    try:
        from api.database_api import get_messages

        session = session_store.get_session(feedback.session_id)

        if feedback.feedback.lower() == "yes":
            return {
                "status": "success",
                "result": session["generated_prompt"],
                "message": "Prompt generation completed",
            }

        user_ai_services = _require_ai_services(
            user_id,
            message=MODEL_CONFIG_MISSING_MESSAGE,
            missing_fields=MODEL_CONFIG_MISSING_FIELDS,
        )

        prompt_generator = processor.PromptGenerator(user_ai_services)
        messages = get_messages(feedback.session_id)

        latest_prompt = None
        latest_analysis_results = None

        for message in reversed(messages):
            if (
                message.get("step") == "structure"
                and message.get("type") == "assistant"
                and latest_prompt is None
            ):
                latest_prompt = message.get("content")
            elif (
                message.get("step") == "analysis"
                and message.get("type") == "assistant"
                and latest_analysis_results is None
            ):
                try:
                    latest_analysis_results = json.loads(
                        message.get("content", "{}")
                    )
                except Exception:
                    latest_analysis_results = message.get("content")

        analysis_results = latest_analysis_results or session.get(
            "analysis_results"
        )
        original_prompt = latest_prompt or session.get("prompt")
        selected_keys = _get_selected_prompt_template_keys(user_id)
        previous_key = session.get("selected_prompt_template_key")
        templates_map = _get_prompt_templates_by_keys(user_id, selected_keys)
        candidates = [templates_map[k] for k in selected_keys if k in templates_map]

        llm_selected_key, llm_reason = _choose_template_with_llm(
            prompt_generator,
            original_prompt=original_prompt,
            analysis_results=analysis_results,
            candidates=candidates,
            feedback=feedback.content or feedback.feedback,
            avoid_template_key=previous_key,
        )

        selected_template_key: Optional[str] = None
        if llm_selected_key and llm_selected_key in templates_map:
            selected_template_key = llm_selected_key
        elif candidates:
            selected_template_key = candidates[0]["template_key"]

        template_content = None
        selected_template_meta = None
        if selected_template_key:
            selected_template_meta = templates_map.get(selected_template_key)
            if selected_template_meta:
                template_content = selected_template_meta.get("content")

        import agent_prompt

        base_system_prompt = agent_prompt.structuring_prompt
        if template_content:
            system_message = (
                f"{base_system_prompt}\n\n"
                f"# Selected Prompt Framework\n{template_content}\n"
            )
        else:
            system_message = base_system_prompt
            selected_template_key = (
                selected_template_key or "built_in_structuring_prompt"
            )
            llm_reason = llm_reason or (
                "No checked template was available; used the default framework."
            )

        user_message = _build_generation_user_message(
            original_prompt=original_prompt,
            analysis_results=analysis_results,
            feedback=feedback.content,
        )
        generated_prompt = (
            prompt_generator.call_llm(system_message, user_message).replace("```", "")
        )

        session["generated_prompt"] = generated_prompt
        session["selected_prompt_template_key"] = selected_template_key

        candidates_payload = [
            {
                "template_key": c.get("template_key"),
                "name": c.get("name"),
                "description": c.get("description"),
                "category": c.get("category"),
                "is_custom": bool(c.get("is_custom")),
            }
            for c in candidates
        ]

        thinking = _build_generation_thinking(
            candidates=candidates_payload,
            selected_template_key=selected_template_key,
            selection_reason=llm_reason,
            is_manual_selection=False,
        )

        return {
            "status": "success",
            "result": {
                "prompt": generated_prompt,
                "selected_template": {
                    "template_key": selected_template_key,
                    "name": (selected_template_meta or {}).get("name"),
                    "description": (selected_template_meta or {}).get("description"),
                    "category": (selected_template_meta or {}).get("category"),
                    "is_custom": (selected_template_meta or {}).get("is_custom"),
                },
                "template_candidates": candidates_payload,
                "thinking": thinking,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize-prompt", response_model=ApiResponse)
async def optimize_prompt(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
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

        from api.database_api import get_messages

        session = session_store.get_session(user_input.session_id)

        optimization_prompt = _get_optimization_prompt(user_id)
        messages = get_messages(user_input.session_id)

        latest_generated_prompt = None
        for message in reversed(messages):
            if (
                message.get("step") == "generation"
                and message.get("type") == "assistant"
                and latest_generated_prompt is None
            ):
                latest_generated_prompt = message.get("content")
                break

        prompt_to_optimize = latest_generated_prompt or session.get(
            "generated_prompt", ""
        )

        prompt_optimizer = processor.PromptOptimizer(user_ai_services)
        optimization_result = prompt_optimizer.run(
            prompt_to_optimize,
            optimization_prompt,
            include_thinking=True,
            temperature=0.3,
        )
        optimized_prompt = optimization_result["optimized_prompt"]
        thinking_process = optimization_result["thinking"]

        session["optimized_prompt"] = optimized_prompt

        return {
            "status": "success",
            "result": {
                "optimized_prompt": optimized_prompt,
                "thinking": thinking_process,
                "original_prompt": prompt_to_optimize,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimization-feedback", response_model=ApiResponse)
async def optimization_feedback(
    feedback: UserFeedback, user_id: int = Depends(get_current_user_id)
):
    try:
        from api.database_api import get_messages

        session = session_store.get_session(feedback.session_id)

        if feedback.feedback.lower() == "yes":
            return {
                "status": "success",
                "result": session["optimized_prompt"],
                "message": "Prompt optimization completed",
            }

        messages = get_messages(feedback.session_id)

        latest_generated_prompt = None
        for message in reversed(messages):
            if (
                message.get("step") == "generation"
                and message.get("type") == "assistant"
                and latest_generated_prompt is None
            ):
                latest_generated_prompt = message.get("content")
                break

        prompt_to_optimize = latest_generated_prompt or session.get("generated_prompt", "")

        optimization_prompt = _get_optimization_prompt(user_id)

        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
                },
            )

        feedback_text = feedback.content or feedback.feedback
        prompt_optimizer = processor.PromptOptimizer(user_ai_services)
        optimized_prompt = prompt_optimizer.run(
            prompt_to_optimize,
            optimization_prompt,
            feedback=feedback_text,
            include_thinking=False,
            temperature=0.3,
        )

        session["optimized_prompt"] = optimized_prompt

        return {"status": "success", "result": optimized_prompt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-prompt", response_model=ApiResponse)
async def test_prompt(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
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

        test_handler = processor.PromptTester(user_ai_services)
        result = test_handler.test_prompt(user_input.content)

        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/decode-insights", response_model=ApiResponse)
async def decode_insights(
    user_input: UserInput, user_id: int = Depends(get_current_user_id)
):
    try:
        user_ai_services = get_user_ai_services(user_id)
        if user_ai_services is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "config_error",
                    "message": MODEL_CONFIG_MISSING_MESSAGE,
                    "missing_fields": MODEL_CONFIG_MISSING_FIELDS,
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

        session = session_store.get_session(user_input.session_id)
        insights_decoder = processor.InsightsDecoder(user_ai_services)

        decoded_insights = insights_decoder.run(user_input.content)
        session["decoded_insights"] = decoded_insights

        return {"status": "success", "result": decoded_insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
