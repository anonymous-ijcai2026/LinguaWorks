

from typing import Dict, Any, Optional, List
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .base import BaseModel


class AnalysisMethod(BaseModel):

    __tablename__ = "analysis_methods"

    method_key = Column(String(100), nullable=False, unique=True, comment="Unique method identifierUnique method identifier")
    name = Column(String(255), nullable=False, comment="public string function name")
    description = Column(Text, nullable=True, comment="description of method")
    category = Column(String(100), nullable=True, comment="classification of methods")
    is_active = Column(Boolean, default=True, nullable=False, comment="enable")
    sort_order = Column(Integer, default=0, nullable=False, comment="sorting order")

    def __init__(
        self,
        method_key: str,
        name: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        is_active: bool = True,
        sort_order: int = 0,
    ):

        self.method_key = method_key
        self.name = name
        self.description = description
        self.category = category
        self.is_active = is_active
        self.sort_order = sort_order

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        result = super().to_dict(exclude=exclude)
        result["is_custom"] = False  # 标记为系统默认方法
        return result

    def __repr__(self) -> str:
        return f"<AnalysisMethod(id={self.id}, method_key='{self.method_key}', name='{self.name}')>"


class CustomAnalysisMethod(BaseModel):

    __tablename__ = "custom_analysis_methods"

    user_id = Column(Integer, nullable=False, default=1, comment="user ID")
    method_key = Column(String(100), nullable=False, comment="Method unique identifier")
    name = Column(String(255), nullable=False, comment="public string function name")
    description = Column(Text, nullable=True, comment="description of method")
    category = Column(String(100), nullable=True, comment="classification of methods")
    is_active = Column(Boolean, default=True, nullable=False, comment="enable")
    sort_order = Column(Integer, default=0, nullable=False, comment="sorting order")

    __table_args__ = (UniqueConstraint("user_id", "method_key", name="uk_user_method"),)

    def __init__(
        self,
        user_id: int,
        method_key: str,
        name: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        is_active: bool = True,
        sort_order: int = 0,
    ):
        self.user_id = user_id
        self.method_key = method_key
        self.name = name
        self.description = description
        self.category = category
        self.is_active = is_active
        self.sort_order = sort_order

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        result = super().to_dict(exclude=exclude)
        result["is_custom"] = True
        return result

    def __repr__(self) -> str:
        return f"<CustomAnalysisMethod(id={self.id}, user_id={self.user_id}, method_key='{self.method_key}', name='{self.name}')>"


class SelectedAnalysisMethod(BaseModel):

    __tablename__ = "selected_analysis_methods"

    user_id = Column(Integer, nullable=False, default=1, comment="user ID")
    method_key = Column(String(100), nullable=False, comment="Method unique identifier")
    is_selected = Column(Boolean, default=True, nullable=False, comment="androidstate_checked")

    __table_args__ = (
        UniqueConstraint("user_id", "method_key", name="uk_user_selected_method"),
    )

    def __init__(self, user_id: int, method_key: str, is_selected: bool = True):
        self.user_id = user_id
        self.method_key = method_key
        self.is_selected = is_selected

    @classmethod
    def set_selected_methods(
        cls, session, user_id: int, method_keys: List[str]
    ) -> None:

        session.query(cls).filter_by(user_id=user_id).delete()

        for method_key in method_keys:
            selected_method = cls(
                user_id=user_id, method_key=method_key, is_selected=True
            )
            session.add(selected_method)

    @classmethod
    def get_selected_methods(cls, session, user_id: int) -> List[str]:
        selected = session.query(cls).filter_by(user_id=user_id, is_selected=True).all()
        return [item.method_key for item in selected]

    @classmethod
    def toggle_method(cls, session, user_id: int, method_key: str) -> bool:
        selected_method = (
            session.query(cls).filter_by(user_id=user_id, method_key=method_key).first()
        )

        if selected_method:
            # 切换状态
            selected_method.is_selected = not selected_method.is_selected
            return selected_method.is_selected
        else:
            # 创建新的选择记录
            new_selected = cls(user_id=user_id, method_key=method_key, is_selected=True)
            session.add(new_selected)
            return True

    def __repr__(self) -> str:
        return f"<SelectedAnalysisMethod(id={self.id}, user_id={self.user_id}, method_key='{self.method_key}', is_selected={self.is_selected})>"


class AnalysisMethodService:

    @staticmethod
    def get_user_analysis_methods(session, user_id: int = 1) -> List[Dict[str, Any]]:
        methods = []

        default_methods = (
            session.query(AnalysisMethod)
            .filter_by(is_active=True)
            .order_by(AnalysisMethod.sort_order)
            .all()
        )
        for method in default_methods:
            methods.append(method.to_dict())

        custom_methods = (
            session.query(CustomAnalysisMethod)
            .filter_by(user_id=user_id, is_active=True)
            .order_by(CustomAnalysisMethod.sort_order)
            .all()
        )
        for method in custom_methods:
            methods.append(method.to_dict())

        return methods

    @staticmethod
    def create_custom_method(
        session,
        user_id: int,
        method_key: str,
        name: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
    ) -> CustomAnalysisMethod:
        existing = (
            session.query(CustomAnalysisMethod)
            .filter_by(user_id=user_id, method_key=method_key)
            .first()
        )
        if existing:
            raise ValueError(
                f"Method key '{method_key}' already exists for user {user_id}"
            )

        custom_method = CustomAnalysisMethod(
            user_id=user_id,
            method_key=method_key,
            name=name,
            description=description,
            category=category,
        )

        session.add(custom_method)
        return custom_method

    @staticmethod
    def update_custom_method(
        session, user_id: int, method_key: str, **kwargs
    ) -> Optional[CustomAnalysisMethod]:
        custom_method = (
            session.query(CustomAnalysisMethod)
            .filter_by(user_id=user_id, method_key=method_key)
            .first()
        )
        if custom_method:
            custom_method.update_from_dict(kwargs)
            return custom_method
        return None

    @staticmethod
    def delete_custom_method(session, user_id: int, method_key: str) -> bool:
        custom_method = (
            session.query(CustomAnalysisMethod)
            .filter_by(user_id=user_id, method_key=method_key)
            .first()
        )
        if custom_method:
            session.query(SelectedAnalysisMethod).filter_by(
                user_id=user_id, method_key=method_key
            ).delete()
            session.delete(custom_method)
            return True
        return False
