
from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import BaseModel

if TYPE_CHECKING:
    from .message import Message


class Session(BaseModel):

    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, comment="SessionID")
    user_id = Column(Integer, nullable=False, default=1, comment="UserID")
    name = Column(String(255), nullable=False, comment="session name")
    current_step = Column(String(50), nullable=True, comment="current step")

    messages = relationship(
        "Message", back_populates="session", cascade="all, delete-orphan"
    )

    def __init__(
        self,
        name: str,
        user_id: int = 1,
        current_step: Optional[str] = None,
    ):
        self.name = name
        self.user_id = user_id
        self.current_step = current_step

    @property
    def message_count(self) -> int:
        return len(self.messages) if self.messages else 0

    @property
    def last_message_time(self):
        if self.messages:
            return max(msg.timestamp for msg in self.messages)
        return None

    def to_dict(
        self, include_messages: bool = False, exclude: Optional[list] = None
    ) -> dict:
        result = super().to_dict(exclude=exclude)

        result["message_count"] = self.message_count
        result["last_message_time"] = (
            self.last_message_time.isoformat()
            if self.last_message_time
            else None
        )

        if include_messages and self.messages:
            result["messages"] = [msg.to_dict() for msg in self.messages]

        return result

    def add_message(
        self,
        message_type: str,
        content: str,
        step: Optional[str] = None,
        metadata: Optional[dict] = None,
        thinking: Optional[str] = None,
    ) -> Message:

        from .message import Message

        message = Message(
            session_id=self.id,
            type=message_type,
            content=content,
            step=step,
            metadata=metadata,
            thinking=thinking,
        )

        self.messages.append(message)
        return message

    def get_messages_by_type(self, message_type: str) -> List[Message]:

        return [msg for msg in self.messages if msg.type == message_type]

    def get_messages_by_step(self, step: str) -> List[Message]:

        return [msg for msg in self.messages if msg.step == step]

    def clear_messages(self) -> None:
        self.messages.clear()

    def __repr__(self) -> str:
        return (
            f"<Session(id={self.id}, "
            f"name='{self.name}', "
            f"user_id={self.user_id}, "
            f"messages={self.message_count})>"
        )
