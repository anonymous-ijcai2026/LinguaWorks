import json

from fastapi import APIRouter, HTTPException

from api import database_api
from api.schemas import (
    ApiResponse,
    ChatHistoryRequest,
    ChatMessageInput,
    VersionInput,
)


router = APIRouter()


@router.get("/api/sessions/{session_id}/versions", response_model=ApiResponse)
async def get_session_versions(session_id: str):
    try:
        from api.database_api import db

        query = """
        SELECT
            id,
            version_number,
            version_name,
            prompt_content,
            test_result,
            version_type,
            created_at,
            metadata
        FROM prompt_versions
        WHERE session_id = %s
        ORDER BY version_number ASC
        """

        versions = db.execute_query(query, (session_id,))

        for version in versions:
            if version["created_at"]:
                version["created_at"] = version["created_at"].isoformat()
            if version["metadata"]:
                version["metadata"] = (
                    json.loads(version["metadata"])
                    if isinstance(version["metadata"], str)
                    else version["metadata"]
                )

        return ApiResponse(
            status="success",
            result=versions,
            message=f"Found {len(versions)} versions for session {session_id}",
        )
    except Exception as e:
        return ApiResponse(
            status="error",
            result=None,
            message=f"Failed to get versions: {str(e)}",
        )


@router.post("/api/sessions/{session_id}/versions", response_model=ApiResponse)
async def add_session_version(session_id: str, version_input: VersionInput):
    try:
        from api.database_api import db

        version_query = (
            "SELECT COALESCE(MAX(version_number), 0) + 1 as next_version "
            "FROM prompt_versions WHERE session_id = %s"
        )
        result = db.execute_query(version_query, (session_id,))
        next_version = result[0]["next_version"] if result else 1

        connection = database_api.db.get_connection()
        if not connection:
            raise Exception("Failed to get database connection")

        cursor = None
        try:
            cursor = connection.cursor(dictionary=True)

            insert_query = """
            INSERT INTO prompt_versions
            (
                session_id,
                version_number,
                prompt_content,
                test_result,
                version_type,
                metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """

            metadata_json = (
                json.dumps(version_input.metadata)
                if version_input.metadata
                else None
            )

            cursor.execute(
                insert_query,
                (
                    session_id,
                    next_version,
                    version_input.prompt_content,
                    version_input.test_result,
                    version_input.version_type,
                    metadata_json,
                ),
            )

            version_id = cursor.lastrowid
            connection.commit()
        finally:
            if cursor:
                cursor.close()
            if connection:
                connection.close()

        return ApiResponse(
            status="success",
            result={"version_id": version_id, "version_number": next_version},
            message=f"Version {next_version} added successfully",
        )
    except Exception as e:
        return ApiResponse(
            status="error",
            result=None,
            message=f"Failed to add version: {str(e)}",
        )


@router.put(
    "/api/sessions/{session_id}/versions/{version_id}/name",
    response_model=ApiResponse,
)
async def update_version_name(session_id: str, version_id: int, request: dict):
    try:
        version_name = request.get("version_name")
        if not version_name or not version_name.strip():
            return ApiResponse(
                status="error",
                result=None,
                message="Version name cannot be empty",
            )

        update_query = """
        UPDATE prompt_versions
        SET version_name = %s, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = %s AND id = %s
        """

        connection = database_api.db.get_connection()
        if not connection:
            raise Exception("Failed to get database connection")

        cursor = None
        try:
            cursor = connection.cursor()
            cursor.execute(
                update_query, (version_name.strip(), session_id, version_id)
            )

            if cursor.rowcount == 0:
                return ApiResponse(
                    status="error",
                    result=None,
                    message=f"Version {version_id} not found",
                )

            connection.commit()
        finally:
            if cursor:
                cursor.close()
            if connection:
                connection.close()

        return ApiResponse(
            status="success",
            result={
                "version_id": version_id,
                "version_name": version_name.strip(),
            },
            message="版本名称更新成功",
        )
    except Exception as e:
        return ApiResponse(
            status="error",
            result=None,
            message=f"Failed to update version name: {str(e)}",
        )


