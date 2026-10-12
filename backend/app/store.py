"""文件式会话存储：一会话一目录，替代数据库。

目录布局：
  data/sessions/{sid}/
    meta.json        # 元数据：标题、模式、idea、stage、cursor、seq
    pipeline.json    # 动态节点列表 + 每节点状态
    messages.json    # 结构化对话历史
    artifacts/       # 各 agent 的结构化产物（brief.json/blueprint.json/review.json…）
    workspace/       # 生成的应用代码
    snapshots/       # 迭代前的工作区快照
    pending.json     # 待用户回答的确认点
    answers.json     # 用户回答历史
"""
import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from app import config


def _now() -> float:
    return time.time()


def new_session_id() -> str:
    return uuid.uuid4().hex[:12]


def session_dir(session_id: str) -> Path:
    return config.SESSIONS_DIR / session_id


def workspace_dir(session_id: str) -> Path:
    return session_dir(session_id) / "workspace"


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- 元数据

def create_session(mode: str, idea: str, title: str = "", user_id: Optional[int] = None) -> dict:
    """创建会话目录及初始元数据，返回 meta。"""
    sid = new_session_id()
    sdir = session_dir(sid)
    workspace_dir(sid).mkdir(parents=True, exist_ok=True)
    (sdir / "artifacts").mkdir(parents=True, exist_ok=True)

    meta = {
        "id": sid,
        "title": title or idea[:40] or "未命名",
        "mode": mode,
        "idea": idea,
        "stage": "created",       # created | running | waiting_input | done | error
        "cursor": 0,              # pipeline 游标
        "seq": 0,                 # 事件序号
        "user_id": user_id,       # 归属用户（None 表示迁移期遗留的旧会话）
        "created_at": _now(),
        "updated_at": _now(),
    }
    _write_json(sdir / "meta.json", meta)
    _write_json(sdir / "messages.json", [])
    return meta


def load_meta(session_id: str) -> Optional[dict]:
    path = session_dir(session_id) / "meta.json"
    if not path.exists():
        return None
    return _read_json(path, None)


def save_meta(meta: dict) -> None:
    meta["updated_at"] = _now()
    _write_json(session_dir(meta["id"]) / "meta.json", meta)


def next_seq(meta: dict) -> int:
    """自增事件序号并持久化，保证跨请求连续。"""
    meta["seq"] = int(meta.get("seq", 0)) + 1
    save_meta(meta)
    return meta["seq"]


# ---------------------------------------------------------------- 对话

def append_message(session_id: str, role: str, content: str, agent: str = "") -> None:
    path = session_dir(session_id) / "messages.json"
    msgs = _read_json(path, [])
    msgs.append({"role": role, "agent": agent, "content": content, "at": _now()})
    _write_json(path, msgs)


def load_messages(session_id: str) -> list:
    return _read_json(session_dir(session_id) / "messages.json", [])


# ---------------------------------------------------------------- 产物

def save_artifact(session_id: str, name: str, data: Any) -> None:
    path = session_dir(session_id) / "artifacts" / f"{name}.json"
    _write_json(path, data)


def load_artifact(session_id: str, name: str) -> Any:
    path = session_dir(session_id) / "artifacts" / f"{name}.json"
    return _read_json(path, None)


# ---------------------------------------------------------------- 工作区文件

def write_workspace_file(session_id: str, rel_path: str, content: str) -> None:
    base = workspace_dir(session_id).resolve()
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)):
        raise ValueError(f"非法路径: {rel_path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def read_workspace_file(session_id: str, rel_path: str) -> Optional[str]:
    base = workspace_dir(session_id).resolve()
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)) or not target.exists():
        return None
    return target.read_text(encoding="utf-8")


def list_workspace_files(session_id: str) -> list:
    base = workspace_dir(session_id)
    if not base.exists():
        return []
    files = []
    for p in sorted(base.rglob("*")):
        if p.is_file():
            files.append(str(p.relative_to(base)))
    return files


# ---------------------------------------------------------------- 列表

def list_sessions(user_id: Optional[int] = None) -> list:
    """列出会话的精简元数据（供历史列表）。

    传 user_id 时只返回该用户的会话；不传则返回全部（向后兼容）。
    """
    if not config.SESSIONS_DIR.exists():
        return []
    out = []
    for sdir in config.SESSIONS_DIR.iterdir():
        meta = _read_json(sdir / "meta.json", None)
        if not meta:
            continue
        if user_id is not None and meta.get("user_id") != user_id:
            continue
        item = {k: meta[k] for k in ("id", "title", "mode", "stage", "updated_at") if k in meta}
        item["has_app"] = (sdir / "workspace" / "index.html").exists()
        out.append(item)
    return sorted(out, key=lambda m: m.get("updated_at", 0), reverse=True)


def owns_session(meta: Optional[dict], user_id: int) -> bool:
    """会话是否归属该用户。旧会话（user_id=None）视为不归属任何登录用户。"""
    return bool(meta) and meta.get("user_id") == user_id


# ---------------------------------------------------------------- 运行态

def save_pipeline(session_id: str, nodes: list) -> None:
    _write_json(session_dir(session_id) / "pipeline.json", nodes)


def load_pipeline(session_id: str) -> list:
    return _read_json(session_dir(session_id) / "pipeline.json", [])


def save_pending(session_id: str, pending: Optional[dict]) -> None:
    path = session_dir(session_id) / "pending.json"
    if pending is None:
        if path.exists():
            path.unlink()
        return
    _write_json(path, pending)


def load_pending(session_id: str) -> Optional[dict]:
    return _read_json(session_dir(session_id) / "pending.json", None)


def save_answer(session_id: str, answer: dict) -> None:
    """存用户对确认点的回答，供恢复时读取。"""
    path = session_dir(session_id) / "answers.json"
    answers = _read_json(path, [])
    answers.append({"answer": answer, "at": _now()})
    _write_json(path, answers)


def latest_answer(session_id: str) -> Optional[dict]:
    answers = _read_json(session_dir(session_id) / "answers.json", [])
    return answers[-1]["answer"] if answers else None
