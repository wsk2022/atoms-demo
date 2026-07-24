"""SSE 事件协议。

统一信封: { v, seq, session, type, payload }。
"""
import json
from typing import Any


SCHEMA_VERSION = 1


def make_event(session_id: str, seq: int, event_type: str, **payload: Any) -> dict:
    """构造一个版本化事件信封。"""
    return {
        "v": SCHEMA_VERSION,
        "seq": seq,
        "session": session_id,
        "type": event_type,
        "payload": payload,
    }


def encode_sse(event: dict) -> str:
    """把事件编码成一条 SSE 消息。"""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
