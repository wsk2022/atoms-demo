"""数据传输对象：API 请求/响应验证。"""
from pydantic import BaseModel


class ModelConfigIn(BaseModel):
    api_key: str
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"


class ModelConfigOut(BaseModel):
    api_key: str
    base_url: str
    model: str
    is_configured: bool

    model_config = {"from_attributes": True}