@router.delete(
    "/api/sessions/{session_id}/versions/{version_id}",
    response_model=ApiResponse,
)
async def delete_version(session_id: str, version_id: int):
    try:
        from api.database_api import db

        check_query = (
            "SELECT id, session_id, version_number FROM prompt_versions "
            "WHERE session_id = %s AND id = %s"
        )
        version_result = db.execute_query(
            check_query,
            (session_id, version_id),
        )

        if not version_result:
            return ApiResponse(
                status="error",
                result=None,
                message=f"Version {version_id} not found",
            )

        count_query = (
            "SELECT COUNT(*) as count FROM prompt_versions "
            "WHERE session_id = %s"
        )
        count_result = db.execute_query(count_query, (session_id,))

        if count_result and count_result[0]["count"] <= 1:
            return ApiResponse(
                status="error", result=None, message="不能删除最后一个版本"
            )

        delete_query = (
            "DELETE FROM prompt_versions WHERE session_id = %s AND id = %s"
        )
        success = db.execute_update(delete_query, (session_id, version_id))

        if not success:
            raise Exception("Failed to delete version from database")

        return ApiResponse(
            status="success",
            result={"deleted_version_id": version_id},
            message="版本删除成功",
        )
    except Exception as e:
        return ApiResponse(
            status="error",
            result=None,
            message=f"Failed to delete version: {str(e)}",
        )


@router.put(
    "/api/versions/{version_id}/test-result",
    response_model=ApiResponse,
)
async def update_version_test_result(version_id: int, test_result: str):
    try:
        from api.database_api import db

        update_query = """
        UPDATE prompt_versions
        SET test_result = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """

        success = db.execute_update(update_query, (test_result, version_id))

        if not success:
            raise Exception("Failed to update test result in database")

        return ApiResponse(
            status="success",
            result={"version_id": version_id},
            message="Test result updated successfully",
        )
    except Exception as e:
        return ApiResponse(
            status="error",
            result=None,
            message=f"Failed to update test result: {str(e)}",
        )


@router.post("/chat-test-save-message", response_model=ApiResponse)
async def save_chat_test_message(message_input: ChatMessageInput):
    try:
        from mysql.connector import Error

        connection = database_api.db.get_connection()
        if not connection:
            raise Exception("Database connection failed")

        cursor = connection.cursor()

        cursor.callproc(
            "SaveChatTestMessage",
            [
                message_input.session_id,
                message_input.version_id,
                message_input.message_type,
                message_input.content,
                message_input.response_time_ms,
                message_input.token_count,
                (
                    json.dumps(message_input.metadata)
                    if message_input.metadata
                    else None
                ),
            ],
        )

        message_id = None
        try:
            connection.commit()

            for result in cursor.stored_results():
                if result.description:
                    row = result.fetchone()
                    if row:
                        message_id = row[0]
                    break
        except Exception as proc_error:
            print(f"Error processing stored procedure results: {proc_error}")
            try:
                connection.rollback()
            except Exception:
                pass
            raise Exception(
                f"Failed to process stored procedure results: {proc_error}"
            )

        cursor.close()
        connection.close()

        if message_id is None:
            raise Exception("Failed to get message ID")

        return ApiResponse(
            status="success",
            result={"message_id": message_id},
            message="Chat message saved successfully",
        )
    except Error as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save chat message: {str(e)}"
        )


