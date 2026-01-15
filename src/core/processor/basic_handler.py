import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services import ai_services


class BasicHandler:
    def __init__(self, ai_services: ai_services.AIServices):
        self.ai_server = ai_services

    def call_llm(self, system_message: str, user_message: str) -> str:
        """
        :param system_message: system message.
        :param user_message: user message.
        :return: LLMs' response.
        """
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]

        llm_response = self.ai_server.call(
            messages=messages,
            temperature=0,
        )

        return llm_response.strip().replace('"""', "")

    @staticmethod
    def remove_blank_lines(text: str) -> str:
        """
        # Filter out empty strings and lines of pure whitespace characters.
        :param text: Text to be optimized.
        :return: The processed text.
        """
        return "\n".join(line for line in text.splitlines() if line.strip())

    def test_prompt(self, prompt: str) -> str:
        """
        Generic method for testing prompts.
        :param prompt: The prompt to be tested.
        :return: The test result.
        """

        system_message = ""
        user_message = prompt
        try:
            test_result = self.call_llm(system_message, user_message)
            test_result = self.remove_blank_lines(test_result)

            return test_result
        except Exception as e:
            # Provide more user-friendly error messages
            error_str = str(e)
            if "SSL" in error_str:
                error_msg = "Network connection error: SSL certificate verification failed. This may be caused by network proxy, firewall settings, or API server configuration issues. Please check network connection or contact administrator."
            elif "Connection" in error_str:
                error_msg = "Network connection error: Unable to connect to AI service. Please check network connection and API configuration."
            elif "timeout" in error_str.lower():
                error_msg = "Request timeout: AI service response time is too long, please try again later."
            elif "401" in error_str or "Unauthorized" in error_str:
                error_msg = "Authentication failed: API key is invalid or expired, please check API configuration."
            elif "403" in error_str or "Forbidden" in error_str:
                error_msg = "Access denied: No permission to access this API service."
            elif "404" in error_str:
                error_msg = "Service not found: API endpoint does not exist, please check API configuration."
            elif "429" in error_str:
                error_msg = "Request frequency too high: API call limit reached, please try again later."
            elif "500" in error_str:
                error_msg = "Server internal error: AI service is temporarily unavailable, please try again later."
            else:
                error_msg = f"Test failed: {error_str}"

            # 错误信息记录
            return error_msg
