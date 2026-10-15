from __future__ import annotations

"""API 路由。

RESTful 设计：
  GET    /api/modes                       列出可用模式及其 agent
  GET    /api/agents                       列出所有 agent
  POST   /api/sessions                     创建会话（mode, idea, title?）
  GET    /api/sessions                     列出历史会话
  GET    /api/sessions/{sid}               会话详情（meta + 消息 + 工作区文件 + 概览）
  POST   /api/sessions/{sid}/run           SSE：启动/恢复 pipeline
  POST   /api/sessions/{sid}/iterate       SSE：迭代修改
  POST   /api/sessions/{sid}/answer        回答确认/澄清
  GET    /api/sessions/{sid}/files         列出工作区文件
  GET    /api/sessions/{sid}/files/{path}  读单个文件内容
  GET    /api/sessions/{sid}/snapshots     列出快照
  POST   /api/sessions/{sid}/rollback      回滚到某快照
  GET    /api/sessions/{sid}/export        下载 zip
  GET    /api/preview/{sid}/{path}         预览（只返回 index.html / 静态资源）
  GET    /api/skills                       列出技能
  POST   /api/skills                       上传用户技能
  POST   /api/skills/{id}/toggle           启用/禁用
  DELETE /api/skills/{id}                  删除用户技能
  GET    /api/model                        读取模型配置
  PUT    /api/model                        更新模型配置（写 .env / 数据库）
"""
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select

from app import config, files, orchestrator, skills, store
from app.agents import list_agents
from app.auth import (
    bearer_scheme,
    extract_token,
    get_current_user,
    hash_password,
    is_valid_email,
    issue_token,
    resolve_token,
    revoke_token,
    verify_password,
)
from app.database import async_session
from app.models import User
from app.pipelines import get_modes

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- 认证


class RegisterIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/register")
async def register_api(body: RegisterIn):
    email = body.email.strip()
    if not is_valid_email(email):
        raise HTTPException(400, "邮箱格式不正确")
    if not body.password:
        raise HTTPException(400, "密码不能为空")

    async with async_session() as db:
        exists = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(409, "该邮箱已注册")
        pw_hash, salt = hash_password(body.password)
        user = User(email=email, password_hash=pw_hash, salt=salt)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = issue_token(user.id, db)
        await db.commit()
    return {"token": token, "user": {"id": user.id, "email": user.email}}


@router.post("/auth/login")
async def login_api(body: LoginIn):
    email = body.email.strip()
    if not is_valid_email(email):
        raise HTTPException(400, "邮箱格式不正确")
    if not body.password:
        raise HTTPException(400, "密码不能为空")

    async with async_session() as db:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if not user or not verify_password(body.password, user.salt, user.password_hash):
            raise HTTPException(401, "邮箱或密码不正确")
        token = issue_token(user.id, db)
        await db.commit()
    return {"token": token, "user": {"id": user.id, "email": user.email}}


