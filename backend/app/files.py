"""工作区文件操作：多文件解析、补丁应用、快照回滚。"""
import re
import shutil
from pathlib import Path

from app import store


# ---------------------------------------------------------------- 多文件解析

FILE_MARKER = re.compile(r"^===FILE:\s*(.+?)\s*===\s*$", re.MULTILINE)


def parse_multifile(text: str) -> dict:
    """解析 Builder 的多文件输出。

    约定格式：
        ===FILE: index.html===
        <内容>
        ===FILE: style.css===
        <内容>

    返回 {相对路径: 内容}。若没有任何标记，回退为单文件 index.html。
    """
    from app.verify import extract_html

    if not FILE_MARKER.search(text):
        html = extract_html(text)
        return {"index.html": html} if html else {}

    files: dict[str, str] = {}
    matches = list(FILE_MARKER.finditer(text))
    for i, m in enumerate(matches):
        path = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip("\n")
        content = _strip_fence(content)
        if path:
            files[path] = content
    return files


def _strip_fence(content: str) -> str:
    fence = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", content, re.DOTALL)
    return fence.group(1) if fence else content


def write_files(session_id: str, files: dict) -> list:
    written = []
    for path, content in files.items():
        store.write_workspace_file(session_id, path, content)
        written.append(path)
    return written


# ---------------------------------------------------------------- 补丁应用

def apply_patches(session_id: str, patches: list) -> tuple[list, list]:
    """应用 anchor/replacement 补丁。

    每个补丁：{"file","anchor","replacement"}。
    anchor 必须在文件中唯一命中，否则计为失败。
    返回 (成功的文件列表, 失败原因列表)。
    """
    applied = []
    errors = []
    for p in patches:
        path = p.get("file", "")
        anchor = p.get("anchor", "")
        replacement = p.get("replacement", "")
        content = store.read_workspace_file(session_id, path)
        if content is None:
            errors.append(f"{path}: 文件不存在")
            continue
        count = content.count(anchor)
        if not anchor:
            errors.append(f"{path}: anchor 为空")
            continue
        if count == 0:
            errors.append(f"{path}: anchor 未命中")
            continue
        if count > 1:
            errors.append(f"{path}: anchor 命中 {count} 处（需唯一），已跳过")
            continue
        new_content = content.replace(anchor, replacement, 1)
        store.write_workspace_file(session_id, path, new_content)
        if path not in applied:
            applied.append(path)
    return applied, errors


# ---------------------------------------------------------------- 快照

def snapshots_dir(session_id: str) -> Path:
    return store.session_dir(session_id) / "snapshots"


def take_snapshot(session_id: str) -> str:
    """把当前 workspace 复制成 snapshots/rev-NNN，返回 rev 名。"""
    snaps = snapshots_dir(session_id)
    snaps.mkdir(parents=True, exist_ok=True)
    existing = sorted(p.name for p in snaps.iterdir() if p.is_dir())
    rev = f"rev-{len(existing) + 1:03d}"
    ws = store.workspace_dir(session_id)
    if ws.exists():
        shutil.copytree(ws, snaps / rev)
    return rev


def list_snapshots(session_id: str) -> list:
    snaps = snapshots_dir(session_id)
    if not snaps.exists():
        return []
    return sorted(p.name for p in snaps.iterdir() if p.is_dir())


def rollback(session_id: str, rev: str) -> bool:
    """用某个快照覆盖当前 workspace。"""
    src = snapshots_dir(session_id) / rev
    if not src.exists():
        return False
    ws = store.workspace_dir(session_id)
    if ws.exists():
        shutil.rmtree(ws)
    shutil.copytree(src, ws)
    return True
