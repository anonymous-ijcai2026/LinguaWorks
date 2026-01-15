"""
提示词模板模型

对应数据库中的提示词模板相关表，管理系统默认和用户自定义的提示词模板
"""

from typing import Dict, Any, Optional, List
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    UniqueConstraint,
)
from .base import BaseModel


class PromptTemplate(BaseModel):
    """系统默认提示词模板模型"""

    __tablename__ = "prompt_templates"

    # 基础字段
    template_key = Column(
        String(100),
        nullable=False,
        unique=True,
        comment="模板唯一标识",
    )
    name = Column(String(255), nullable=False, comment="模板名称")
    description = Column(Text, nullable=True, comment="模板描述")
    category = Column(String(100), nullable=True, comment="模板分类")
    content = Column(Text, nullable=False, comment="模板内容")
    variables = Column(Text, nullable=True, comment="模板变量（JSON格式）")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")
    sort_order = Column(Integer, default=0, nullable=False, comment="排序顺序")

    def __init__(
        self,
        template_key: str,
        name: str,
        content: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        variables: Optional[str] = None,
        is_active: bool = True,
        sort_order: int = 0,
    ):
        """
        初始化提示词模板

        Args:
            template_key: 模板唯一标识
            name: 模板名称
            content: 模板内容
            description: 模板描述
            category: 模板分类
            variables: 模板变量（JSON格式）
            is_active: 是否启用
            sort_order: 排序顺序
        """
        self.template_key = template_key
        self.name = name
        self.content = content
        self.description = description
        self.category = category
        self.variables = variables
        self.is_active = is_active
        self.sort_order = sort_order

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        """
        转换为字典

        Args:
            exclude: 需要排除的字段列表

        Returns:
            Dict[str, Any]: 提示词模板数据字典
        """
        result = super().to_dict(exclude=exclude)
        result["is_custom"] = False  # 标记为系统默认模板
        return result

    def get_variables_list(self) -> List[str]:
        """
        获取模板变量列表

        Returns:
            List[str]: 变量名列表
        """
        if not self.variables:
            return []

        try:
            import json

            return json.loads(self.variables)
        except (json.JSONDecodeError, TypeError):
            return []

    def render_template(self, variables: Dict[str, Any]) -> str:
        """
        渲染模板

        Args:
            variables: 变量值字典

        Returns:
            str: 渲染后的内容
        """
        content = self.content
        for key, value in variables.items():
            placeholder = f"{{{key}}}"
            content = content.replace(placeholder, str(value))
        return content

    def __repr__(self) -> str:
        """提示词模板的字符串表示"""
        return (
            f"<PromptTemplate(id={self.id}, "
            f"template_key='{self.template_key}', "
            f"name='{self.name}')>"
        )


class CustomPromptTemplate(BaseModel):
    """用户自定义提示词模板模型"""

    __tablename__ = "custom_prompt_templates"

    # 基础字段
    user_id = Column(Integer, nullable=False, default=1, comment="用户ID")
    template_key = Column(String(100), nullable=False, comment="模板唯一标识")
    name = Column(String(255), nullable=False, comment="模板名称")
    description = Column(Text, nullable=True, comment="模板描述")
    category = Column(String(100), nullable=True, comment="模板分类")
    content = Column(Text, nullable=False, comment="模板内容")
    variables = Column(Text, nullable=True, comment="模板变量（JSON格式）")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")
    sort_order = Column(Integer, default=0, nullable=False, comment="排序顺序")

    # 添加唯一约束
    __table_args__ = (
        UniqueConstraint("user_id", "template_key", name="uk_user_template"),
    )

    def __init__(
        self,
        user_id: int,
        template_key: str,
        name: str,
        content: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        variables: Optional[str] = None,
        is_active: bool = True,
        sort_order: int = 0,
    ):
        """
        初始化自定义提示词模板

        Args:
            user_id: 用户ID
            template_key: 模板唯一标识
            name: 模板名称
            content: 模板内容
            description: 模板描述
            category: 模板分类
            variables: 模板变量（JSON格式）
            is_active: 是否启用
            sort_order: 排序顺序
        """
        self.user_id = user_id
        self.template_key = template_key
        self.name = name
        self.content = content
        self.description = description
        self.category = category
        self.variables = variables
        self.is_active = is_active
        self.sort_order = sort_order

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        """
        转换为字典

        Args:
            exclude: 需要排除的字段列表

        Returns:
            Dict[str, Any]: 自定义提示词模板数据字典
        """
        result = super().to_dict(exclude=exclude)
        result["is_custom"] = True  # 标记为用户自定义模板
        return result

    def get_variables_list(self) -> List[str]:
        """
        获取模板变量列表

        Returns:
            List[str]: 变量名列表
        """
        if not self.variables:
            return []

        try:
            import json

            return json.loads(self.variables)
        except (json.JSONDecodeError, TypeError):
            return []

    def render_template(self, variables: Dict[str, Any]) -> str:
        """
        渲染模板

        Args:
            variables: 变量值字典

        Returns:
            str: 渲染后的内容
        """
        content = self.content
        for key, value in variables.items():
            placeholder = f"{{{key}}}"
            content = content.replace(placeholder, str(value))
        return content

    def __repr__(self) -> str:
        """自定义提示词模板的字符串表示"""
        return (
            f"<CustomPromptTemplate(id={self.id}, user_id={self.user_id}, "
            f"template_key='{self.template_key}', name='{self.name}')>"
        )


