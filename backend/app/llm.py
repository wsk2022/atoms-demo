"""LLM 客户端：基于 httpx 的流式调用，支持重试熔断和降级响应。

设计要点：
- 使用 httpx 直接调 OpenAI 兼容接口，流式返回 token 增量
- 区分临时错误（可重试）和永久错误（不重试）
- 无 API Key 时自动降级，返回可预览的最小页面
"""
import asyncio
import json
from typing import AsyncGenerator, Optional

import httpx

from app.config import settings


class LLMTempError(Exception):
    """可重试的临时错误（网络超时、5xx 等）。"""


class LLMFatalError(Exception):
    """永久错误（鉴权失败、余额不足），不重试。"""


def is_configured() -> bool:
    """LLM 是否已配置 API Key。"""
    return bool(settings.LLM_API_KEY)


async def stream(
    system: str,
    user: str,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """流式返回 LLM 输出的文本增量。

    无 Key 时自动走降级响应。
    """
    if not settings.LLM_API_KEY:
        async for chunk in _fallback_stream(user):
            yield chunk
        return

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}"}
    url = f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions"

    last_err: Optional[Exception] = None
    for attempt in range(settings.LLM_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(float(settings.LLM_TIMEOUT))
            ) as client:
                async with client.stream(
                    "POST", url, json=payload, headers=headers
                ) as resp:
                    if resp.status_code in (401, 403):
                        raise LLMFatalError("模型鉴权失败，请检查 API Key 配置")
                    if resp.status_code == 402:
                        raise LLMFatalError("模型余额不足，请充值后重试")
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        raise LLMTempError(
                            f"模型返回 {resp.status_code}: "
                            f"{body.decode('utf-8', 'ignore')[:200]}"
                        )
                    async for line in resp.aiter_lines():
                        text = _parse_sse_line(line)
                        if text:
                            yield text
            return
        except LLMFatalError:
            raise
        except (httpx.HTTPError, LLMTempError) as e:
            last_err = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise LLMTempError(f"模型多次重试失败: {last_err}")


async def complete(
    system: str,
    user: str,
    temperature: float = 0.7,
) -> str:
    """非流式调用，返回完整文本。"""
    result = ""
    async for chunk in stream(system, user, temperature):
        result += chunk
    return result


def _parse_sse_line(line: str) -> str:
    """解析一行 OpenAI 流式响应，返回文本增量。"""
    if not line or not line.startswith("data:"):
        return ""
    data = line[len("data:"):].strip()
    if data == "[DONE]" or not data:
        return ""
    try:
        obj = json.loads(data)
        return obj["choices"][0]["delta"].get("content") or ""
    except (json.JSONDecodeError, KeyError, IndexError):
        return ""


async def _fallback_stream(user_prompt: str) -> AsyncGenerator[str, None]:
    """无 Key 时的降级响应：生成一个可预览的最小页面。"""
    html = (
        '<!doctype html>\n<html lang="zh">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>SparkForge 预览</title>\n<style>\n'
        "body{font-family:system-ui;margin:0;display:grid;place-items:center;"
        "min-height:100vh;background:#0c0c0e;color:#fafafa}\n"
        ".card{padding:48px;border-radius:20px;background:#171717;"
        "box-shadow:0 8px 32px rgba(0,0,0,.5);text-align:center}\n"
        "h1{margin:0 0 12px;font-size:28px}\n"
        "p{margin:0;color:#737373;line-height:1.6}\n"
        "</style>\n</head>\n<body>\n"
        '<div class="card">\n'
        '<h1>SparkForge 已就绪 \u26a1</h1>\n'
        "<p>这是降级模式的预览页。配置 API Key 后即可生成真实应用。</p>\n"
        f'<p style="margin-top:16px;font-size:13px;color:#525252">'
        f"你的需求：{user_prompt[:80]}</p>\n"
        "</div>\n</body>\n</html>"
    )
    for i in range(0, len(html), 40):
        await asyncio.sleep(0.02)
        yield html[i : i + 40]
