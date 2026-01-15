
import os
import sys
from typing import Dict, List, Any
from .base import get_config, AppConfig


class ConfigValidator:
    """Configuration validator"""

    def __init__(self):
        self.config = get_config()

    def validate_all(self) -> Dict[str, Any]:
        results = {"overall_valid": True, "checks": {}}

        checks = [
            ("env_file", self._check_env_file),
            ("required_fields", self._check_required_fields),
            ("database", self._check_database_config),
            ("ai_services", self._check_ai_services_config),
            ("security", self._check_security_config),
            ("directories", self._check_directories),
            ("ports", self._check_ports),
        ]

        for check_name, check_func in checks:
            try:
                check_result = check_func()
                results["checks"][check_name] = check_result
                if not check_result.get("valid", True):
                    results["overall_valid"] = False
            except Exception as e:
                results["checks"][check_name] = {"valid": False, "error": str(e)}
                results["overall_valid"] = False

        return results

    def _check_env_file(self) -> Dict[str, Any]:
        env_file_path = ".env"
        env_example_path = ".env.example"

        result = {"valid": True, "messages": []}

        if not os.path.exists(env_file_path):
            result["valid"] = False
            result["messages"].append(f"Environment file '{env_file_path}' not found")

            if os.path.exists(env_example_path):
                result["messages"].append(
                    f"Please copy '{env_example_path}' to '{env_file_path}' and configure it"
                )
            else:
                result["messages"].append(
                    "Please create a .env file with your configuration"
                )
        else:
            result["messages"].append("Environment file found")

        return result

    def _check_required_fields(self) -> Dict[str, Any]:
        return self.config.validate_required_fields()

    def _check_database_config(self) -> Dict[str, Any]:
        result = {"valid": True, "messages": []}

        if not self.config.db_host:
            result["valid"] = False
            result["messages"].append("Database host is not configured")

        if not self.config.db_name:
            result["valid"] = False
            result["messages"].append("Database name is not configured")

        if not self.config.db_user:
            result["valid"] = False
            result["messages"].append("Database user is not configured")

        try:
            db_url = self.config.database_url
            if not db_url.startswith("mysql"):
                result["valid"] = False
                result["messages"].append("Invalid database URL format")
            else:
                result["messages"].append("Database configuration appears valid")
        except Exception as e:
            result["valid"] = False
            result["messages"].append(f"Error building database URL: {str(e)}")

        return result

    def _check_ai_services_config(self) -> Dict[str, Any]:
        result = {"valid": True, "messages": []}

        if not self.config.openai_api_key and not self.config.testing_mode:
            result["messages"].append(
                "OpenAI API key is not configured (AI services may not work)"
            )

        if not self.config.openai_base_url:
            result["valid"] = False
            result["messages"].append("OpenAI base URL is not configured")

        if not self.config.default_model_name:
            result["valid"] = False
            result["messages"].append("Default model name is not configured")

        if result["valid"] and self.config.openai_api_key:
            result["messages"].append("AI services configuration appears valid")

        return result

    def _check_security_config(self) -> Dict[str, Any]:
        result = {"valid": True, "messages": []}

        if self.config.is_production:
            if self.config.secret_key == "dev-secret-key":
                result["valid"] = False
                result["messages"].append("SECRET_KEY must be changed in production")

            if not self.config.jwt_secret_key:
                result["valid"] = False
                result["messages"].append("JWT_SECRET_KEY must be set in production")

            if self.config.debug:
                result["messages"].append("WARNING: DEBUG is enabled in production")

        cors_origins = self.config.cors_origins_list
        if not cors_origins:
            result["messages"].append("No CORS origins configured")
        else:
            result["messages"].append(
                f"CORS configured for {len(cors_origins)} origins"
            )

        return result

    def _check_directories(self) -> Dict[str, Any]:

        result = {"valid": True, "messages": []}

        directories = [
            ("Upload directory", self.config.upload_path),
            ("Static directory", self.config.static_path),
            ("Log directory", os.path.dirname(self.config.log_file_path)),
        ]

        for name, path in directories:
            if not path:
                result["valid"] = False
                result["messages"].append(f"{name} path is not configured")
            elif not os.path.exists(path):
                try:
                    os.makedirs(path, exist_ok=True)
                    result["messages"].append(f"{name} created: {path}")
                except Exception as e:
                    result["valid"] = False
                    result["messages"].append(f"Cannot create {name.lower()}: {str(e)}")
            else:
                result["messages"].append(f"{name} exists: {path}")

        return result

    def _check_ports(self) -> Dict[str, Any]:
        result = {"valid": True, "messages": []}

        ports = [
            ("FastAPI", self.config.fastapi_port),
            ("Flask", self.config.flask_port),
            ("Frontend", self.config.frontend_port),
        ]

        used_ports = []
        for name, port in ports:
            if port in used_ports:
                result["valid"] = False
                result["messages"].append(
                    f"Port conflict: {name} port {port} is already used"
                )
            else:
                used_ports.append(port)
                result["messages"].append(f"{name} port: {port}")

        return result

    def print_validation_report(self):
        results = self.validate_all()

        print("=" * 60)
        print("Configuration Validation Report")
        print("=" * 60)

        if results["overall_valid"]:
            print("✅ Overall Status: VALID")
        else:
            print("❌ Overall Status: INVALID")

        print()

        for check_name, check_result in results["checks"].items():
            status = "✅" if check_result.get("valid", True) else "❌"
            print(f"{status} {check_name.replace('_', ' ').title()}")

            if "error" in check_result:
                print(f"   Error: {check_result['error']}")
            elif "messages" in check_result:
                for message in check_result["messages"]:
                    print(f"   - {message}")

            print()

        return results["overall_valid"]


def validate_config() -> bool:
    validator = ConfigValidator()
    return validator.print_validation_report()


if __name__ == "__main__":
    is_valid = validate_config()
    sys.exit(0 if is_valid else 1)
