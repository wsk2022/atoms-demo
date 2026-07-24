"""生成产物的轻量校验：JSON 解析、HTML 完整性检查、HTML 提取。"""
import json
import re


def parse_json(text: str):
    """从模型输出中提取第一个 JSON 对象（容忍 markdown 围栏和前后文字）。"""
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fence.group(1) if fence else None
    if candidate is None:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = m.group(0) if m else None
    if not candidate:
        return None
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def html_complete(code: str) -> tuple[bool, str]:
    """纯字符串完整性检查，拦截被 max_tokens 截断的半成品。"""
    if not code:
        return False, "代码为空"
    low = code.lower()
    if "<html" not in low:
        return False, "缺少 <html> 根标签"
    if "</html>" not in low:
        return False, "缺少 </html> 闭合标签（可能被截断）"
    for tag in ("script", "style", "body"):
        opens = len(re.findall(rf"<{tag}[\s>]", low))
        closes = low.count(f"</{tag}>")
        if opens != closes:
            return False, f"<{tag}> 标签未配对（开 {opens} 闭 {closes}）"
    return True, ""


def extract_html(text: str) -> str:
    """从模型输出中提取 HTML 片段（剥掉可能的 markdown 围栏和前后解释）。"""
    if not text:
        return ""
    fence = re.search(r"```(?:html)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    low = text.lower()
    start = low.find("<!doctype")
    if start < 0:
        start = low.find("<html")
    end = low.rfind("</html>")
    if start >= 0 and end > start:
        return text[start:end + len("</html>")]
    return text.strip()
