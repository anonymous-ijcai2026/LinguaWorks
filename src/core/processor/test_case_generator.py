from .basic_handler import BasicHandler
from typing import List, Dict, Any


class TestCaseGenerator(BasicHandler):
    """
    Test case generator for generating appropriate test cases for system prompts
    """

    def generate_test_case(self, system_prompt: str) -> str:
        """
        Generate a test case (user message) based on system prompt
        :param system_prompt: System prompt
        :return: Generated test case
        """

        generator_system_message = """
You are a professional test case generator. Your task is to generate an appropriate user message to test the effectiveness of a given system prompt.

Generation Rules:
1. Analyze the role positioning, task requirements, and expected behavior of the system prompt
2. Generate a user message that can effectively trigger the system prompt's functionality
3. Test cases should be specific, practical problems or requests
4. Avoid test cases that are too simple or too complex
5. Ensure test cases can demonstrate the core capabilities of the system prompt

Please return the generated user message directly without any explanations or additional content.
        """

        user_message = f"Please generate a test case for the following system prompt:\n\n{system_prompt}"

        try:
            test_case = self.call_llm(generator_system_message, user_message)
            return test_case.strip()
        except Exception as e:
            # If generation fails, return a generic test case
            return "Please help me solve a problem."

    def generate_multiple_test_cases(
        self, system_prompt: str, count: int = 3
    ) -> List[str]:
        """
        Generate multiple test cases
        :param system_prompt: System prompt
        :param count: Number of test cases to generate
        :return: List of test cases
        """

        generator_system_message = f"""
You are a professional test case generator. Your task is to generate {count} different user messages to test the effectiveness of a given system prompt.

Generation Rules:
1. Analyze the role positioning, task requirements, and expected behavior of the system prompt
2. Generate {count} user messages that can effectively trigger the system prompt's functionality
3. Each test case should test different aspects or scenarios
4. Test cases should be specific, practical problems or requests
5. Avoid test cases that are too simple or too complex
6. Ensure test cases can demonstrate the core capabilities of the system prompt

Please return in the following format:
1. [First test case]
2. [Second test case]
3. [Third test case]
        """

        user_message = f"Please generate {count} test cases for the following system prompt:\n\n{system_prompt}"

        try:
            response = self.call_llm(generator_system_message, user_message)
            test_cases = []
            lines = response.strip().split("\n")
            for line in lines:
                line = line.strip()
                if line and (
                    line.startswith("1.")
                    or line.startswith("2.")
                    or line.startswith("3.")
                ):
                    test_case = line[2:].strip()
                    if test_case:
                        test_cases.append(test_case)

            # If parsing fails, generate default test cases
            if not test_cases:
                test_cases = [
                    "Please help me solve a problem.",
                    "I need your advice.",
                    "Please assist me with a task.",
                ][:count]

            return test_cases[:count]

        except Exception as e:
            # If generation fails, return generic test cases
            return [
                "Please help me solve a problem.",
                "I need your advice.",
                "Please assist me with a task.",
            ][:count]