@router.get("/auth/me")
async def me_api(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@router.post("/auth/logout")
async def logout_api(user: User = Depends(get_current_user)):
    async with async_session() as db:
        # 吊销当前 token：从依赖拿不到原 token，按当前用户吊销其最新 token
        # 更稳妥的做法是让前端直接丢弃本地 token；这里额外清理该用户全部 token
        from sqlalchemy import delete
        from app.models import AuthToken
        await db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
        await db.commit()
    return {"ok": True}


def _ensure_owned(meta: Optional[dict], user: User) -> dict:
    """校验会话存在且归属当前用户，否则抛 404/403。"""
    if not meta:
        raise HTTPException(404, "会话不存在")
    if not store.owns_session(meta, user.id):
        # 用 404 而非 403，避免泄露会话是否存在
        raise HTTPException(404, "会话不存在")
    return meta


# ---------------------------------------------------------------- 模式 / agent

@router.get("/modes")
def get_modes_api():
    return {"modes": get_modes()}


@router.get("/agents")
def get_agents_api():
    return {"agents": list_agents()}


# ---------------------------------------------------------------- 会话

class SessionIn(BaseModel):
    mode: str = "sketch"
    idea: str
    title: str = ""


@router.post("/sessions")
def create_session_api(body: SessionIn, user: User = Depends(get_current_user)):
    valid = {m["id"] for m in get_modes()}
    if body.mode not in valid:
        raise HTTPException(400, f"未知模式: {body.mode}")
    if not body.idea.strip():
        raise HTTPException(400, "idea 不能为空")
    meta = store.create_session(body.mode, body.idea.strip(), body.title.strip(), user_id=user.id)
    store.append_message(meta["id"], "user", body.idea.strip())
    return {"session": meta}


@router.get("/sessions")
def list_sessions_api(user: User = Depends(get_current_user)):
    return {"sessions": store.list_sessions(user_id=user.id)}


@router.get("/sessions/{sid}")
def get_session_api(sid: str, user: User = Depends(get_current_user)):
    meta = _ensure_owned(store.load_meta(sid), user)
    nodes = store.load_pipeline(sid)
    # files 携带内容：前端重开项目时源码视图可直接恢复（无需逐个再请求）
    files_payload = [
        {"path": p, "content": store.read_workspace_file(sid, p) or ""}
        for p in store.list_workspace_files(sid)
    ]
    return {
        "session": meta,
        "messages": store.load_messages(sid),
        "files": files_payload,
        "pipeline": store.load_pipeline(sid),
        "pending": store.load_pending(sid),
        "brief": store.load_artifact(sid, "brief"),
        "blueprint": store.load_artifact(sid, "blueprint"),
        "report": store.load_artifact(sid, "report"),
        "review": store.load_artifact(sid, "review"),
        "roster": _roster_view(meta.get("mode", "sketch"), nodes),
    }


def _roster_view(mode: str, nodes: list) -> dict:
    """前端右侧 agent 列表：每个 agent 的状态/活跃说明。

    先按模式铺满全部成员（pending），再用 pipeline 节点的实际状态覆盖——
    这样重开会话时也能看到每个 agent 的最终状态，而不是只看到有节点的。
    """
    from app.pipelines import MODES

    members: list = []
    for m in MODES:
        if m["id"] == mode:
            members = m["members"]
            break

    statuses = {a: "pending" for a in members}
    active_note: dict[str, str] = {}
    for n in nodes:
        aid = n.get("agent", "")
        st = n.get("status", "pending")
        if aid:
            statuses[aid] = st
        if st == "running" and n.get("output"):
            active_note[aid] = f"正在产出 {n['output']}"
    return {"statuses": statuses, "active_note": active_note}


# ---------------------------------------------------------------- 运行 / 迭代（SSE）

@router.post("/sessions/{sid}/run")
async def run_session_api(sid: str, user: User = Depends(get_current_user)):
    meta = _ensure_owned(store.load_meta(sid), user)

    async def event_stream():
        # 回答后的恢复：把 answer 合并进 idea，清 pipeline 重跑 triage
        pending = store.load_pending(sid)
        if pending and pending.get("kind") == "clarify":
            ans = store.latest_answer(sid) or {}
            if ans:
                _merge_answer_into_idea(meta, ans)
                store.save_pipeline(sid, [])
                meta["cursor"] = 0
                store.save_meta(meta)
            store.save_pending(sid, None)
        async for chunk in orchestrator.run(sid):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/sessions/{sid}/iterate")
async def iterate_session_api(sid: str, body: dict, user: User = Depends(get_current_user)):
    meta = _ensure_owned(store.load_meta(sid), user)
    instruction = (body.get("instruction") or "").strip()
    if not instruction:
        raise HTTPException(400, "instruction 不能为空")
    store.append_message(sid, "user", instruction)

    async def event_stream():
        async for chunk in orchestrator.run_iteration(sid, instruction):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _merge_answer_into_idea(meta: dict, answer: dict):
    """把用户对澄清问题的回答合并进 idea。"""
    answers = answer.get("answers", {})
    if not answers:
        return
    extra = []
    for qid, val in answers.items():
        if isinstance(val, list):
            val = "、".join(str(v) for v in val)
        extra.append(f"{qid}: {val}")
    meta["idea"] = (meta.get("idea", "") + "\n\n【用户补充】\n" + "\n".join(extra)).strip()


class AnswerIn(BaseModel):
    answers: dict
    choice: Optional[str] = None


@router.post("/sessions/{sid}/answer")
def answer_session_api(sid: str, body: AnswerIn, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    pending = store.load_pending(sid)
    if not pending:
        raise HTTPException(400, "没有待回答的确认点")
    store.save_answer(sid, {"answers": body.answers, "choice": body.choice})
    store.save_pending(sid, None)
    meta["stage"] = "running"
    store.save_meta(meta)
    return {"ok": True, "resume": True}


# ---------------------------------------------------------------- 文件 / 预览 / 快照 / 导出

@router.get("/sessions/{sid}/files")
def list_files_api(sid: str, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    return {"files": store.list_workspace_files(sid)}


@router.get("/sessions/{sid}/files/{path:path}")
def read_file_api(sid: str, path: str, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    content = store.read_workspace_file(sid, path)
    if content is None:
        raise HTTPException(404, "文件不存在")
    return {"path": path, "content": content}


_PREVIEW_ATTR_RE = re.compile(r'\b(src|href)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', re.IGNORECASE)


def _inject_preview_token(html: str, token: str) -> str:
    """把 ?token= 注入 HTML 中的相对资源链接。

    iframe 只在首屏 URL 上带了 token，HTML 里的 CSS/JS/图片等相对路径
    请求不会自动携带，会 401。这里在返回 HTML 前统一补上 token。
    """
    if not token:
        return html

    def _repl(m: "re.Match[str]") -> str:
        attr, quoted, single = m.group(1), m.group(2), m.group(3)
        url = quoted if quoted is not None else single
        quote = '"' if quoted is not None else "'"
        low = url.strip().lower()
        if (
            not url
            or low.startswith(("http://", "https://", "//", "data:", "#", "mailto:", "javascript:"))
            or "token=" in low
        ):
            return m.group(0)
        sep = "&" if "?" in url else "?"
        return f"{attr}={quote}{url}{sep}token={token}{quote}"

    return _PREVIEW_ATTR_RE.sub(_repl, html)


@router.get("/preview/{sid}/{path:path}")
def preview_api(
    sid: str,
    path: str,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    token_query: Optional[str] = Query(default=None, alias="token"),
    user: User = Depends(get_current_user),
):
    """直接以静态文件方式返回工作区文件，浏览器可打开。

    iframe/导出链接无法带 Authorization 头，因此本接口同时支持 ?token= 查询参数
    （get_current_user 已支持）。返回 HTML 时会把 token 注入其中的相对资源链接，
    避免子资源（CSS/JS/图片）因缺 token 而 401。
    """
    _ensure_owned(store.load_meta(sid), user)
    base = store.workspace_dir(sid).resolve()
    target = (base / path).resolve()
    if not str(target).startswith(str(base)) or not target.exists() or not target.is_file():
        raise HTTPException(404, "文件不存在")
    if target.suffix.lower() in (".html", ".htm"):
        token = extract_token(creds, token_query) or ""
        html = target.read_text(encoding="utf-8", errors="replace")
        return Response(_inject_preview_token(html, token), media_type="text/html; charset=utf-8")
    return FileResponse(str(target))


@router.get("/sessions/{sid}/snapshots")
def list_snapshots_api(sid: str, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    return {"snapshots": files.list_snapshots(sid)}


class RollbackIn(BaseModel):
    rev: str


@router.post("/sessions/{sid}/rollback")
def rollback_api(sid: str, body: RollbackIn, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    if not files.rollback(sid, body.rev):
        raise HTTPException(404, "快照不存在")
    return {"ok": True, "files": store.list_workspace_files(sid)}


@router.get("/sessions/{sid}/export")
def export_api(sid: str, user: User = Depends(get_current_user)):
    _ensure_owned(store.load_meta(sid), user)
    base = store.workspace_dir(sid)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if base.exists():
            for p in base.rglob("*"):
                if p.is_file():
                    zf.write(p, p.relative_to(base))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={sid}.zip"},
    )


# ---------------------------------------------------------------- Skills

class SkillIn(BaseModel):
    content: str


class SkillToggleIn(BaseModel):
    enabled: bool


@router.get("/skills")
def list_skills_api():
    return {"skills": skills.list_skills()}


@router.post("/skills")
def upload_skill_api(body: SkillIn):
    try:
        s = skills.install_user_skill(body.content)
    except skills.SkillError as e:
        raise HTTPException(400, str(e))
    return {"skill": s}


@router.post("/skills/{skill_id}/toggle")
def toggle_skill_api(skill_id: str, body: SkillToggleIn):
    if not skills.set_enabled(skill_id, body.enabled):
        raise HTTPException(404, "技能不存在")
    return {"ok": True}


@router.delete("/skills/{skill_id}")
def delete_skill_api(skill_id: str):
    if not skills.delete_user_skill(skill_id):
        raise HTTPException(404, "技能不存在或为内置")
    return {"ok": True}


# ---------------------------------------------------------------- 模型配置（数据库）

@router.get("/model")
async def get_model_api():
    from app.database import async_session
    from app.models import ModelConfig
    from sqlalchemy import select

    async with async_session() as db:
        row = (await db.execute(select(ModelConfig).order_by(ModelConfig.id.desc()))).scalars().first()
        if not row:
            return {"api_key": "", "base_url": config.settings.LLM_BASE_URL,
                    "model": config.settings.LLM_MODEL, "is_configured": False}
        return {"api_key": row.api_key, "base_url": row.base_url,
                "model": row.model, "is_configured": bool(row.api_key)}


class ModelIn(BaseModel):
    api_key: str
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"


@router.put("/model")
async def put_model_api(body: ModelIn):
    from app.database import async_session
    from app.models import ModelConfig
    from sqlalchemy import select

    # 同步写 .env（供下次启动用）
    env_path = Path(".env")
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    new_lines = []
    seen = set()
    for line in lines:
        if line.startswith("LLM_API_KEY="):
            new_lines.append(f"LLM_API_KEY={body.api_key}")
            seen.add("LLM_API_KEY")
        elif line.startswith("LLM_BASE_URL="):
            new_lines.append(f"LLM_BASE_URL={body.base_url}")
            seen.add("LLM_BASE_URL")
        elif line.startswith("LLM_MODEL="):
            new_lines.append(f"LLM_MODEL={body.model}")
            seen.add("LLM_MODEL")
        else:
            new_lines.append(line)
    for k, v in (("LLM_API_KEY", body.api_key), ("LLM_BASE_URL", body.base_url), ("LLM_MODEL", body.model)):
        if k not in seen:
            new_lines.append(f"{k}={v}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

    # 同步内存配置
    config.settings.LLM_API_KEY = body.api_key
    config.settings.LLM_BASE_URL = body.base_url
    config.settings.LLM_MODEL = body.model

    async with async_session() as db:
        row = (await db.execute(select(ModelConfig).order_by(ModelConfig.id.desc()))).scalars().first()
        if row:
            row.api_key = body.api_key
            row.base_url = body.base_url
            row.model = body.model
        else:
            db.add(ModelConfig(api_key=body.api_key, base_url=body.base_url, model=body.model))
        await db.commit()
    return {"ok": True}