class SelectedPromptTemplate(BaseModel):
    """用户选中的提示词模板模型"""

    __tablename__ = "selected_prompt_templates"

    # 基础字段
    user_id = Column(Integer, nullable=False, default=1, comment="用户ID")
    template_key = Column(String(100), nullable=False, comment="模板唯一标识")
    is_selected = Column(Boolean, default=True, nullable=False, comment="是否选中")

    # 添加唯一约束
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "template_key",
            name="uk_user_selected_template",
        ),
    )

    def __init__(
        self,
        user_id: int,
        template_key: str,
        is_selected: bool = True,
    ):
        """
        初始化选中的提示词模板

        Args:
            user_id: 用户ID
            template_key: 模板唯一标识
            is_selected: 是否选中
        """
        self.user_id = user_id
        self.template_key = template_key
        self.is_selected = is_selected

    @classmethod
    def set_selected_templates(
        cls, session, user_id: int, template_keys: List[str]
    ) -> None:
        """
        设置用户选中的提示词模板

        Args:
            session: 数据库会话
            user_id: 用户ID
            template_keys: 选中的模板键列表
        """
        # 先清除用户所有选择
        session.query(cls).filter_by(user_id=user_id).delete()

        # 添加新的选择
        for template_key in template_keys:
            selected_template = cls(
                user_id=user_id, template_key=template_key, is_selected=True
            )
            session.add(selected_template)

    @classmethod
    def get_selected_templates(cls, session, user_id: int) -> List[str]:
        """
        获取用户选中的提示词模板

        Args:
            session: 数据库会话
            user_id: 用户ID

        Returns:
            List[str]: 选中的模板键列表
        """
        selected = (
            session.query(cls)
            .filter_by(user_id=user_id, is_selected=True)
            .all()
        )
        return [item.template_key for item in selected]

    @classmethod
    def toggle_template(cls, session, user_id: int, template_key: str) -> bool:
        """
        切换提示词模板的选中状态

        Args:
            session: 数据库会话
            user_id: 用户ID
            template_key: 模板唯一标识

        Returns:
            bool: 切换后的选中状态
        """
        selected_template = (
            session.query(cls)
            .filter_by(user_id=user_id, template_key=template_key)
            .first()
        )

        if selected_template:
            # 切换状态
            selected_template.is_selected = not selected_template.is_selected
            return selected_template.is_selected
        else:
            # 创建新的选择记录
            new_selected = cls(
                user_id=user_id, template_key=template_key, is_selected=True
            )
            session.add(new_selected)
            return True

    def __repr__(self) -> str:
        """选中提示词模板的字符串表示"""
        return (
            f"<SelectedPromptTemplate(id={self.id}, "
            f"user_id={self.user_id}, "
            f"template_key='{self.template_key}', "
            f"is_selected={self.is_selected})>"
        )


