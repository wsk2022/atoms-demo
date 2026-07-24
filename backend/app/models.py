"""数据库模型：仅保留模型配置表。

项目数据已迁移到文件式存储（repository.py），数据库只负责模型 Key 管理。
"""
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from app.database import Base


class ModelConfig(Base):
    __tablename__ = "model_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key = Column(String, nullable=False, default="")
    base_url = Column(String, nullable=False, default="https://api.deepseek.com/v1")
    model = Column(String, nullable=False, default="deepseek-chat")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
