"""Skill 系统：内置 + 用户上传的 Markdown skill，动态注入 agent prompt。

Skill 文件格式：YAML frontmatter + Markdown 正文
    ---
    id: my-skill
    name: 我的技能
    description: 一句话说明
    agent: maker
    keywords: [关键词1, 关键词2]
    ---
    这里是 Markdown 正文，会作为 instructions 注入到该 agent 的 prompt。

启用状态存 data/skills_state.json；用户上传的 skill 存 data/user_skills/*.md。
"""
import re
from pathlib import Path
from typing import Optional

import yaml

from app import config

VALID_AGENTS = {"coordinator", "planner", "researcher", "architect", "builder", "reviewer"}
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
_FRONTMATTER_RE = re.compile(r"^\s*---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)

MAX_FILE_BYTES = 64 * 1024
MAX_INSTR_CHARS = 8000


class SkillError(ValueError):
    """skill 解析/校验错误。"""


def parse_and_validate(text: str) -> dict:
    """解析 Markdown（YAML frontmatter + 正文）并校验，返回规范化 dict。"""
    if len(text.encode("utf-8")) > MAX_FILE_BYTES:
        raise SkillError("文件过大（上限 64KB）")

    m = _FRONTMATTER_RE.match(text)
    if not m:
        raise SkillError("格式错误：需以 --- 包裹的 YAML frontmatter 开头，其后为 Markdown 正文")
    front_raw, body = m.group(1), m.group(2)

    try:
        meta = yaml.safe_load(front_raw)
    except yaml.YAMLError as e:
        raise SkillError(f"frontmatter YAML 解析失败：{e}")
    if not isinstance(meta, dict):
        raise SkillError("frontmatter 必须是键值对象")

    sid = str(meta.get("id", "")).strip()
    if not _ID_RE.match(sid):
        raise SkillError("id 非法：需为小写字母/数字/连字符，2-41 字符")

    name = str(meta.get("name", "")).strip()
    if not name:
        raise SkillError("缺少 name")

    agent = str(meta.get("agent", "")).strip()
    if agent not in VALID_AGENTS:
        raise SkillError(f"agent 非法，须为：{', '.join(sorted(VALID_AGENTS))}")

    instructions = body.strip()
    if not instructions:
        raise SkillError("正文为空：--- 之后需写 Markdown 指令内容")
    if len(instructions) > MAX_INSTR_CHARS:
        raise SkillError(f"正文过长（上限 {MAX_INSTR_CHARS} 字符）")

    keywords = meta.get("keywords", []) or []
    if not isinstance(keywords, list):
        raise SkillError("keywords 必须是列表")

    return {
        "id": sid,
        "name": name,
        "description": str(meta.get("description", "")).strip(),
        "agent": agent,
        "keywords": [str(k).strip() for k in keywords if str(k).strip()],
        "instructions": instructions,
    }


def _load_skill_file(path: Path) -> Optional[dict]:
    try:
        return parse_and_validate(path.read_text(encoding="utf-8"))
    except (SkillError, OSError):
        return None


def _load_state() -> dict:
    import json
    if not config.SKILLS_STATE_FILE.exists():
        return {}
    try:
        return json.loads(config.SKILLS_STATE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_state(state: dict) -> None:
    import json
    config.ROOT.mkdir(parents=True, exist_ok=True)
    config.SKILLS_STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def list_skills() -> list:
    """列出全部 skill（内置 + 用户），带 builtin / enabled 标记。"""
    state = _load_state()
    out = []
    if config.BUILTIN_SKILLS_DIR.exists():
        for path in sorted(config.BUILTIN_SKILLS_DIR.glob("*.md")):
            s = _load_skill_file(path)
            if s:
                s["builtin"] = True
                s["enabled"] = state.get(s["id"], True)
                out.append(s)
    if config.USER_SKILLS_DIR.exists():
        for path in sorted(config.USER_SKILLS_DIR.glob("*.md")):
            s = _load_skill_file(path)
            if s:
                s["builtin"] = False
                s["enabled"] = state.get(s["id"], True)
                out.append(s)
    return out


def get_skill(skill_id: str) -> Optional[dict]:
    for s in list_skills():
        if s["id"] == skill_id:
            return s
    return None


def install_user_skill(text: str) -> dict:
    """校验并保存用户上传的 skill，返回其 dict。"""
    skill = parse_and_validate(text)
    if config.BUILTIN_SKILLS_DIR.exists():
        for path in config.BUILTIN_SKILLS_DIR.glob("*.md"):
            b = _load_skill_file(path)
            if b and b["id"] == skill["id"]:
                raise SkillError(f"id「{skill['id']}」与内置 skill 冲突，请改名")
    config.USER_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    (config.USER_SKILLS_DIR / f"{skill['id']}.md").write_text(text, encoding="utf-8")
    state = _load_state()
    state[skill["id"]] = True
    _save_state(state)
    skill["builtin"] = False
    skill["enabled"] = True
    return skill


def set_enabled(skill_id: str, enabled: bool) -> bool:
    if not get_skill(skill_id):
        return False
    state = _load_state()
    state[skill_id] = enabled
    _save_state(state)
    return True


def delete_user_skill(skill_id: str) -> bool:
    path = config.USER_SKILLS_DIR / f"{skill_id}.md"
    if not path.exists():
        return False
    path.unlink()
    state = _load_state()
    state.pop(skill_id, None)
    _save_state(state)
    return True


def instructions_for(agent_id: str, idea: str = "") -> str:
    """返回应注入某 agent prompt 的 skill 正文。

    规则：该 agent 的、已启用的 skill；若 skill 有 keywords，则需命中 idea 才注入。
    """
    text = (idea or "").lower()
    blocks = []
    for s in list_skills():
        if s["agent"] != agent_id or not s["enabled"]:
            continue
        kws = s.get("keywords") or []
        if kws and not any(k.lower() in text for k in kws):
            continue
        blocks.append(f"【Skill: {s['name']}】\n{s['instructions']}")
    if not blocks:
        return ""
    return "\n\n━━━ 已启用的技能规范 ━━━\n" + "\n\n".join(blocks)
