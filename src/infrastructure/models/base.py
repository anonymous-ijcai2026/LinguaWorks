
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import Column, Integer, DateTime, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session as SQLSession
from sqlalchemy.pool import QueuePool
from ..config import get_config

config = get_config()

Base = declarative_base()


class BaseModel(Base):

    __abstract__ = True

    id = Column(Integer, primary_key=True, autoincrement=True, comment="key ID")
    created_at = Column(
        DateTime, default=datetime.utcnow, nullable=False, comment="creation time"
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        comment="UpdateTime",
    )

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        exclude = exclude or []
        result = {}

        for column in self.__table__.columns:
            if column.name not in exclude:
                value = getattr(self, column.name)

                if isinstance(value, datetime):
                    result[column.name] = value.isoformat()
                else:
                    result[column.name] = value

        return result

    def update_from_dict(
        self, data: Dict[str, Any], exclude: Optional[list] = None
    ) -> None:
        exclude = exclude or ["id", "created_at"]

        for key, value in data.items():
            if key not in exclude and hasattr(self, key):
                setattr(self, key, value)

        self.updated_at = datetime.utcnow()

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


class DatabaseManager:

    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._init_engine()

    def _init_engine(self) -> None:
        try:
            self.engine = create_engine(
                config.database_url,
                poolclass=QueuePool,
                pool_size=config.db_pool_size,
                max_overflow=config.db_max_overflow,
                pool_timeout=config.db_pool_timeout,
                pool_recycle=config.db_pool_recycle,
                pool_pre_ping=True,
                echo=config.debug,
                echo_pool=config.debug,
            )

            self.SessionLocal = sessionmaker(
                autocommit=False, autoflush=False, bind=self.engine
            )

            print(f"Database engine initialized successfully: {config.database_url}")

        except Exception as e:
            print(f"Failed to initialize database engine: {e}")
            raise

    def get_session(self) -> SQLSession:

        if not self.SessionLocal:
            self._init_engine()

        return self.SessionLocal()

    def create_tables(self) -> None:
        try:
            Base.metadata.create_all(bind=self.engine)
            print("Database tables created successfully")
        except Exception as e:
            print(f"Failed to create database tables: {e}")
            raise

    def drop_tables(self) -> None:
        try:
            Base.metadata.drop_all(bind=self.engine)
            print("Database tables dropped successfully")
        except Exception as e:
            print(f"Failed to drop database tables: {e}")
            raise

    def health_check(self) -> bool:
        try:
            with self.get_session() as session:
                session.execute("SELECT 1")
                return True
        except Exception as e:
            print(f"Database health check failed: {e}")
            return False

db_manager = DatabaseManager()


def get_db_session() -> SQLSession:
    return db_manager.get_session()


def init_database() -> None:
    db_manager.create_tables()