@router.post("/chat-test-history", response_model=ApiResponse)
async def get_chat_test_history(history_request: ChatHistoryRequest):
    try:
        from mysql.connector import Error

        connection = database_api.db.get_connection()
        if not connection:
            raise Exception("Database connection failed")

        cursor = connection.cursor()

        cursor.callproc(
            "GetChatTestHistory",
            [
                history_request.session_id,
                history_request.version_id,
                history_request.limit,
            ],
        )

        messages = []
        try:
            connection.commit()

            for result in cursor.stored_results():
                if result.description:
                    columns = [desc[0] for desc in result.description]
                    rows = result.fetchall()
                    for row in rows:
                        message = dict(zip(columns, row))
                        if "created_at" in message and message["created_at"]:
                            message["created_at"] = (
                                message["created_at"].isoformat()
                            )
                        if "metadata" in message and message["metadata"]:
                            try:
                                message["metadata"] = (
                                    json.loads(message["metadata"])
                                    if isinstance(message["metadata"], str)
                                    else message["metadata"]
                                )
                            except Exception:
                                pass
                        messages.append(message)

            if messages and not all("metadata" in m for m in messages):
                msg_ids = [
                    m.get("id")
                    for m in messages
                    if m.get("id") is not None
                ]
                msg_ids = [i for i in msg_ids if isinstance(i, (int, str))]
                if msg_ids:
                    placeholders = ",".join(["%s"] * len(msg_ids))
                    cursor.execute(
                        "SELECT id, metadata FROM chat_test_messages "
                        f"WHERE id IN ({placeholders})",
                        tuple(msg_ids),
                    )
                    meta_rows = cursor.fetchall()
                    meta_map = (
                        {r[0]: r[1] for r in meta_rows}
                        if meta_rows
                        else {}
                    )
                    for m in messages:
                        if "metadata" in m and m["metadata"] is not None:
                            continue
                        raw = meta_map.get(m.get("id"))
                        if not raw:
                            continue
                        try:
                            m["metadata"] = (
                                json.loads(raw)
                                if isinstance(raw, str)
                                else raw
                            )
                        except Exception:
                            m["metadata"] = raw
        except Exception as proc_error:
            print(f"Error processing stored procedure results: {proc_error}")
            try:
                connection.rollback()
            except Exception:
                pass

            cursor.execute(
                """
                SELECT
                    ctm.id,
                    ctm.message_type,
                    ctm.content,
                    ctm.message_order,
                    ctm.created_at,
                    ctm.response_time_ms,
                    ctm.token_count,
                    ctm.metadata
                FROM chat_test_messages ctm
                INNER JOIN chat_test_sessions cts
                    ON ctm.chat_session_id = cts.id
                WHERE cts.session_id = %s
                    AND cts.version_id = %s
                    AND cts.is_active = 1
                ORDER BY ctm.message_order ASC, ctm.created_at ASC
                LIMIT %s
            """,
                (
                    history_request.session_id,
                    history_request.version_id,
                    history_request.limit,
                ),
            )

            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            for row in rows:
                message = dict(zip(columns, row))
                if "created_at" in message and message["created_at"]:
                    message["created_at"] = message["created_at"].isoformat()
                if "metadata" in message and message["metadata"]:
                    try:
                        message["metadata"] = (
                            json.loads(message["metadata"])
                            if isinstance(message["metadata"], str)
                            else message["metadata"]
                        )
                    except Exception:
                        pass
                messages.append(message)

        cursor.close()
        connection.close()

        return ApiResponse(
            status="success",
            result={"messages": messages},
            message="Chat history retrieved successfully",
        )
    except Error as e:
        raise HTTPException(
            status_code=500, detail=f"Database error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get chat history: {str(e)}"
        )


@router.get(
    "/chat-test-stats/{session_id}/{version_id}", response_model=ApiResponse
)
async def get_chat_test_stats(session_id: str, version_id: int):
    try:
        from mysql.connector import Error

        query = """
        SELECT
            total_conversations,
            total_user_messages,
            total_assistant_messages,
            avg_response_time_ms,
            total_tokens,
            last_test_at
        FROM chat_test_statistics
        WHERE session_id = %s AND version_id = %s
        """

        results = database_api.db.execute_query(
            query,
            (session_id, version_id),
        )

        if results:
            stats = results[0]
            if "last_test_at" in stats and stats["last_test_at"]:
                stats["last_test_at"] = stats["last_test_at"].isoformat()
        else:
            stats = {
                "total_conversations": 0,
                "total_user_messages": 0,
                "total_assistant_messages": 0,
                "avg_response_time_ms": None,
                "total_tokens": 0,
                "last_test_at": None,
            }

        return ApiResponse(
            status="success",
            result=stats,
            message="Chat test statistics retrieved successfully",
        )
    except Error as e:
        raise HTTPException(
            status_code=500, detail=f"Database error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get chat test stats: {str(e)}"
        )
