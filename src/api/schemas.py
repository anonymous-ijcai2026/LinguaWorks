from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SessionID(BaseModel):
    session_id: str


class UserInput(BaseModel):
    session_id: str
    content: str
    suggestion: Optional[str] = None
    selected_methods: Optional[List[str]] = None
    custom_methods: Optional[Dict[str, Dict[str, str]]] = None
    auto_select: Optional[bool] = False
    template_key: Optional[str] = None


class AnalysisInput(BaseModel):
    session_id: str
    selected_methods: Optional[List[str]] = None
    custom_methods: Optional[Dict[str, Dict[str, str]]] = None
    auto_select: Optional[bool] = False


class UserFeedback(BaseModel):
    session_id: str
    feedback: str
    content: Optional[str] = None


class VersionInput(BaseModel):
    prompt_content: str
    test_result: Optional[str] = None
    version_type: str
    metadata: Optional[Dict[str, Any]] = None


class SystemPromptTestInput(BaseModel):
    session_id: str
    system_prompt: str
    user_message: Optional[str] = None
    count: Optional[int] = 3


class ChatTestInput(BaseModel):
    session_id: str
    version_number: int
    user_message: str


class ChatMessageInput(BaseModel):
    session_id: str
    version_id: int
    message_type: str
    content: str
    response_time_ms: Optional[int] = None
    token_count: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class ChatHistoryRequest(BaseModel):
    session_id: str
    version_id: int
    limit: Optional[int] = 50


class ChatTestDiffExplainInput(BaseModel):
    session_id: str
    left_version_id: int
    right_version_id: int
    left_message_ids: Optional[List[int]] = None
    right_message_ids: Optional[List[int]] = None
    left_start_order: int = 1
    left_end_order: int = 1
    right_start_order: int = 1
    right_end_order: int = 1


class ChatTestDiffAnalysisSaveInput(BaseModel):
    session_id: str
    left_version_id: int
    right_version_id: int
    left_message_ids: List[int]
    right_message_ids: List[int]
    explanation: str


class ChatTestDiffAnalysisGetInput(BaseModel):
    session_id: str
    left_version_id: int
    right_version_id: int


class ApiResponse(BaseModel):
    status: str
    result: Any
    message: Optional[str] = None