class PromptTemplateService:
    """提示词模板服务类，提供业务逻辑方法"""

    @staticmethod
    def get_user_prompt_templates(
        session,
        user_id: int = 1,
    ) -> List[Dict[str, Any]]:
        """
        获取用户的所有提示词模板（系统默认 + 自定义）

        Args:
            session: 数据库会话
            user_id: 用户ID

        Returns:
            List[Dict[str, Any]]: 提示词模板列表
        """
        templates = []

        # 获取系统默认模板
        default_templates = (
            session.query(PromptTemplate)
            .filter_by(is_active=True)
            .order_by(PromptTemplate.sort_order)
            .all()
        )
        for template in default_templates:
            templates.append(template.to_dict())

        # 获取用户自定义模板
        custom_templates = (
            session.query(CustomPromptTemplate)
            .filter_by(user_id=user_id, is_active=True)
            .order_by(CustomPromptTemplate.sort_order)
            .all()
        )
        for template in custom_templates:
            templates.append(template.to_dict())

        return templates

    @staticmethod
    def create_custom_template(
        session,
        user_id: int,
        template_key: str,
        name: str,
        content: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        variables: Optional[List[str]] = None,
    ) -> CustomPromptTemplate:
        """
        创建用户自定义提示词模板

        Args:
            session: 数据库会话
            user_id: 用户ID
            template_key: 模板唯一标识
            name: 模板名称
            content: 模板内容
            description: 模板描述
            category: 模板分类
            variables: 模板变量列表

        Returns:
            CustomPromptTemplate: 创建的自定义模板
        """
        # 检查模板键是否已存在
        existing = (
            session.query(CustomPromptTemplate)
            .filter_by(user_id=user_id, template_key=template_key)
            .first()
        )
        if existing:
            raise ValueError(
                f"Template key '{template_key}' already exists for user "
                f"{user_id}"
            )

        # 处理变量列表
        variables_json = None
        if variables:
            import json

            variables_json = json.dumps(variables)

        # 创建新的自定义模板
        custom_template = CustomPromptTemplate(
            user_id=user_id,
            template_key=template_key,
            name=name,
            content=content,
            description=description,
            category=category,
            variables=variables_json,
        )

        session.add(custom_template)
        return custom_template

    @staticmethod
    def update_custom_template(
        session, user_id: int, template_key: str, **kwargs
    ) -> Optional[CustomPromptTemplate]:
        """
        更新用户自定义提示词模板

        Args:
            session: 数据库会话
            user_id: 用户ID
            template_key: 模板唯一标识
            **kwargs: 更新的字段

        Returns:
            Optional[CustomPromptTemplate]: 更新的自定义模板，如果不存在返回None
        """
        custom_template = (
            session.query(CustomPromptTemplate)
            .filter_by(user_id=user_id, template_key=template_key)
            .first()
        )
        if custom_template:
            # 处理变量列表
            if "variables" in kwargs and isinstance(kwargs["variables"], list):
                import json

                kwargs["variables"] = json.dumps(kwargs["variables"])

            custom_template.update_from_dict(kwargs)
            return custom_template
        return None

    @staticmethod
    def delete_custom_template(
        session,
        user_id: int,
        template_key: str,
    ) -> bool:
        """
        删除用户自定义提示词模板

        Args:
            session: 数据库会话
            user_id: 用户ID
            template_key: 模板唯一标识

        Returns:
            bool: 是否删除成功
        """
        custom_template = (
            session.query(CustomPromptTemplate)
            .filter_by(user_id=user_id, template_key=template_key)
            .first()
        )
        if custom_template:
            # 同时删除相关的选择记录
            session.query(SelectedPromptTemplate).filter_by(
                user_id=user_id, template_key=template_key
            ).delete()
            session.delete(custom_template)
            return True
        return False

    @staticmethod
    def get_template_by_key(session, template_key: str, user_id: int = 1):
        """
        根据模板键获取模板（优先自定义模板）

        Args:
            session: 数据库会话
            template_key: 模板唯一标识
            user_id: 用户ID

        Returns:
            模板对象或None
        """
        # 先查找用户自定义模板
        custom_template = (
            session.query(CustomPromptTemplate)
            .filter_by(
                user_id=user_id,
                template_key=template_key,
                is_active=True,
            )
            .first()
        )

        if custom_template:
            return custom_template

        # 再查找系统默认模板
        default_template = (
            session.query(PromptTemplate)
            .filter_by(template_key=template_key, is_active=True)
            .first()
        )

        return default_template
