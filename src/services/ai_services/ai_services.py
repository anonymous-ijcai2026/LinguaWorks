import json
from typing import Any, Dict
import requests
import urllib3
from src.api.database_api import DatabaseManager

# Suppress SSL warnings when verification is disabled
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

MODEL_CONFIG_MISSING_MESSAGE = (
    "AI model configuration not found in database. "
    "Please configure the model settings in the frontend interface first."
)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


class AIServiceError(Exception):
    """Custom exception class for AI service errors"""

    pass


class AIServices:
    def __init__(self, user_id: int = 1):
        """
        Initialize AI service class
        :param user_id: User ID for database configuration
        """
        self.user_id = user_id
        self.db = None
        self.models_config: Dict[str, Dict] = {}
        self.current_model: str = ""
        self.current_config: Dict = {}
        self._init_database()
        self._load_config()

    def _init_database(self):
        """Initialize database connection"""
        try:
            self.db = DatabaseManager()
        except Exception as e:
            print(f"Warning: Failed to initialize database connection: {e}")
            self.db = None

    def _load_config_from_database(self) -> Dict[str, Any]:
        """Load model configuration from database"""
        if not self.db:
            return {}

        try:
            query = (
                "SELECT setting_key, setting_value FROM user_settings "
                "WHERE user_id = %s "
                "AND setting_key IN "
                "('modelApiUrl', 'modelApiKey', 'modelName')"
            )
            settings_rows = self.db.execute_query(query, (self.user_id,))

            settings = {}
            for row in settings_rows:
                settings[row["setting_key"]] = json.loads(row["setting_value"])

            # Check if we have all required settings
            if (
                "modelApiUrl" in settings
                and "modelApiKey" in settings
                and "modelName" in settings
            ):
                # Convert database settings to AIServices format
                api_url = settings["modelApiUrl"].rstrip("/")
                if not api_url.endswith("/v1"):
                    api_url += "/v1"

                db_config = {
                    "database_model": {
                        "api_key": settings["modelApiKey"],
                        "base_url": api_url,
                        "endpoint": "/chat/completions",
                        "model_name": settings["modelName"],
                        "response_path": "choices[0].message.content",
                    }
                }
                return db_config

        except Exception as e:
            print(f"Warning: Failed to load config from database: {e}")

        return {}

    def _load_config(self):
        """Load and validate configuration from database only"""
        # Load from database
        db_config = self._load_config_from_database()

        if db_config:
            # 从数据库加载模型配置
            self.models_config = db_config
            # Set the database model as current
            self.set_model("database_model")
            return

        # No fallback - raise error if database config is not available
        raise AIServiceError(MODEL_CONFIG_MISSING_MESSAGE)

    def set_model(self, model_name: str):
        """
        Set current model
        :param model_name: Model name defined in configuration file
        """
        if model_name not in self.models_config:
            raise AIServiceError(
                f"Model {model_name} not defined in configuration"
            )

        config = self.models_config[model_name]

        # Validate required configuration items
        required_keys = [
            "api_key",
            "base_url",
            "endpoint",
            "model_name",
            "response_path",
        ]
        missing = [key for key in required_keys if key not in config]
        if missing:
            raise AIServiceError(
                f"Model {model_name} missing required configuration items: "
                f"{missing}"
            )

        self.current_model = model_name
        self.current_config = config

    def call(
        self,
        messages: list,
        temperature: float = 0.3,
        **kwargs,
    ) -> str:
        """
        Call current model's API
        :param messages: Message list in format
            [{"role": "user", "content": "..."}]
        :param temperature: Generation temperature parameter
        :return: Text content from API response
        """
        if not self.current_model:
            raise AIServiceError(
                "No model selected, please set model using set_model() first"
            )

        try:
            # Construct request parameters
            base_url = self.current_config["base_url"]
            endpoint = self.current_config["endpoint"]
            url = f"{base_url}{endpoint}"
            api_key = self.current_config["api_key"].strip()
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": DEFAULT_USER_AGENT,
            }

            payload = {
                "model": self.current_config["model_name"],
                "messages": messages,
                "temperature": temperature,
                **kwargs,
            }

            # Send request with SSL error handling and retry mechanism
            max_retries = 3
            for attempt in range(max_retries):
                print(
                    f"[AI_SERVICES_QUERY] Attempt {attempt + 1} to call model "
                    f"\n{self.current_model}, the messages: {messages}"
                )
                try:
                    # Add SSL verification settings and timeout
                    response = requests.post(
                        url,
                        headers=headers,
                        json=payload,
                        timeout=30,
                        verify=True,
                    )
                    response.raise_for_status()
                    print(
                        f"\n[AI_SERVICES_RESPONSE] Response: {response.json()['choices'][0]['message']['content']}"
                    )

                    # Parse response
                    return self._parse_response(response.json())

                except requests.exceptions.SSLError as ssl_e:
                    if attempt < max_retries - 1:
                        continue
                    else:
                        try:
                            response = requests.post(
                                url,
                                headers=headers,
                                json=payload,
                                timeout=30,
                                verify=False,
                            )
                            response.raise_for_status()
                            return self._parse_response(response.json())
                        except Exception as fallback_e:
                            detail = (
                                "SSL connection failed after "
                                f"{max_retries} attempts. "
                                "This may be due to: 1) API "
                                "server SSL configuration issues, 2) "
                                "Network proxy/firewall blocking, 3) "
                                "Local SSL certificate "
                                "problems. Original SSL error: "
                                f"{str(ssl_e)}. Fallback attempt also failed: "
                                f"{str(fallback_e)}"
                            )
                            raise AIServiceError(
                                detail
                            )

                except requests.exceptions.ConnectionError as conn_e:
                    if attempt < max_retries - 1:
                        continue
                    else:
                        raise AIServiceError(
                            "Connection failed after "
                            f"{max_retries} attempts: {str(conn_e)}"
                        )

        except requests.exceptions.HTTPError as e:
            error_msg = f"{e.response.status_code} Error: {e.response.text}"
            raise AIServiceError(f"API request failed: {error_msg}")
        except requests.exceptions.RequestException as e:
            raise AIServiceError(f"Network error: {str(e)}")

    def _parse_response(self, response_data: Dict) -> str:
        """Parse result based configured response path"""
        path = self.current_config["response_path"]
        keys = path.replace("[", ".[").split(".")

        current = response_data
        for key in keys:
            if key.startswith("[") and key.endswith("]"):
                index = int(key[1:-1])
                current = current[index] if index < len(current) else None
            else:
                current = current.get(key, None)

            if current is None:
                break

        if not isinstance(current, str):
            raise AIServiceError("Failed to parse text content from response")

        return current

    def get_available_models(self) -> list:
        """Get list of available models"""
        return list(self.models_config.keys())

    def validate_model_config(self) -> Dict[str, Any]:
        """Validate current model configuration
        Returns:
            Dict with 'valid' (bool), 'message' (str),
            and 'missing_fields' (list)
        """
        if not self.current_model:
            return {
                "valid": False,
                "message": (
                    "No model selected. Please configure model settings first."
                ),
                "missing_fields": ["model_selection"],
            }

        config = self.current_config
        missing_fields = []

        # Check required fields
        base_url = config.get("base_url")
        if not base_url or base_url.strip() == "":
            missing_fields.append("API URL")
        api_key = config.get("api_key")
        if not api_key or api_key.strip() == "":
            missing_fields.append("API Key")
        model_name = config.get("model_name")
        if not model_name or model_name.strip() == "":
            missing_fields.append("Model Name")

        if missing_fields:
            return {
                "valid": False,
                "message": (
                    "Model configuration incomplete. Missing: "
                    f'{", ".join(missing_fields)}. '
                    "Please configure in Settings."
                ),
                "missing_fields": missing_fields,
            }

        return {
            "valid": True,
            "message": "Model configuration is valid",
            "missing_fields": [],
        }

    def validate_analysis_config(self) -> Dict[str, Any]:
        """Validate analysis configuration for Insight Decoder step
        Returns:
            Dict with 'valid' (bool), 'message' (str),
            and 'missing_fields' (list)
        """
        try:
            # Check if there are any selected analysis methods
            if not self.db:
                return {
                    "valid": False,
                    "message": "Database connection not available",
                    "missing_fields": ["analysis_methods"],
                }

            query = """
            SELECT method_key FROM selected_analysis_methods
            WHERE user_id = %s AND is_selected = TRUE
            """

            methods = self.db.execute_query(query, (self.user_id,))
            selected_methods = [method["method_key"] for method in methods]

            if not selected_methods:
                return {
                    "valid": False,
                    "message": (
                        "No analysis methods selected. "
                        "Please configure analysis methods "
                        "in Settings before using Insight Decoder."
                    ),
                    "missing_fields": ["analysis_methods"],
                }

            return {
                "valid": True,
                "message": "Analysis configuration is valid",
                "missing_fields": [],
            }

        except Exception as e:
            return {
                "valid": False,
                "message": (
                    "Failed to validate analysis configuration: "
                    f"{str(e)}"
                ),
                "missing_fields": ["analysis_methods"],
            }

    def reload_config_from_database(self):
        """Reload configuration from database"""
        db_config = self._load_config_from_database()

        if db_config:
            # 重新加载数据库模型配置
            self.models_config.update(db_config)
            # Set the database model as current if it exists
            if "database_model" in db_config:
                self.set_model("database_model")
            return True

        return False


# Usage example
if __name__ == "__main__":
    try:
        ai = AIServices()

        ai.set_model("gpt")
        response = ai.call(
            messages=[
                {"role": "system", "content": "You are a programmer"},
                {
                    "role": "user",
                    "content": (
                        "Hello! Do you know what the first line of code "
                        "most people write when learning programming?"
                    ),
                },
            ],
            temperature=0,
            max_tokens=100,
            top_p=0.9,
            stream=False,
        )

    except AIServiceError as e:
        print(f"AI service error: {e}")
    except Exception as e:
        print(f"unknown error: {e}")
