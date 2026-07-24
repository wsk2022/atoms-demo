"""应用配置：从环境变量 / .env 读取，使用 pydantic-settings。"""
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


class ForgeConfig(BaseSettings):
    # 应用
    APP_NAME: str = "SparkForge"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # 数据库（仅存模型 Key 配置）
    DATABASE_URL: str = "sqlite+aiosqlite:///./sparkforge.db"

    # 数据目录（文件式存储：会话、技能、快照）
    DATA_DIR: str = str(Path(__file__).resolve().parent.parent.parent / "data")

    # LLM（OpenAI 兼容接口）
    LLM_API_KEY: Optional[str] = None
    LLM_BASE_URL: str = "https://api.deepseek.com/v1"
    LLM_MODEL: str = "deepseek-chat"
    LLM_TIMEOUT: int = 120
    LLM_MAX_RETRIES: int = 3

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = ForgeConfig()

ROOT = Path(settings.DATA_DIR)
SESSIONS_DIR = ROOT / "sessions"
USER_SKILLS_DIR = ROOT / "user_skills"
SKILLS_STATE_FILE = ROOT / "skills_state.json"
BUILTIN_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills_builtin"


def ensure_dirs() -> None:
    """创建所需目录。"""
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    USER_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
