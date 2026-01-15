from .basic_handler import BasicHandler
from .test_case_generator import TestCaseGenerator
from typing import Dict, Any


class SystemPromptTester(BasicHandler):
    """
    System Prompt tester for testing the effectiveness of system prompts
    """

    def __init__(self, ai_services):
        super().__init__(ai_services)
        self.test_case_generator = TestCaseGenerator(ai_services)

    def test_system_prompt(
        self, system_prompt: str, user_message: str = None
    ) -> Dict[str, Any]:
        """
        Test the effectiveness of system prompt
        :param system_prompt: System prompt
        :param user_message: User message, auto-generated if None
        :return: Test result dictionary containing test case and response
        """

        # If no user_message is provided, auto-generate one
        if user_message is None:
            user_message = self.test_case_generator.generate_test_case(system_prompt)

        try:
            # Call LLM with system prompt and user message
            response = self.call_llm(system_prompt, user_message)

            return {
                "system_prompt": system_prompt,
                "test_case": user_message,
                "response": response,
                "success": True,
            }

        except Exception as e:
            error_msg = f"Test failed: {str(e)}"
            return {
                "system_prompt": system_prompt,
                "test_case": user_message,
                "response": error_msg,
                "success": False,
                "error": str(e),
            }

    def compare_system_prompts(
        self, original_prompt: str, optimized_prompt: str, user_message: str = None
    ) -> Dict[str, Any]:
        """
        Compare the effectiveness of two system prompts
        :param original_prompt: Original prompt
        :param optimized_prompt: Optimized prompt
        :param user_message: User message, auto-generated if None
        :return: Comparison results
        """

        # If no user_message is provided, generate test case based on optimized prompt
        if user_message is None:
            user_message = self.test_case_generator.generate_test_case(optimized_prompt)

        # Test original prompt
        original_result = self.test_system_prompt(original_prompt, user_message)

        # Test optimized prompt
        optimized_result = self.test_system_prompt(optimized_prompt, user_message)

        return {
            "test_case": user_message,
            "original_result": {
                "prompt": original_prompt,
                "response": original_result["response"],
                "success": original_result["success"],
            },
            "optimized_result": {
                "prompt": optimized_prompt,
                "response": optimized_result["response"],
                "success": optimized_result["success"],
            },
        }

    def test_with_custom_message(
        self, system_prompt: str, custom_user_message: str
    ) -> Dict[str, Any]:
        """
        Test system prompt with custom user message
        :param system_prompt: System prompt
        :param custom_user_message: Custom user message
        :return: Test results
        """
        return self.test_system_prompt(system_prompt, custom_user_message)
