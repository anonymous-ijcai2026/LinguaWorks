from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error, pooling
import json
from datetime import datetime
import uuid
from typing import List, Dict, Any, Optional
import threading
import logging
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from infrastructure.config import get_config

app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
app.logger.setLevel(logging.INFO)

# Obtain configuration instances
config = get_config()

# database configuratio
DB_CONFIG = {
    "host": config.db_host,
    "database": config.db_name,
    "user": config.db_user,
    "password": config.db_password,
    "port": config.db_port,
    "charset": "utf8mb4",
    "autocommit": True,
    "pool_name": "prompt_pool",
    "pool_size": 10,
    "pool_reset_session": True,
}


class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.lock = threading.Lock()
        self._init_pool()

    def _init_pool(self):
        """Initialize the connection pool"""
        try:
            self.pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
            logging.info(
                "The database connection pool has been initialized successfully"
            )
        except Error as e:
            logging.error(f"Failed to initialize the database connection pool: {e}")
            self.pool = None

    def get_connection(self):
        """Obtain a connection from the connection pool"""
        try:
            if not self.pool:
                self._init_pool()
            if self.pool:
                return self.pool.get_connection()
        except Error as e:
            logging.error(f"Failed to get a database connection: {e}")
            self._init_pool()
            if self.pool:
                try:
                    return self.pool.get_connection()
                except Error as retry_e:
                    logging.error(
                        f"Failed to get a database connection after retry: {retry_e}"
                    )
        return None

    def execute_query(self, query: str, params: tuple = None) -> List[Dict]:
        connection = self.get_connection()
        if not connection:
            return []

        cursor = None
        try:
            cursor = connection.cursor(dictionary=True, buffered=True)
            cursor.execute(query, params or ())
            result = cursor.fetchall()
            return result
        except Error as e:
            logging.error(f"Failed to execute query: {e}")
            return []
        finally:
            if cursor:
                cursor.close()
            if connection:
                connection.close()

    def execute_update(self, query: str, params: tuple = None) -> bool:
        connection = self.get_connection()
        if not connection:
            return False

        cursor = None
        try:
            cursor = connection.cursor(buffered=True)
            cursor.execute(query, params or ())
            connection.commit()
            return True
        except Error as e:
            logging.error(f"Failed to execute update: {e}")
            if connection:
                connection.rollback()
            return False
        finally:
            if cursor:
                cursor.close()
            if connection:
                connection.close()


db = DatabaseManager()

_prompt_template_schema_lock = threading.Lock()
_prompt_template_schema_initialized = False
_prompt_template_schema_last_error: Optional[str] = None


