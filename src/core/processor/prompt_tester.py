from .basic_handler import BasicHandler


class PromptTester(BasicHandler):
    """Class specifically for testing prompts"""

    def __init__(self, ai_services):
        super().__init__(ai_services)

    def test_prompt(self, prompt: str) -> str:
        """
        Test prompt and return result
        :param prompt: Prompt to test
        :return: Test result
        """
        return super().test_prompt(prompt).replace('"""', "")
