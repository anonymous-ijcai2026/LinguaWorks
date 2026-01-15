from .basic_handler import BasicHandler
import sys
import os
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import agent_prompt
from typing import Dict, List, Any, Tuple, Optional


class StructureChecker(BasicHandler):
    @staticmethod
    def _extract_need_header(text: str) -> tuple[Optional[str], str]:
        if not text:
            return None, text
        lines = text.splitlines()
        if not lines:
            return None, text
        first = lines[0].strip()
        if not (first.startswith("[need:") and first.endswith("]")):
            return None, text
        field_key = first[len("[need:") : -1].strip()
        rest = "\n".join(lines[1:]).lstrip()
        return (field_key or None), rest

    @staticmethod
    def _ensure_checklist_asked(checklist: Dict[str, Any]) -> Dict[str, Any]:
        asked = checklist.get("asked")
        if not isinstance(asked, dict):
            asked = {}
        if not isinstance(asked.get("fields"), list):
            asked["fields"] = []
        if not isinstance(asked.get("questions"), list):
            asked["questions"] = []
        checklist["asked"] = asked
        return checklist

    def run(
        self,
        initial_prompt: str = None,
        dialogues_history: List[Dict[str, str]] = None,
        requirements_checklist: Optional[Dict[str, Any]] = None,
    ) -> tuple[str, str, str, Dict[str, Any]]:
        """
        API-friendly version of structure checker
        :param initial_prompt: Initial prompt content
        :param dialogues_history: Dialogue history records
        :return: (end_flag, answer, thinking, requirements_checklist) tuple
        """
        if dialogues_history is None:
            dialogues_history = []

        if requirements_checklist is None:
            requirements_checklist = {}

        # Record whether a new user message was added, for cleanup on error
        added_user_message = False
        if initial_prompt and not dialogues_history:
            dialogues_history.append({"user": initial_prompt})
            added_user_message = True

        llm_answer = ""

        try:
            requirements_checklist = self.update_requirements_checklist(
                dialogues_history=dialogues_history,
                requirements_checklist=requirements_checklist,
            )
            requirements_checklist = self._ensure_checklist_asked(
                requirements_checklist
            )

            # LLM response with thinking process
            check_structure_agent_prompt = agent_prompt.check_structure
            system_message = check_structure_agent_prompt
            user_message = (
                "Dialogue History：\n"
                + str(dialogues_history)
                + "\n\nRequirements Checklist JSON:\n"
                + json.dumps(requirements_checklist, ensure_ascii=False)
            )

            # Get LLM response
            llm_response = self.call_llm(system_message, user_message)

            # 用户消息内容

            # Parse result - check if it starts with OK-
            if llm_response.startswith("OK-"):
                end_flag = "OK"
                llm_answer = llm_response[3:]  # Remove "OK-" prefix
            elif llm_response.startswith("CLARIFY-"):
                end_flag = "CLARIFY"
                llm_answer = llm_response[len("CLARIFY-") :]
            elif llm_response.startswith("ASK-"):
                end_flag = "CONTINUE"
                llm_answer = llm_response[len("ASK-") :]
            elif "I notice" in llm_response and (
                "clarify" in llm_response.lower() or "option" in llm_response.lower()
            ):
                end_flag = "CLARIFY"
                llm_answer = (
                    llm_response  # Use response directly as clarification question
                )
            elif "I notice" in llm_response and (
                "clarify" in llm_response or "option" in llm_response
            ):
                end_flag = "CLARIFY"
                llm_answer = llm_response
            else:
                end_flag = "CONTINUE"
                llm_answer = llm_response  # Use response directly as guidance message

            if end_flag in ("CONTINUE", "CLARIFY"):
                field_key, cleaned = self._extract_need_header(
                    llm_answer.strip()
                )
                if field_key:
                    asked = requirements_checklist.get("asked", {})
                    asked_fields = asked.get("fields", [])
                    if field_key not in asked_fields:
                        asked_fields.append(field_key)
                    asked["fields"] = asked_fields
                    asked_questions = asked.get("questions", [])
                    asked_questions.append(
                        {"field_key": field_key, "question": cleaned}
                    )
                    asked["questions"] = asked_questions
                    requirements_checklist["asked"] = asked
                llm_answer = cleaned if field_key else llm_answer

            # Clean up result
            llm_answer = self.remove_blank_lines(llm_answer)

            # Get thinking process, pass in checker's output
            thinking_process = self.think_structure(
                initial_prompt=initial_prompt,
                dialogues_history=dialogues_history,
                checker_output=llm_answer,
                end_flag=end_flag,
            )

            # Always record system reply to dialogue history
            if dialogues_history:
                current_idx = len(dialogues_history) - 1
                dialogues_history[current_idx]["you"] = llm_answer

            # Return result
            return end_flag, llm_answer, thinking_process, requirements_checklist
        except Exception as e:
            # If LLM call fails, need to clean up newly added user message in dialogues_history
            # Avoid duplicate recording of this message on retry
            if added_user_message and dialogues_history:
                dialogues_history.pop()  # Remove the last added user message
            raise e

    def process_feedback(
        self,
        feedback: str,
        dialogues_history: List[Dict[str, str]],
        requirements_checklist: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, str, str, Dict[str, Any]]:
        """
        Process user feedback on structure check
        :param feedback: User feedback
        :param dialogues_history: Dialogue history
        :return: (end_flag, answer, thinking, requirements_checklist) tuple
        """
        # Record original user message content for error recovery
        original_user_content = None
        current_idx = -1

        try:
            # User provided feedback, add to dialogue history
            if not dialogues_history:
                dialogues_history = []
            else:
                current_idx = len(dialogues_history) - 1
                # Save original content for error recovery
                original_user_content = dialogues_history[current_idx]["user"]
                dialogues_history[current_idx]["user"] = (
                    dialogues_history[current_idx]["user"] + "\n" + feedback
                )

            # Re-run structure check
            end_flag, result, _, updated_checklist = self.run(
                dialogues_history=dialogues_history,
                requirements_checklist=requirements_checklist,
            )

            # Get thinking process, pass in checker's output
            thinking_process = self.think_structure_with_feedback(
                feedback=feedback,
                dialogues_history=dialogues_history,
                checker_output=result,
                end_flag=end_flag,
            )

            # Always save system result to dialogue history
            if dialogues_history:
                dialogues_history[-1]["you"] = result

            return end_flag, result, thinking_process, updated_checklist
        except Exception as e:
            # If processing fails, restore original user message content
            if (
                original_user_content is not None
                and current_idx >= 0
                and current_idx < len(dialogues_history)
            ):
                dialogues_history[current_idx]["user"] = original_user_content
            raise e

    def run_with_history(
        self,
        dialogues_history: List[Dict[str, str]],
        requirements_checklist: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, str, Dict[str, Any]]:
        """
        Run structure check using dialogue history
        :param dialogues_history: Dialogue history
        :return: (end_flag, answer, requirements_checklist) tuple
        """
        end_flag, answer, _, updated_checklist = self.run(
            dialogues_history=dialogues_history,
            requirements_checklist=requirements_checklist,
        )
        return end_flag, answer, updated_checklist

    def update_requirements_checklist(
        self,
        dialogues_history: List[Dict[str, str]],
        requirements_checklist: Dict[str, Any],
    ) -> Dict[str, Any]:
        system_message = agent_prompt.requirements_checklist
        user_message = (
            "Existing Checklist JSON:\n"
            + json.dumps(requirements_checklist, ensure_ascii=False)
            + "\n\nDialogue History:\n"
            + str(dialogues_history)
        )
        llm_response = self.call_llm(system_message, user_message).replace(
            "```", ""
        )
        parsed = self._extract_json_dict(llm_response)
        return parsed if parsed is not None else requirements_checklist

    @staticmethod
    def _extract_json_dict(text: str) -> Optional[Dict[str, Any]]:
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass

        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end < 0 or end <= start:
            return None

        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    def think_structure(
        self,
        initial_prompt: str = None,
        dialogues_history: List[Dict[str, str]] = None,
        checker_output: str = None,
        end_flag: str = None,
    ) -> str:
        """
        Thinking agent: Based on structure check results, explain to user why such guidance is needed
        :param initial_prompt: Initial prompt content
        :param dialogues_history: Dialogue history records
        :param checker_output: structure_checker's output content
        :param end_flag: Check result identifier
        :return: Educational thinking process analysis result
        """
        if dialogues_history is None:
            dialogues_history = []

        if initial_prompt and not dialogues_history:
            dialogues_history.append({"user": initial_prompt})

        try:
            # Use educational thinking agent
            thinking_structure_agent_prompt = agent_prompt.thinking_structure

            # Format prompt, pass in checker's output information
            system_message = thinking_structure_agent_prompt.format(
                dialogues_history=str(dialogues_history),
                checker_output=checker_output or "No specific guidance provided",
                end_flag=end_flag or "Unknown",
            )

            user_message = (
                "Please provide an educational explanation based on the context above."
            )

            # Get thinking analysis result
            thinking_response = self.call_llm(system_message, user_message)

            # Clean up result
            thinking_response = self.remove_blank_lines(thinking_response)

            return thinking_response
        except Exception as e:
            raise e

    def think_structure_with_feedback(
        self,
        feedback: str,
        dialogues_history: List[Dict[str, str]],
        checker_output: str = None,
        end_flag: str = None,
    ) -> str:
        """
        Perform thinking analysis based on user feedback
        :param feedback: User feedback
        :param dialogues_history: Dialogue history
        :param checker_output: structure_checker's output content
        :param end_flag: Check result identifier
        :return: Thinking process analysis result
        """
        try:
            # User provided feedback, add to dialogue history
            if not dialogues_history:
                dialogues_history = []
            else:
                current_idx = len(dialogues_history) - 1
                dialogues_history[current_idx]["user"] = (
                    dialogues_history[current_idx]["user"] + "\n" + feedback
                )

            # Re-perform thinking analysis, pass in checker's output
            thinking_result = self.think_structure(
                dialogues_history=dialogues_history,
                checker_output=checker_output,
                end_flag=end_flag,
            )

            return thinking_result
        except Exception as e:
            raise e
