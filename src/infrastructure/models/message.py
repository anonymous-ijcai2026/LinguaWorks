
import json
from typing import Any, Dict, Optional
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel


class Message(BaseModel):
    __tablename__ = "messages"

    session_id = Column(
        String(36), ForeignKey("sessions.id"), nullable=False, comment="SessionID"
    )
    type = Column(String(50), nullable=False, comment="message type")
    content = Column(Text, nullable=True, comment="Message Content ")
    step = Column(String(50), nullable=True, comment="processing step")
    message_metadata = Column("metadata", Text, nullable=True, comment="Message metadata (in JSON format)")
    thinking = Column(Text, nullable=True, comment="Thinking process")
    timestamp = Column(
        DateTime, default=datetime.utcnow, nullable=False, comment="Message timestamp"
    )

    session = relationship("Session", back_populates="messages")

    def __init__(
        self,
        session_id: str,
        type: str,
        content: Optional[Any] = None,
        step: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        thinking: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ):
        self.session_id = session_id
        self.type = type
        self.step = step
        self.thinking = thinking
        if timestamp is not None:
            self.timestamp = timestamp
        self.set_content(content)
        if metadata is not None:
            self.set_metadata(metadata)

    def set_metadata(self, metadata: Dict[str, Any]) -> None:
        try:
            cleaned_metadata = self._sanitize_metadata(metadata)
            self.message_metadata = json.dumps(cleaned_metadata, ensure_ascii=False)
        except Exception as e:
            print(f"Warning: Failed to serialize metadata: {e}")
            self.message_metadata = None

    def get_metadata(self) -> Optional[Dict[str, Any]]:
        if not self.message_metadata:
            return None

        try:
            return json.loads(self.message_metadata)
        except (json.JSONDecodeError, TypeError) as e:
            print(f"Warning: Failed to parse metadata: {e}")
            return None

    def set_content(self, content: Any) -> None:
        if isinstance(content, dict):
            try:
                self.content = json.dumps(content, ensure_ascii=False)
            except Exception as e:
                print(f"Warning: Failed to serialize content: {e}")
                self.content = str(content)
        else:
            self.content = str(content) if content is not None else None

    def get_content(self) -> Any:
        if not self.content:
            return None

        try:
            return json.loads(self.content)
        except (json.JSONDecodeError, TypeError):
            return self.content

    def _sanitize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:

        def clean_value(value):
            if isinstance(value, dict):
                return {k: clean_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [clean_value(item) for item in value]
            elif isinstance(value, (str, int, float, bool)) or value is None:
                return value
            elif isinstance(value, datetime):
                return value.isoformat()
            else:
                return str(value)

        return clean_value(metadata)

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        result = super().to_dict(exclude=exclude)

        if self.timestamp:
            result["timestamp"] = self.timestamp.isoformat()

        metadata = self.get_metadata()
        if metadata is not None:
            result["metadata"] = metadata

        content = self.get_content()
        if content is not None:
            result["content"] = content

        return result

    @classmethod
    def create_user_message(
        cls, session_id: str, content: str, metadata: Optional[Dict[str, Any]] = None
    ) -> "Message":

        return cls(
            session_id=session_id, type="user", content=content, metadata=metadata
        )

    @classmethod
    def create_assistant_message(
        cls,
        session_id: str,
        content: str,
        step: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        thinking: Optional[str] = None,
    ) -> "Message":

        return cls(
            session_id=session_id,
            type="assistant",
            content=content,
            step=step,
            metadata=metadata,
            thinking=thinking,
        )

    @classmethod
    def create_system_message(
        cls,
        session_id: str,
        content: str,
        step: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "Message":
        return cls(
            session_id=session_id,
            type="system",
            content=content,
            step=step,
            metadata=metadata,
        )

    def __repr__(self) -> str:
        content_preview = (
            self.content[:50] + "..."
            if self.content and len(self.content) > 50
            else self.content
        )
        return f"<Message(id={self.id}, session_id={self.session_id}, type='{self.type}', content='{content_preview}')>"
