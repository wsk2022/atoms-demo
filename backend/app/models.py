"""数据库模型：用户与认证 token、模型配置表。

项目数据已迁移到文件式存储（store.py），数据库负责用户、登录态和模型 Key 管理。
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class AuthToken(Base):
    """不透明登录态：token 作为主键，服务端可即时吊销。"""

    __tablename__ = "auth_tokens"

    token = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ModelConfig(Base):
    __tablename__ = "model_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key = Column(String, nullable=False, default="")
    base_url = Column(String, nullable=False, default="https://api.deepseek.com/v1")
    model = Column(String, nullable=False, default="deepseek-chat")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