def _ensure_prompt_template_schema() -> tuple[bool, Optional[str]]:
    global _prompt_template_schema_initialized
    global _prompt_template_schema_last_error
    if _prompt_template_schema_initialized:
        return True, None
    with _prompt_template_schema_lock:
        if _prompt_template_schema_initialized:
            return True, None

        connection = db.get_connection()
        if not connection:
            _prompt_template_schema_last_error = "Database connection failed"
            return False, _prompt_template_schema_last_error

        cursor = None
        try:
            cursor = connection.cursor(buffered=True)

            def _ensure_timestamp_columns(table_name: str) -> None:
                cursor.execute(
                    """
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = %s
                      AND COLUMN_NAME IN ('created_at', 'updated_at')
                    """,
                    (table_name,),
                )
                rows = cursor.fetchall()
                meta = {row[0]: row for row in rows}

                def _column_type(col_name: str) -> str:
                    row = meta.get(col_name)
                    data_type = (row[1] if row else None) or "timestamp"
                    if data_type.lower() in ("timestamp", "datetime"):
                        return data_type.upper()
                    return "TIMESTAMP"

                alter_parts: list[str] = []

                if "created_at" not in meta:
                    alter_parts.append(
                        f"ADD COLUMN created_at {_column_type('created_at')} NULL DEFAULT CURRENT_TIMESTAMP"
                    )
                else:
                    default_value = meta["created_at"][3]
                    if default_value is None or str(default_value).upper() not in (
                        "CURRENT_TIMESTAMP",
                        "CURRENT_TIMESTAMP()",
                    ):
                        alter_parts.append(
                            f"MODIFY created_at {_column_type('created_at')} NULL DEFAULT CURRENT_TIMESTAMP"
                        )

                if "updated_at" not in meta:
                    alter_parts.append(
                        f"ADD COLUMN updated_at {_column_type('updated_at')} NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                    )
                else:
                    default_value = meta["updated_at"][3]
                    extra = meta["updated_at"][4] or ""
                    needs_default = default_value is None or str(default_value).upper() not in (
                        "CURRENT_TIMESTAMP",
                        "CURRENT_TIMESTAMP()",
                    )
                    needs_on_update = "on update" not in str(extra).lower()
                    if needs_default or needs_on_update:
                        alter_parts.append(
                            f"MODIFY updated_at {_column_type('updated_at')} NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        )

                if alter_parts:
                    cursor.execute(
                        f"ALTER TABLE {table_name} " + ", ".join(alter_parts)
                    )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS prompt_templates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    template_key VARCHAR(100) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NULL,
                    category VARCHAR(100) NULL,
                    content LONGTEXT NOT NULL,
                    variables TEXT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_template_key (template_key),
                    KEY idx_prompt_templates_category (category),
                    KEY idx_prompt_templates_sort_order (sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_prompt_templates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    template_key VARCHAR(100) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NULL,
                    category VARCHAR(100) NULL,
                    content LONGTEXT NOT NULL,
                    variables TEXT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_user_template (user_id, template_key),
                    KEY idx_custom_prompt_templates_user_id (user_id),
                    KEY idx_custom_prompt_templates_category (category),
                    KEY idx_custom_prompt_templates_sort_order (sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS selected_prompt_templates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    template_key VARCHAR(100) NOT NULL,
                    is_selected TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_user_selected_template (user_id, template_key),
                    KEY idx_selected_prompt_templates_user_id (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            _ensure_timestamp_columns("prompt_templates")
            _ensure_timestamp_columns("custom_prompt_templates")
            _ensure_timestamp_columns("selected_prompt_templates")

            cursor.execute("DROP VIEW IF EXISTS user_prompt_templates")
            cursor.execute(
                """
                CREATE VIEW user_prompt_templates AS
                SELECT
                    u.id AS user_id,
                    pt.template_key,
                    pt.name,
                    pt.description,
                    pt.category,
                    pt.content,
                    pt.variables,
                    FALSE AS is_custom,
                    COALESCE(spt.is_selected, FALSE) AS is_selected
                FROM users u
                JOIN prompt_templates pt
                    ON pt.is_active = TRUE
                LEFT JOIN selected_prompt_templates spt
                    ON spt.user_id = u.id AND spt.template_key = pt.template_key
                UNION ALL
                SELECT
                    cpt.user_id AS user_id,
                    cpt.template_key,
                    cpt.name,
                    cpt.description,
                    cpt.category,
                    cpt.content,
                    cpt.variables,
                    TRUE AS is_custom,
                    COALESCE(spt.is_selected, FALSE) AS is_selected
                FROM custom_prompt_templates cpt
                LEFT JOIN selected_prompt_templates spt
                    ON spt.user_id = cpt.user_id AND spt.template_key = cpt.template_key
                WHERE cpt.is_active = TRUE
                """
            )

            default_templates = [
                (
                    "pw_structured_prompt",
                    "Prompt Crafter - Structured Prompt",
                    "Generate a structured, complete prompt with clear sections",
                    "prompt_crafter",
                    """You are an expert prompt engineer.

Task: Construct an improved prompt for an LLM based on:
- The user's original prompt
- The provided analysis results

Rules:
- Only write the prompt. Do not execute the task described by the prompt.
- If the original prompt contains Examples or Source Text, preserve them verbatim.
- Prefer explicit requirements over inferred ones when uncertain.

Output format (write the final prompt only):

# Role
Assign the most suitable role for the assistant.

# Task Objective
Describe the main objective in 1-3 sentences.

# Context
Add any necessary background and assumptions.

# Requirements
List must-have requirements and optional preferences (clearly labeled).

# Steps
Provide an actionable step-by-step plan the assistant should follow.

# Output Format
Specify the expected structure, sections, and any formatting requirements.

# Constraints
Include prohibitions, boundaries, and quality checks.""",
                    None,
                    1001,
                ),
                (
                    "pw_framework_task_role_cognitive_flow",
                    "Prompt Crafter - Task/Role/Cognitive/Flow Framework",
                    "A prompt framework with Task Objective, Role, Cognitive settings, Task flow, and controls",
                    "prompt_crafter",
                    """Use this framework to write the final prompt (output the final prompt only):

# Task Objective
Concise statement of the core objective. Must include.

# Source Text
Include only when the task needs a source text (e.g., translation, polishing). Preserve verbatim when present.

# Role Setting
Assign the most suitable identity to the assistant. Must include.

# Cognitive Settings
- Knowledge Anchors: Core concepts/data that must be referenced (separate by semicolons). Must include.
- Behavioral Anchors: Desired action instructions. Must include.
- Emotional Anchors: Tone to convey (adjectives). Must include.

# Task Flow
- Main Task:
  - Subtask 1:
    - Step 1:
    - Step 2:
  - Subtask 2:
    - Step 1:
    - Step 2:
Must include.

# Cognitive Expansion
Optional divergent thinking methods (when useful).

# Output Control
- Format Specifications: Structural output requirements. Must include.
- Prohibitions: Content prohibited in results. Must include.

# Examples
Optional. When examples exist in the user's prompt, preserve them verbatim.""",
                    None,
                    1002,
                ),
            ]

            for (
                template_key,
                name,
                description,
                category,
                content,
                variables,
                sort_order,
            ) in default_templates:
                cursor.execute(
                    """
                    INSERT INTO prompt_templates
                        (template_key, name, description, category, content, variables, is_active, sort_order)
                    SELECT %s, %s, %s, %s, %s, %s, TRUE, %s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM prompt_templates WHERE template_key = %s
                    )
                    """,
                    (
                        template_key,
                        name,
                        description,
                        category,
                        content,
                        variables,
                        sort_order,
                        template_key,
                    ),
                )

            cursor.execute(
                """
                INSERT INTO selected_prompt_templates (user_id, template_key, is_selected, created_at, updated_at)
                SELECT u.id, pt.template_key, TRUE, NOW(), NOW()
                FROM users u
                JOIN prompt_templates pt ON pt.is_active = TRUE
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM selected_prompt_templates spt
                    WHERE spt.user_id = u.id AND spt.template_key = pt.template_key
                )
                """
            )

            connection.commit()
            _prompt_template_schema_initialized = True
            _prompt_template_schema_last_error = None
        except Error as e:
            _prompt_template_schema_last_error = str(e)
            logging.error(
                f"Failed to ensure prompt template schema: {_prompt_template_schema_last_error}"
            )
            try:
                connection.rollback()
            except Exception:
                pass
            return False, _prompt_template_schema_last_error
        finally:
            if cursor:
                cursor.close()
            connection.close()
        return True, None


@app.route("/api/sessions", methods=["GET"])
def get_sessions():
    """Obtain all conversations"""
    user_id = request.args.get("user_id", 1)

    query = """
    SELECT s.*, COUNT(m.id) as message_count, MAX(m.timestamp) as last_message_time
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.session_id
    WHERE s.user_id = %s
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    """

    sessions = db.execute_query(query, (user_id,))

    for session in sessions:
        if session["created_at"]:
            session["created_at"] = session["created_at"].isoformat()
        if session["updated_at"]:
            session["updated_at"] = session["updated_at"].isoformat()
        if session["last_message_time"]:
            session["last_message_time"] = session["last_message_time"].isoformat()

    return jsonify(sessions)


@app.route("/api/sessions", methods=["POST"])
def create_session():
    """Create a new session"""
    data = request.get_json()
    user_id = data.get("user_id", 1)
    name = data.get(
        "name", f'Conversation {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
    )
    current_step = data.get("current_step") or data.get("step") or "structure"

    session_id = str(uuid.uuid4())

    query = """
    INSERT INTO sessions (id, user_id, name, current_step)
    VALUES (%s, %s, %s, %s)
    """

    if db.execute_update(query, (session_id, user_id, name, current_step)):
        return (
            jsonify({"id": session_id, "name": name, "current_step": current_step}),
            201,
        )
    else:
        return jsonify({"error": "Failed to create a session"}), 500


@app.route("/api/sessions/<session_id>", methods=["PUT"])
def update_session(session_id):
    """Update session"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is empty"}), 400

    name = data.get("name")
    step = data.get("step") or data.get("current_step")
    has_error = data.get("has_error")
    error_message = data.get("error_message")
    error_step = data.get("error_step")
    retry_data = data.get("retry_data")

    updates = []
    params = []

    if name is not None:
        updates.append("name = %s")
        params.append(name)

    if step is not None:
        updates.append("current_step = %s")
        params.append(step)

    if has_error is not None:
        updates.append("has_error = %s")
        params.append(has_error)

    if error_message is not None:
        updates.append("error_message = %s")
        params.append(error_message)

    if error_step is not None:
        updates.append("error_step = %s")
        params.append(error_step)

    if retry_data is not None:
        updates.append("retry_data = %s")
        params.append(retry_data)

    if not updates:
        return jsonify({"error": "No update data provided"}), 400

    updates.append("updated_at = NOW()")
    params.append(session_id)
    query = f"UPDATE sessions SET {', '.join(updates)} WHERE id = %s"

    if db.execute_update(query, tuple(params)):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to update session"}), 500


@app.route("/api/sessions/<session_id>", methods=["DELETE"])
def delete_session(session_id):
    """Delete Session Request"""
    query = "DELETE FROM sessions WHERE id = %s"

    if db.execute_update(query, (session_id,)):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to delete session"}), 500


@app.route("/api/sessions/<session_id>/messages", methods=["GET"])
def get_messages(session_id):
    """Obtain the session message"""
    query = """
    SELECT * FROM messages 
    WHERE session_id = %s 
    ORDER BY timestamp ASC
    """

    messages = db.execute_query(query, (session_id,))

    # Convert the time format and process metadata、content
    for message in messages:
        if message["timestamp"]:
            message["timestamp"] = message["timestamp"].isoformat()
        if message["metadata"]:
            message["metadata"] = json.loads(message["metadata"])
        if message["content"]:
            try:
                parsed_content = json.loads(message["content"])
                message["content"] = parsed_content
            except (json.JSONDecodeError, TypeError):
                pass

    return messages


@app.route("/api/sessions/<session_id>/messages", methods=["POST"])
def add_message(session_id):
    """Add a message to the session"""
    data = request.get_json()
    message_type = data.get("type")
    content = data.get("content")
    step = data.get("step")
    metadata = data.get("metadata", {})
    thinking = data.get("thinking")

    if not message_type or not content:
        return jsonify({"error": "Message type and content cannot be empty"}), 400

    if isinstance(content, dict):
        try:
            content = json.dumps(content, ensure_ascii=False)
        except Exception as e:
            return jsonify({"error": f"Content serialization failed: {str(e)}"}), 400

    try:
        def sanitize_metadata(obj):
            if isinstance(obj, dict):
                return {k: sanitize_metadata(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [sanitize_metadata(item) for item in obj]
            elif isinstance(obj, (str, int, float, bool)) or obj is None:
                return obj
            else:
                return str(obj)

        sanitized_metadata = sanitize_metadata(metadata)
        metadata_json = json.dumps(sanitized_metadata)
    except Exception as e:
        return jsonify({"error": f"Metadata serialization failed: {str(e)}"}), 400

    connection = None
    try:
        connection = db.get_connection()
        cursor = connection.cursor(dictionary=True)
        query = """
        INSERT INTO messages (session_id, type, content, step, metadata, thinking)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        cursor.execute(
            query, (session_id, message_type, content, step, metadata_json, thinking)
        )
        message_id = cursor.lastrowid
        connection.commit()

        select_query = "SELECT * FROM messages WHERE id = %s"
        cursor.execute(select_query, (message_id,))
        new_message = cursor.fetchone()
        cursor.close()

        if new_message:
            if new_message["timestamp"]:
                new_message["timestamp"] = new_message["timestamp"].isoformat()
            if new_message["metadata"]:
                new_message["metadata"] = json.loads(new_message["metadata"])

            return jsonify(new_message), 201
        else:
            return jsonify({"error": "Failed to create message"}), 500
    except Exception as e:
        logging.error(f"Add message error: {e}")
        if connection:
            connection.rollback()
        return jsonify({"error": f"Add message failed: {str(e)}"}), 500
    finally:
        if connection:
            connection.close()


@app.route("/api/messages/<message_id>", methods=["PUT"])
def update_message(message_id):
    """Update the message content"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    content = data.get("content")
    metadata = data.get("metadata")
    thinking = data.get("thinking")

    update_fields = []
    update_values = []

    if content is not None:
        update_fields.append("content = %s")
        update_values.append(content)

    if metadata is not None:
        update_fields.append("metadata = %s")
        try:
            metadata_json = json.dumps(metadata)
            update_values.append(metadata_json)
        except Exception as e:
            return jsonify({"error": f"Metadata serialization failed: {str(e)}"}), 400

    if thinking is not None:
        update_fields.append("thinking = %s")
        update_values.append(thinking)

    if not update_fields:
        return jsonify({"error": "No content to update"}), 400

    update_values.append(message_id)

    query = f"""
    UPDATE messages 
    SET {', '.join(update_fields)}
    WHERE id = %s
    """

    try:
        if db.execute_update(query, tuple(update_values)):
            return jsonify({"success": True, "message": "Message updated successfully"})
        else:
            return jsonify({"error": "Message update failed"}), 500
    except Exception as e:
        # 更新消息错误
        return jsonify({"error": f"Update message failed: {str(e)}"}), 500


@app.route("/api/analysis-methods", methods=["GET"])
def get_analysis_methods():
    """Get all analysis methods (default + custom)"""
    user_id = request.args.get("user_id", 1)

    query = "SELECT * FROM user_analysis_methods WHERE user_id = %s ORDER BY is_custom, method_key"
    methods = db.execute_query(query, (user_id,))

    return jsonify(methods)


@app.route("/api/analysis-methods", methods=["POST"])
def create_custom_method():
    """Create custom analysis methods"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    user_id = data.get("user_id", 1)
    label = data.get("label")
    description = data.get("description")

    if not label or not description:
        return jsonify({"error": "Label and description cannot be empty"}), 400

    method_key = f"custom_{int(datetime.now().timestamp() * 1000)}"

    query1 = """
    INSERT INTO custom_analysis_methods (user_id, method_key, label, description)
    VALUES (%s, %s, %s, %s)
    """

    query2 = """
    INSERT INTO selected_analysis_methods (user_id, method_key, is_selected)
    VALUES (%s, %s, TRUE)
    """

    if db.execute_update(query1, (user_id, method_key, label, description)):
        db.execute_update(query2, (user_id, method_key))
        return (
            jsonify(
                {
                    "method_key": method_key,
                    "label": label,
                    "description": description,
                    "is_custom": True,
                    "is_selected": True,
                }
            ),
            201,
        )
    else:
        return jsonify({"error": "Create custom method failed"}), 500


@app.route("/api/analysis-methods/<method_key>", methods=["PUT"])
def update_custom_method(method_key):
    """Update the custom analysis method"""
    data = request.get_json()
    user_id = data.get("user_id", 1)
    label = data.get("label")
    description = data.get("description")

    if not label or not description:
        return jsonify({"error": "Label and description cannot be empty"}), 400

    query = """
    UPDATE custom_analysis_methods 
    SET label = %s, description = %s
    WHERE user_id = %s AND method_key = %s
    """

    if db.execute_update(query, (label, description, user_id, method_key)):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Update custom method failed"}), 500


@app.route("/api/analysis-methods/<method_key>", methods=["DELETE"])
def delete_custom_method(method_key):
    """Delete custom analysis methods"""
    user_id = request.args.get("user_id", 1)

    db.execute_update(
        "DELETE FROM selected_analysis_methods WHERE user_id = %s AND method_key = %s",
        (user_id, method_key),
    )

    query = "DELETE FROM custom_analysis_methods WHERE user_id = %s AND method_key = %s"

    if db.execute_update(query, (user_id, method_key)):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Delete custom method failed"}), 500


def get_user_settings(user_id=1):
    """Obtain user Settings directly from the database"""
    query = "SELECT setting_key, setting_value FROM user_settings WHERE user_id = %s"
    settings_rows = db.execute_query(query, (user_id,))

    settings = {}
    for row in settings_rows:
        settings[row["setting_key"]] = json.loads(row["setting_value"])

    return settings


@app.route("/api/login", methods=["POST"])
def login():
    """users login"""
    data = request.get_json()

    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Username and password are required"}), 400

    username = data["username"]
    password = data["password"]

    query = (
        "SELECT id, username, email FROM users WHERE username = %s AND password = %s"
    )
    users = db.execute_query(query, (username, password))

    if users:
        user = users[0]
        return jsonify(
            {
                "success": True,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                },
            }
        )
    else:
        return jsonify({"error": "Invalid username or password"}), 401


@app.route("/api/users", methods=["GET"])
def get_users():
    """Obtain the list of all users (for selection on the login interface)"""
    query = "SELECT id, username, email FROM users ORDER BY username"
    users = db.execute_query(query)
    return jsonify(users)


@app.route("/api/register", methods=["POST"])
def register():
    """user registration"""
    data = request.get_json()

    if (
        not data
        or "username" not in data
        or "password" not in data
        or "email" not in data
    ):
        return jsonify({"error": "Username, password and email are required"}), 400

    username = data["username"]
    password = data["password"]
    email = data["email"]

    # Check whether the user name already exists
    check_query = "SELECT id FROM users WHERE username = %s"
    existing_users = db.execute_query(check_query, (username,))

    if existing_users:
        return jsonify({"error": "Username already exists"}), 409

    # Check if the email address already exists
    email_check_query = "SELECT id FROM users WHERE email = %s"
    existing_emails = db.execute_query(email_check_query, (email,))

    if existing_emails:
        return jsonify({"error": "Email already exists"}), 409

    # Create a new user
    insert_query = "INSERT INTO users (username, password, email) VALUES (%s, %s, %s)"
    success = db.execute_update(insert_query, (username, password, email))

    if success:
        # Obtain the information of newly created users
        user_query = "SELECT id, username, email FROM users WHERE username = %s"
        new_user = db.execute_query(user_query, (username,))

        if new_user:
            return jsonify(
                {
                    "success": True,
                    "user": {
                        "id": new_user[0]["id"],
                        "username": new_user[0]["username"],
                        "email": new_user[0]["email"],
                    },
                }
            )

    return jsonify({"error": "Failed to create user"}), 500


@app.route("/api/users", methods=["POST"])
def create_user():
    """Create a new user (Administrator Function)"""
    data = request.get_json()

    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Username and password are required"}), 400

    username = data["username"]
    password = data["password"]
    email = data.get("email", "")

    check_query = "SELECT id FROM users WHERE username = %s"
    existing_users = db.execute_query(check_query, (username,))

    if existing_users:
        return jsonify({"error": "Username already exists"}), 409

    insert_query = "INSERT INTO users (username, password, email) VALUES (%s, %s, %s)"
    success = db.execute_update(insert_query, (username, password, email))

    if success:
        user_query = "SELECT id, username, email FROM users WHERE username = %s"
        new_user = db.execute_query(user_query, (username,))

        if new_user:
            return jsonify(
                {
                    "success": True,
                    "user": {
                        "id": new_user[0]["id"],
                        "username": new_user[0]["username"],
                        "email": new_user[0]["email"],
                    },
                }
            )

    return jsonify({"error": "Failed to create user"}), 500


@app.route("/api/settings", methods=["GET"])
def get_settings():
    user_id = request.args.get("user_id", 1)
    settings = get_user_settings(user_id)
    return jsonify(settings)


@app.route("/api/settings", methods=["PUT"])
def update_settings():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    user_id = data.get("user_id", 1)
    settings = data.get("settings", {})


    for key, value in settings.items():
        query = """
        INSERT INTO user_settings (user_id, setting_key, setting_value)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE setting_value = %s
        """

        json_value = json.dumps(value)
        db.execute_update(query, (user_id, key, json_value, json_value))

    return jsonify({"success": True})


@app.route("/api/selected-methods", methods=["GET"])
def get_selected_methods():
    user_id = request.args.get("user_id", 1)

    query = """
    SELECT method_key FROM selected_analysis_methods 
    WHERE user_id = %s AND is_selected = TRUE
    """

    methods = db.execute_query(query, (user_id,))
    method_keys = [method["method_key"] for method in methods]

    return jsonify(method_keys)


@app.route("/api/selected-methods", methods=["POST"])
def save_selected_methods():
    data = request.get_json()
    user_id = data.get("user_id", 1)
    method_keys = data.get("methods", [])

    connection = db.get_connection()
    if not connection:
        return jsonify({"error": "Database connection failed"}), 500

    cursor = None
    try:
        cursor = connection.cursor(buffered=True)
        cursor.callproc("SaveUserSelectedMethods", [user_id, json.dumps(method_keys)])
        connection.commit()
        return jsonify({"success": True})
    except Error as e:
        logging.error(f"Save selected methods error: {e}")
        if connection:
            connection.rollback()
        return jsonify({"error": "Save selected methods failed"}), 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/prompt-templates", methods=["GET"])
def get_prompt_templates():
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    user_id = request.args.get("user_id", 1)
    category = request.args.get("category")

    params: list = [user_id]
    category_filter_sql = ""
    if category:
        category_filter_sql = " AND category = %s"
        params.append(category)

    query = f"""
    SELECT *
    FROM user_prompt_templates
    WHERE user_id = %s{category_filter_sql}
    ORDER BY is_custom, template_key
    """

    templates = db.execute_query(query, tuple(params))
    return jsonify(templates)


@app.route("/api/prompt-templates", methods=["POST"])
def create_custom_prompt_template():
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    user_id = data.get("user_id", 1)
    name = data.get("name")
    description = data.get("description")
    category = data.get("category")
    content = data.get("content")
    variables = data.get("variables")

    if not name or not content:
        return jsonify({"error": "Name and content cannot be empty"}), 400

    template_key = f"custom_{int(datetime.now().timestamp() * 1000)}"

    variables_json = None
    if isinstance(variables, list):
        variables_json = json.dumps(variables, ensure_ascii=False)
    elif isinstance(variables, str):
        variables_json = variables

    query1 = """
    INSERT INTO custom_prompt_templates (
        user_id,
        template_key,
        name,
        description,
        category,
        content,
        variables,
        is_active,
        sort_order,
        created_at,
        updated_at
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, 0, NOW(), NOW())
    """

    query2 = """
    INSERT INTO selected_prompt_templates (user_id, template_key, is_selected, created_at, updated_at)
    VALUES (%s, %s, TRUE, NOW(), NOW())
    """

    connection = db.get_connection()
    if not connection:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = None
    try:
        cursor = connection.cursor(buffered=True)
        cursor.execute(
            query1,
            (
                user_id,
                template_key,
                name,
                description,
                category,
                content,
                variables_json,
            ),
        )
        cursor.execute(query2, (user_id, template_key))
        connection.commit()
    except Error as e:
        try:
            connection.rollback()
        except Exception:
            pass
        return (
            jsonify(
                {
                    "error": "Create custom prompt template failed",
                    "detail": str(e),
                }
            ),
            500,
        )
    finally:
        if cursor:
            cursor.close()
        connection.close()

    return (
        jsonify(
            {
                "template_key": template_key,
                "name": name,
                "description": description,
                "category": category,
                "content": content,
                "variables": variables_json,
                "is_custom": True,
                "is_selected": True,
            }
        ),
        201,
    )


@app.route("/api/prompt-templates/<template_key>", methods=["PUT"])
def update_custom_prompt_template(template_key):
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    user_id = data.get("user_id", 1)
    name = data.get("name")
    description = data.get("description")
    category = data.get("category")
    content = data.get("content")
    variables = data.get("variables")

    if not name or not content:
        return jsonify({"error": "Name and content cannot be empty"}), 400

    variables_json = None
    if isinstance(variables, list):
        variables_json = json.dumps(variables, ensure_ascii=False)
    elif isinstance(variables, str):
        variables_json = variables

    query = """
    UPDATE custom_prompt_templates
    SET name = %s, description = %s, category = %s, content = %s, variables = %s
    WHERE user_id = %s AND template_key = %s
    """

    if db.execute_update(
        query,
        (
            name,
            description,
            category,
            content,
            variables_json,
            user_id,
            template_key,
        ),
    ):
        return jsonify({"success": True})
    return jsonify({"error": "Update custom prompt template failed"}), 500


@app.route("/api/prompt-templates/<template_key>", methods=["DELETE"])
def delete_custom_prompt_template(template_key):
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    user_id = request.args.get("user_id", 1)

    db.execute_update(
        "DELETE FROM selected_prompt_templates WHERE user_id = %s AND template_key = %s",
        (user_id, template_key),
    )

    query = "DELETE FROM custom_prompt_templates WHERE user_id = %s AND template_key = %s"
    if db.execute_update(query, (user_id, template_key)):
        return jsonify({"success": True})
    return jsonify({"error": "Delete custom prompt template failed"}), 500


@app.route("/api/selected-prompt-templates", methods=["GET"])
def get_selected_prompt_templates():
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    user_id = request.args.get("user_id", 1)
    category = request.args.get("category")

    params: List[Any] = [user_id]
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
    template_keys = [row["template_key"] for row in rows]
    return jsonify(template_keys)


@app.route("/api/selected-prompt-templates", methods=["POST"])
def save_selected_prompt_templates():
    ok, err = _ensure_prompt_template_schema()
    if not ok:
        return jsonify({"error": "Prompt template schema init failed", "detail": err}), 500
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    user_id = data.get("user_id", 1)
    template_keys = data.get("templates", [])

    connection = db.get_connection()
    if not connection:
        return jsonify({"error": "Database connection failed"}), 500

    cursor = None
    try:
        cursor = connection.cursor(buffered=True)
        cursor.callproc(
            "SaveUserSelectedPromptTemplates",
            [user_id, json.dumps(template_keys, ensure_ascii=False)],
        )
        connection.commit()
        return jsonify({"success": True})
    except Error as e:
        logging.error(f"Save selected prompt templates error: {e}")
        if connection:
            try:
                connection.rollback()
            except Exception:
                pass

        try:
            cursor = connection.cursor(buffered=True)
            cursor.execute(
                "DELETE FROM selected_prompt_templates WHERE user_id = %s",
                (user_id,),
            )
            for template_key in template_keys:
                cursor.execute(
                    """
                    INSERT INTO selected_prompt_templates (user_id, template_key, is_selected)
                    VALUES (%s, %s, TRUE)
                    """,
                    (user_id, template_key),
                )
            connection.commit()
            return jsonify({"success": True})
        except Error:
            return (
                jsonify(
                    {
                        "error": "Save selected prompt templates failed",
                        "detail": str(e),
                    }
                ),
                500,
            )
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        connection = db.get_connection()
        if connection:
            connection.close()
            return jsonify({"status": "healthy", "database": "connected"})
        else:
            return jsonify({"status": "unhealthy", "database": "disconnected"}), 500
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500


if __name__ == "__main__":
    # Test the database connection pool
    test_connection = db.get_connection()
    if test_connection:
        test_connection.close()
        logging.info(
            "Database connection pool initialized successfully, service started"
        )
        app.run(debug=config.debug, port=config.flask_port, host=config.flask_host)
    else:
        logging.error(
            "Database connection pool initialization failed, please check the configuration"
        )
