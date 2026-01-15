from typing import Any, Dict


class SessionStore:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "prompt": "",
                "analysis_results": [],
                "dialogues_history": [],
                "requirements_checklist": {},
            }
        return self.sessions[session_id]


session_store = SessionStore()
