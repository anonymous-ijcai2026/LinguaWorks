import json
from typing import List
from .basic_handler import BasicHandler
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import agent_prompt


class PromptGenerator(BasicHandler):
    def run(self, analysis_results: List, prompt: str, feedback: str = None) -> str:
        # Generating structured prompt

        user_message = f"The user's prompt\n{prompt}\nThe analysis result of user's prompt\n：{str(analysis_results)}\n"
        # If there is user feedback, add it to the message
        if feedback:
            if "The supplementary information" not in user_message:
                user_message = (
                    f"{user_message}\nThe supplementary information is:\n{feedback}"
                )
            else:
                user_message = f"{user_message}\n{feedback}"

        system_message = agent_prompt.structuring_prompt
        response = self.call_llm(system_message, user_message).replace("```", "")

        if "# Task Objective:" not in response:
            raise ValueError(
                "The generated prompt does not meet the requirements, missing critical parts"
            )
        return response
