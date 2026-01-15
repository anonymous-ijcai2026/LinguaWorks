import json
import re
from typing import List
from tqdm import tqdm
from .basic_handler import BasicHandler
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import agent_prompt
from infrastructure.config.agent_mapping import get_all_agents, get_agent_info


class ElementsAnalyzer(BasicHandler):
    def run(
        self,
        prompt: str,
        feedback: str = None,
        selected_methods: List[str] = None,
        custom_methods: dict = None,
        auto_select: bool = False,
    ) -> List:

        all_agents = {
            "anchoring_target": agent_prompt.anchoring_target,
            "activate_role": agent_prompt.activate_role,
            "disassembly_task": agent_prompt.disassembly_task,
            "expand_thinking": agent_prompt.expand_thinking,
            "focus_subject": agent_prompt.focus_subject,
            "input_extract": agent_prompt.input_extract,
            "examples_extract": agent_prompt.examples_extract,
        }

        if auto_select or (selected_methods and "auto_select" in selected_methods):
            selected_methods = self._auto_select_methods(
                prompt, all_agents, custom_methods
            )
        elif selected_methods is None:
            selected_methods = list(all_agents.keys())
        elif not selected_methods:
            return []

        def create_custom_analysis_prompt(
            method_label: str, method_description: str
        ) -> str:
            return f"""You are an expert prompt analyst specializing in {method_label.lower()}.
                        Your task: {method_description}
                        Please analyze the given prompt according to this specific analytical perspective. 
                        Provide detailed insights, identify key elements, and offer actionable recommendations based on your analysis.
                        Format your response as a structured analysis with clear sections and specific findings."""

        analysis_agents = []
        analysis_method_names = []

        for method in selected_methods:
            if method in all_agents:
                analysis_agents.append(all_agents[method])
                analysis_method_names.append(method)
            elif custom_methods and method in custom_methods:
                custom_method = custom_methods[method]
                custom_prompt = create_custom_analysis_prompt(
                    custom_method["label"], custom_method["description"]
                )
                analysis_agents.append(custom_prompt)
                analysis_method_names.append(method)
            else:
                print(f"Warning: Unknown analysis method '{method}' ignored.")

        analysis_results = []
        user_message = f"The user's prompt：\n{prompt}"
        if feedback:
            user_message += f"\nThe supplementary information is:\n{feedback}"


        for i, analysis_agent in enumerate(tqdm(analysis_agents)):
            system_message = analysis_agent
            analysis_result = self.call_llm(system_message, user_message)

            agent_key = analysis_method_names[i]
            if agent_key.startswith("custom_"):
                custom_key = agent_key
                if custom_methods and custom_key in custom_methods:
                    agent_display_name = custom_methods[custom_key]["label"]
                else:
                    agent_display_name = (
                        f"Custom Method: {custom_key.replace('custom_', '')}"
                    )
            else:
                agent_info = get_agent_info(agent_key)
                if agent_info:
                    agent_display_name = agent_info["label"]
                else:
                    default_names = {
                        "anchoring_target": "Target Anchoring Analysis",
                        "activate_role": "Role Activation Analysis",
                        "disassembly_task": "Task Decomposition Analysis",
                        "expand_thinking": "Thinking Framework Analysis",
                        "focus_subject": "Subject Focus Analysis",
                        "input_extract": "Input Content Analysis",
                        "examples_extract": "Examples Extraction Analysis",
                    }
                    agent_display_name = default_names.get(
                        agent_key, agent_key.replace("_", " ").title()
                    )

            result_item = {
                "agent_key": agent_key,
                "agent_name": agent_display_name,
                "content": analysis_result,
            }
            analysis_results.append(result_item)

        return analysis_results

    def _auto_select_methods(
        self, prompt: str, all_agents: dict, custom_methods: dict = None
    ) -> List[str]:

        agent_mapping = get_all_agents()
        method_descriptions = {}

        for agent_key in all_agents.keys():
            agent_info = get_agent_info(agent_key)
            if agent_info:
                method_descriptions[agent_key] = agent_info["description"]
            else:
                default_descriptions = {
                    "anchoring_target": "Extract information based on pragmatic intention analysis, parse pragmatic intentions and define core goals",
                    "activate_role": "Assign appropriate roles, thinking patterns and domain knowledge to the large model",
                    "disassembly_task": "Decompose the task requirements prompted by users according to the hierarchical structure",
                    "expand_thinking": "Automatically match the optimal thinking framework (divergent/convergent/cross-border)",
                    "focus_subject": "Extract the semantic framework, define the topic prototype and topic anchor points",
                    "input_extract": "Accurately analyze the original text content that needs to be processed from the prompts",
                    "examples_extract": "Extract the examples provided by the user from the prompts",
                }
                method_descriptions[agent_key] = default_descriptions.get(
                    agent_key, f"Analysis method: {agent_key}"
                )

        if custom_methods:
            for key, method_info in custom_methods.items():
                method_descriptions[key] = method_info["description"]

        methods_list = "\n".join(
            [f"- {key}: {desc}" for key, desc in method_descriptions.items()]
        )

        selection_prompt = f"""You are an expert in prompt analysis. Given the following user prompt, please select the most relevant and useful analysis methods from the available options.
        User Prompt to Analyze:
        {prompt}

        Available Analysis Methods:
        {methods_list}

Instructions:
1. Analyze the user's prompt content and intent
2. Select 3-5 most relevant analysis methods that would provide the most valuable insights
3. Consider the prompt's complexity, domain, and specific requirements
4. Prioritize methods that complement each other and provide comprehensive analysis
5. Return ONLY the method keys (e.g., anchoring_target, activate_role) separated by commas, no explanations

Selected methods:"""

        try:
            response = self.call_llm(
                system_message="You are an expert prompt analyst. Select the most appropriate analysis methods based on the given prompt.",
                user_message=selection_prompt,
            )

            selected_methods = [method.strip() for method in response.split(",")]

            valid_methods = []
            for method in selected_methods:
                if method in method_descriptions:
                    valid_methods.append(method)
                else:
                    print(
                        f"Warning: Invalid method '{method}' ignored by AI selection."
                    )

            if not valid_methods:
                print(
                    "Warning: No valid methods selected by AI, using default methods."
                )
                valid_methods = [
                    "anchoring_target",
                    "activate_role",
                    "disassembly_task",
                ]

            return valid_methods

        except Exception as e:
            print(f"Error in auto-selection: {e}. Using default methods.")
            return ["anchoring_target", "activate_role", "disassembly_task"]
