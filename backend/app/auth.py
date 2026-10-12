"""用户认证：邮箱校验、密码哈希、登录态 token、FastAPI 依赖。

设计取舍（笔试题范围）：
- 邮箱只做格式校验，不做发送验证。
- 密码用标准库 hashlib.pbkdf2_hmac（sha256）+ 随机 salt，不引入 bcrypt 依赖。
- 登录态用不透明随机 token 存库，服务端可即时吊销；不引入 JWT/PyJWT。
- get_current_user 同时支持 Authorization: Bearer 和 ?token= 查询参数，
  以便 iframe/导出链接等无法带 header 的场景复用。
"""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, AuthToken

# 宽松但实用的邮箱正则；笔试题只做格式校验
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# auto_error=False：未带 Authorization 头时不自动 403，留给 ?token= 兜底
bearer_scheme = HTTPBearer(auto_error=False)

TOKEN_TTL_DAYS = 30
_PBKDF2_ITERS = 200_000


def _now_utc_naive() -> datetime:
    """naive UTC：SQLite 的 DateTime 列返回 naive 时间，比较时必须同为 naive。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_valid_email(email: str) -> bool:
    return bool(email) and bool(EMAIL_RE.match(email.strip()))


# ---------------------------------------------------------------- 密码哈希

def hash_password(password: str) -> tuple[str, str]:
    """返回 (hash_hex, salt_hex)。"""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERS)
    return digest.hex(), salt


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), _PBKDF2_ITERS)
    return secrets.compare_digest(digest.hex(), hash_hex)


# ---------------------------------------------------------------- token

def issue_token(user_id: int, db: AsyncSession) -> str:
    token = secrets.token_urlsafe(32)
    expires = _now_utc_naive() + timedelta(days=TOKEN_TTL_DAYS)
    db.add(AuthToken(token=token, user_id=user_id, expires_at=expires))
    return token


async def resolve_token(token: str, db: AsyncSession) -> User | None:
    row = (await db.execute(select(AuthToken).where(AuthToken.token == token))).scalar_one_or_none()
    if not row:
        return None
    if row.expires_at < _now_utc_naive():
        await db.execute(delete(AuthToken).where(AuthToken.token == token))
        await db.commit()
        return None
    user = (await db.execute(select(User).where(User.id == row.user_id))).scalar_one_or_none()
    return user


async def revoke_token(token: str, db: AsyncSession) -> None:
    await db.execute(delete(AuthToken).where(AuthToken.token == token))
    await db.commit()


# ---------------------------------------------------------------- FastAPI 依赖

async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    token_query: str | None = Query(default=None, alias="token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """从 Bearer 头或 ?token= 取 token，校验后返回当前用户。

    用法：路由形参 user: User = Depends(get_current_user)。
    """
    raw = None
    if creds and creds.credentials:
        raw = creds.credentials.strip()
    elif token_query:
        raw = token_query.strip()

    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    user = await resolve_token(raw, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效，请重新登录")
    return user
