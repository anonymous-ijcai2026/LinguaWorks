from typing import Optional, Union, Dict, Any, List

import sys
import os

from .basic_handler import BasicHandler

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import agent_prompt


class PromptOptimizer(BasicHandler):
    def _call(self, messages: List[Dict[str, str]], temperature: float) -> str:
        response = self.ai_server.call(messages=messages, temperature=temperature)
        return response.strip().replace('"""', "")

    def optimize_prompt(
        self,
        prompt: str,
        optimization_system_prompt: str,
        *,
        temperature: float = 0.3,
    ) -> str:
        messages = [
            {"role": "system", "content": optimization_system_prompt},
            {
                "role": "user",
                "content": f"Please optimize the following prompt:\n\n{prompt}",
            },
        ]
        optimized_prompt = self._call(messages, temperature=temperature)
        return optimized_prompt.replace("```", "")

    def generate_thinking(
        self,
        *,
        original_prompt: str,
        optimized_prompt: str,
        temperature: float = 0.3,
    ) -> str:
        thinking_messages = [
            {"role": "system", "content": agent_prompt.optimization_thinking},
            {
                "role": "user",
                "content": (
                    f"Original Prompt:\n{original_prompt}\n\n"
                    f"Optimized Prompt:\n{optimized_prompt}"
                ),
            },
        ]
        return self._call(thinking_messages, temperature=temperature)

    def optimize_prompt_with_feedback(
        self,
        prompt: str,
        optimization_system_prompt: str,
        *,
        feedback: str,
        temperature: float = 0.3,
    ) -> str:
        messages = [
            {"role": "system", "content": optimization_system_prompt},
            {
                "role": "user",
                "content": (
                    "Please optimize the following prompt based on user feedback:\n\n"
                    f"Prompt: {prompt}\n\n"
                    f"User feedback: {feedback}"
                ),
            },
        ]
        optimized_prompt = self._call(messages, temperature=temperature)
        return optimized_prompt.replace("```", "")

    def run(
        self,
        prompt: str,
        optimization_system_prompt: str,
        *,
        feedback: Optional[str] = None,
        include_thinking: bool = True,
        temperature: float = 0.3,
    ) -> Union[Dict[str, Any], str]:
        if feedback:
            return self.optimize_prompt_with_feedback(
                prompt,
                optimization_system_prompt,
                feedback=feedback,
                temperature=temperature,
            )

        optimized_prompt = self.optimize_prompt(
            prompt,
            optimization_system_prompt,
            temperature=temperature,
        )

        thinking = (
            self.generate_thinking(
                original_prompt=prompt,
                optimized_prompt=optimized_prompt,
                temperature=temperature,
            )
            if include_thinking
            else ""
        )

        return {
            "optimized_prompt": optimized_prompt,
            "thinking": thinking,
            "original_prompt": prompt,
        }
