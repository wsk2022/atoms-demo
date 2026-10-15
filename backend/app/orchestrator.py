"""编排器：按 pipeline 逐节点执行，流式推 SSE 事件，状态落盘可恢复。

支持：
- 普通节点（run）：调 agent，产出结构化/文本 artifact
- 分流节点（triage）：Director 决定是否澄清、复杂度，动态展开后续节点
- 并行组（parallel_group）：同组节点并发执行
- 确认门（gate）：暂停写盘，等用户回答后从断点恢复
- 迭代（run_iteration）：补丁优先 → 失败回退全量重写
"""
import asyncio
import logging
import re
from typing import AsyncGenerator

from app import files, llm, prompts, skills, store
from app.agents import AGENTS
from app.events import encode_sse, make_event
from app.pipelines import (
    PIPELINES, dict_to_node, node_to_dict, team_nodes_after_triage,
)
from app.verify import extract_html, html_complete, parse_json

log = logging.getLogger("sparkforge.orchestrator")


def _emit(meta: dict, event_type: str, **payload) -> str:
    seq = store.next_seq(meta)
    return encode_sse(make_event(meta["id"], seq, event_type, **payload))


def _with_skills(system: str, agent_id: str, idea: str) -> str:
    """把已启用且命中的 skill 正文追加到 agent 的 system prompt。"""
    extra = skills.instructions_for(agent_id, idea)
    return system + "\n" + extra if extra else system


def _pipeline_view(nodes: list) -> list:
    return [
        {"agent": n["lead"], "node": n["deliverable"], "status": n.get("status", "pending")}
        for n in nodes
    ]


def _conclusion(agent_id: str, output: str, data) -> str:
    """从 agent 的结构化产物提炼一句"结论"，展示在对话里。"""
    d = data if isinstance(data, dict) else {}
    if agent_id == "director":
        cx = {"simple": "简单", "complex": "复杂"}.get(d.get("complexity", ""), d.get("complexity", ""))
        summ = d.get("summary", "")
        return f"判定为「{cx}」任务。{summ}".strip("。 ")
    if agent_id == "strategist":
        feats = d.get("features", [])
        names = "、".join(f.get("title", "") for f in feats[:5] if f.get("title"))
        return f"梳理出 {len(feats)} 项功能" + (f"：{names}" if names else "")
    if agent_id == "scout":
        txt = (d.get("text") or "").replace("\n", " ").strip()
        return "已完成调研：" + (txt[:80] + "…" if len(txt) > 80 else txt) if txt else "已完成调研"
    if agent_id == "architect":
        ents = d.get("entities", [])
        views = d.get("views", [])
        return f"设计 {len(ents)} 个数据实体、{len(views)} 个视图"
    if agent_id == "auditor":
        if d.get("verdict") == "pass":
            return "验收通过 ✅ " + (d.get("notes", "")[:60])
        issues = d.get("issues", [])
        first = issues[0].get("problem", "") if issues else ""
        return f"验收未通过，发现 {len(issues)} 个问题：{first[:60]}"
    return ""


# ---------------------------------------------------------------- 上下文拼装

def _maker_context(meta: dict) -> str:
    """团队模式下把 brief/blueprint 作为 Builder 的上下文。"""
    sid = meta["id"]
    parts = []
    brief = store.load_artifact(sid, "brief")
    if brief:
        parts.append(f"\n【需求规格】\n{_brief_text(brief)}")
    blueprint = store.load_artifact(sid, "blueprint")
    if blueprint:
        parts.append(f"\n【架构设计】\n{_blueprint_text(blueprint)}")
    report = store.load_artifact(sid, "report")
    if report:
        rep = report if isinstance(report, str) else report.get("text", "")
        if rep:
            parts.append(f"\n【调研摘要】\n{rep[:800]}")
    return "\n".join(parts)


def _brief_text(brief) -> str:
    if not isinstance(brief, dict):
        return str(brief)[:800]
    lines = [f"产品：{brief.get('product_name','')} — {brief.get('summary','')}"]
    for f in brief.get("features", []):
        acc = "；".join(f.get("acceptance", []))
        lines.append(f"- {f.get('title','')}: {f.get('story','')}（验收：{acc}）")
    return "\n".join(lines)


def _blueprint_text(bp) -> str:
    if not isinstance(bp, dict):
        return str(bp)[:800]
    lines = []
    for v in bp.get("views", []):
        lines.append(f"- 视图 {v.get('name','')}: {v.get('purpose','')} [{', '.join(v.get('elements',[]))}]")
    for it in bp.get("interactions", []):
        lines.append(f"- 交互: {it}")
    return "\n".join(lines)


# ---------------------------------------------------------------- 主入口

async def run(session_id: str) -> AsyncGenerator[str, None]:
    """运行/恢复一个会话的 pipeline。"""
    meta = store.load_meta(session_id)
    if not meta:
        return

    mode = meta.get("mode", "sketch")

    nodes = store.load_pipeline(session_id)
    if not nodes:
        nodes = [node_to_dict(n) for n in PIPELINES.get(mode, PIPELINES["sketch"])]
        store.save_pipeline(session_id, nodes)
        meta["cursor"] = 0
    yield _emit(meta, "mode_selected", mode=mode, pipeline=_pipeline_view(nodes))

    meta["stage"] = "running"
    store.save_meta(meta)

    try:
        while meta["cursor"] < len(nodes):
            node = dict_to_node(nodes[meta["cursor"]])

            # ---- 分流节点 ----
            if node.mode == "triage":
                pause = False
                async for item in _run_triage(meta, nodes):
                    if item[0] == "__pause__":
                        pause = True
                        continue
                    yield item[1]
                if pause:
                    return
                nodes = store.load_pipeline(session_id)
                meta = store.load_meta(session_id)
                continue

            # ---- 并行组 ----
            if node.squad:
                group = node.squad
                wave_idx = []
                i = meta["cursor"]
                while i < len(nodes) and nodes[i].get("squad") == group:
                    wave_idx.append(i)
                    i += 1
                yield _emit(meta, "parallel_start", group=group,
                            agents=[nodes[j]["lead"] for j in wave_idx])
                async for ev in _run_wave(meta, [nodes[j] for j in wave_idx]):
                    yield ev
                for j in wave_idx:
                    nodes[j]["status"] = "done"
                meta["cursor"] = i
                store.save_pipeline(session_id, nodes)
                store.save_meta(meta)
                yield _emit(meta, "parallel_done", group=group)
                continue

            # ---- 普通节点 ----
            async for ev in _run_node(meta, node):
                yield ev
            nodes[meta["cursor"]]["status"] = "done"
            meta["cursor"] += 1
            store.save_pipeline(session_id, nodes)
            store.save_meta(meta)

            # ---- 确认门：暂停 ----
            if node.checkpoint:
                meta["stage"] = "waiting_input"
                store.save_meta(meta)
                store.save_pending(session_id, {"kind": "gate", "after": node.deliverable})
                yield _emit(meta, "confirm", purpose="gate",
                            summary=f"{node.deliverable} 已完成，是否继续？",
                            options=[{"id": "continue", "label": "继续"},
                                     {"id": "stop", "label": "到此为止"}])
                return

        meta["stage"] = "done"
        store.save_meta(meta)
        ws_files = store.list_workspace_files(session_id)
        yield _emit(meta, "done", summary="生成完成", files=ws_files)

    except llm.LLMFatalError as e:
        meta["stage"] = "error"
        store.save_meta(meta)
        yield _emit(meta, "error", message=str(e), fatal=True)
    except Exception as e:  # noqa: BLE001
        log.exception("orchestrator 出错")
        meta["stage"] = "error"
        store.save_meta(meta)
        yield _emit(meta, "error", message=f"{type(e).__name__}: {e}", fatal=False)


# ---------------------------------------------------------------- 分流

async def _run_triage(meta: dict, nodes: list):
    """Director 分流：可能澄清（暂停）或展开后续节点。"""
    sid = meta["id"]
    system = prompts.DIRECTOR_SYSTEM
    user = prompts.DIRECTOR_USER.format(idea=meta["idea"])
    system = _with_skills(system, "director", meta["idea"])

    raw = ""
    agent = AGENTS["director"]
    yield ("event", _emit(meta, "agent_start", agent=agent.id, node="route", role=agent.craft))
    async for text in llm.stream(system, user):
        raw += text
        yield ("event", _emit(meta, "delta", agent=agent.id, text=text))

    data = parse_json(raw) or {}
    store.save_artifact(sid, "route", data)

    answered = store.latest_answer(sid)

    if data.get("need_clarify") and not answered:
        meta["stage"] = "waiting_input"
        store.save_meta(meta)
        store.save_pending(sid, {"kind": "clarify", "node": "route"})
        yield ("event", _emit(meta, "agent_done", agent=agent.id, node="route", status="done"))
        yield ("event", _emit(meta, "clarify",
                              questions=data.get("questions", []),
                              summary=data.get("summary", "")))
        yield ("__pause__", None)
        return

    concl = _conclusion("director", "route", data)
    yield ("event", _emit(meta, "agent_done", agent=agent.id, node="route",
                          status="done", conclusion=concl))

    complexity = data.get("complexity", "complex")
    yield ("event", _emit(meta, "overview", summary=data.get("summary", ""),
                          plan=data.get("plan", ""), mode=meta["mode"]))

    expanded = team_nodes_after_triage(complexity)
    new_nodes = [nodes[meta["cursor"]]]
    new_nodes[0]["status"] = "done"
    new_nodes += [node_to_dict(n) for n in expanded]
    store.save_pipeline(sid, new_nodes)
    meta["cursor"] = 1
    store.save_meta(meta)

    yield ("event", _emit(meta, "mode_selected", mode=meta["mode"],
                          pipeline=_pipeline_view(new_nodes)))


# ---------------------------------------------------------------- 并行 wave

async def _run_wave(meta: dict, wave_nodes: list):
    """并发执行同组节点，事件通过队列合并回主流。"""
    queue: asyncio.Queue = asyncio.Queue()

    async def worker(nd: dict):
        node = dict_to_node(nd)
        try:
            async for ev in _run_node(meta, node):
                await queue.put(ev)
        except Exception as e:  # noqa: BLE001
            await queue.put(_emit(meta, "agent_done", agent=node.lead,
                                  node=node.deliverable, status="failed"))
            log.warning("wave 节点 %s 失败: %s", node.deliverable, e)
        finally:
            await queue.put({"__done__": nd["deliverable"]})

    tasks = [asyncio.create_task(worker(nd)) for nd in wave_nodes]
    remaining = len(tasks)
    while remaining:
        item = await queue.get()
        if isinstance(item, dict) and item.get("__done__"):
            remaining -= 1
        else:
            yield item
    await asyncio.gather(*tasks, return_exceptions=True)


# ---------------------------------------------------------------- 单节点执行

async def _run_node(meta: dict, node) -> AsyncGenerator[str, None]:
    sid = meta["id"]
    agent_id = node.lead

    if agent_id == "maker":
        async for ev in _run_maker(meta, node):
            yield ev
        return

    system, user = _prompt_for(meta, node)
    system = _with_skills(system, agent_id, meta["idea"])
    agent = AGENTS[agent_id]
    yield _emit(meta, "agent_start", agent=agent.id, node=node.deliverable, role=agent.craft)
    raw = ""
    async for text in llm.stream(system, user):
        raw += text
        yield _emit(meta, "delta", agent=agent.id, text=text)

    if agent_id == "scout":
        store.save_artifact(sid, node.deliverable, {"text": raw})
        yield _emit(meta, "artifact", name=node.deliverable, data={"text": raw[:2000]})
        concl = _conclusion(agent_id, node.deliverable, {"text": raw})
        store.append_message(sid, "assistant", concl or f"{node.deliverable} 已完成", agent=agent.id)
        yield _emit(meta, "agent_done", agent=agent.id, node=node.deliverable,
                    status="done", conclusion=concl)
        return

    data = parse_json(raw)
    store.save_artifact(sid, node.deliverable, data if data is not None else {"raw": raw})
    yield _emit(meta, "artifact", name=node.deliverable, data=data or {"raw": raw[:2000]})
    concl = _conclusion(agent_id, node.deliverable, data)
    if agent_id == "auditor" and isinstance(data, dict):
        yield _emit(meta, "verify", level="review",
                    ok=(data.get("verdict") == "pass"),
                    errors=[i.get("problem", "") for i in data.get("issues", [])])
        store.append_message(sid, "assistant", concl or "验收完成", agent=agent.id)
        yield _emit(meta, "agent_done", agent=agent.id, node=node.deliverable,
                    status="done", conclusion=concl)
        async for ev in _review_fix_loop(meta, data):
            yield ev
        return

    store.append_message(sid, "assistant", concl or f"{node.deliverable} 已完成", agent=agent.id)
    yield _emit(meta, "agent_done", agent=agent.id, node=node.deliverable,
                status="done", conclusion=concl)


async def _review_fix_loop(meta: dict, review: dict) -> AsyncGenerator[str, None]:
    """Reviewer 判 needs_fix 时，Builder 按 fix_brief 补丁修复并复审，最多 2 轮。"""
    sid = meta["id"]
    maker = AGENTS["maker"]
    auditor = AGENTS["auditor"]

    for attempt in range(1, 3):
        if review.get("verdict") == "pass":
            return
        fix_brief = review.get("fix_brief") or "；".join(
            i.get("problem", "") for i in review.get("issues", []))
        if not fix_brief:
            return

        yield _emit(meta, "agent_start", agent=maker.id, node="fix",
                    role=f"修复(第{attempt}轮)")
        ws_files = store.list_workspace_files(sid)
        file_contents = "\n\n".join(
            f"===FILE: {p}===\n{store.read_workspace_file(sid, p)}" for p in ws_files)
        system = prompts.MAKER_PATCH_SYSTEM
        user = prompts.MAKER_PATCH_USER.format(
            files_summary="、".join(ws_files),
            file_contents=file_contents[:12000],
            instruction=f"验收发现以下问题，请修复：{fix_brief}")
        system = _with_skills(system, "maker", meta["idea"])
        raw = ""
        async for text in llm.stream(system, user):
            raw += text
            yield _emit(meta, "delta", agent=maker.id, text=text)

        patches = (parse_json(raw) or {}).get("patches", [])
        if patches:
            applied, errors = files.apply_patches(sid, patches)
            for path in applied:
                content = store.read_workspace_file(sid, path) or ""
                yield _emit(meta, "file_write", path=path, content=content, change="modified")
            if errors:
                yield _emit(meta, "verify", level="fix", ok=False, errors=errors)
        fix_concl = f"已按验收意见修复（第{attempt}轮）：{fix_brief[:50]}"
        yield _emit(meta, "agent_done", agent=maker.id, node="fix",
                    status="done", conclusion=fix_concl)
        yield _emit(meta, "preview_ready",
                    url=f"/api/preview/{sid}/index.html", kind="multi_file")

        yield _emit(meta, "agent_start", agent=auditor.id, node="review",
                    role=f"复审(第{attempt}轮)")
        brief = store.load_artifact(sid, "brief")
        code = store.read_workspace_file(sid, "index.html") or ""
        rsys = prompts.AUDITOR_SYSTEM
        ruser = prompts.AUDITOR_USER.format(
            brief=_brief_text(brief) if brief else "（无）", code=code[:6000])
        rsys = _with_skills(rsys, "auditor", meta["idea"])
        raw = ""
        async for text in llm.stream(rsys, ruser):
            raw += text
            yield _emit(meta, "delta", agent=auditor.id, text=text)
        review = parse_json(raw) or {"verdict": "pass"}
        store.save_artifact(sid, "review", review)
        yield _emit(meta, "verify", level="review",
                    ok=(review.get("verdict") == "pass"),
                    errors=[i.get("problem", "") for i in review.get("issues", [])])
        yield _emit(meta, "agent_done", agent=auditor.id, node="review",
                    status="done", conclusion=_conclusion("auditor", "review", review))

    if review.get("verdict") != "pass":
        yield _emit(meta, "phase", note="修复已达上限，仍存在已知问题（已如实保留）")


def _prompt_for(meta: dict, node) -> tuple[str, str]:
    sid = meta["id"]
    aid = node.lead
    if aid == "strategist":
        return prompts.STRATEGIST_SYSTEM, prompts.STRATEGIST_USER.format(idea=meta["idea"])
    if aid == "scout":
        return prompts.SCOUT_SYSTEM, prompts.SCOUT_USER.format(idea=meta["idea"])
    if aid == "architect":
        brief = store.load_artifact(sid, "brief")
        report = store.load_artifact(sid, "report")
        rep_text = (report or {}).get("text", "") if isinstance(report, dict) else ""
        return prompts.ARCHITECT_SYSTEM, prompts.ARCHITECT_USER.format(
            brief=_brief_text(brief) if brief else "（无）",
            report=rep_text[:600] or "（无）")
    if aid == "auditor":
        brief = store.load_artifact(sid, "brief")
        code = store.read_workspace_file(sid, "index.html") or ""
        return prompts.AUDITOR_SYSTEM, prompts.AUDITOR_USER.format(
            brief=_brief_text(brief) if brief else "（无）", code=code[:6000])
    return "你是一个助手。", meta["idea"]


# ---------------------------------------------------------------- Builder

async def _run_maker(meta: dict, node) -> AsyncGenerator[str, None]:
    sid = meta["id"]
    agent = AGENTS["maker"]

    yield _emit(meta, "agent_start", agent=agent.id, node="code", role=agent.craft)

    mode = meta["mode"]
    multifile = mode == "workshop"

    context = _maker_context(meta) if mode != "sketch" else ""
    if mode == "expedition":
        report = store.load_artifact(sid, "report")
        rep = (report or {}).get("text", "") if isinstance(report, dict) else ""
        if rep:
            context = f"\n请基于以下调研报告制作一个精美的展示网页：\n{rep[:3000]}"

    if multifile:
        system = prompts.MAKER_MULTIFILE_SYSTEM
        user = prompts.MAKER_MULTIFILE_USER.format(idea=meta["idea"], context=context)
    else:
        system = prompts.MAKER_SINGLE_PAGE_SYSTEM
        user = prompts.MAKER_SINGLE_PAGE_USER.format(idea=meta["idea"], context=context)
    system = _with_skills(system, "maker", meta["idea"])

    raw = ""
    async for text in llm.stream(system, user):
        raw += text
        yield _emit(meta, "delta", agent=agent.id, text=text)

    if multifile:
        parsed = files.parse_multifile(raw)
    else:
        html = extract_html(raw)
        parsed = {"index.html": html} if html else {}

    if not parsed:
        yield _emit(meta, "verify", level="L1", ok=False, errors=["未解析出任何文件"])
        yield _emit(meta, "agent_done", agent=agent.id, node="code", status="done_with_warnings")
        return

    written = files.write_files(sid, parsed)
    total_bytes = sum(len(c) for c in parsed.values())
    concl = f"生成 {len(written)} 个文件（{', '.join(written)}），共 {total_bytes} 字符"
    store.append_message(sid, "assistant", concl, agent=agent.id)

    index_html = parsed.get("index.html", "")
    ok, reason = html_complete(index_html) if index_html else (True, "")

    for path in written:
        yield _emit(meta, "file_write", path=path, content=parsed[path], change="new")
    yield _emit(meta, "verify", level="L1", ok=ok, errors=[] if ok else [reason])
    yield _emit(meta, "preview_ready", url=f"/api/preview/{sid}/index.html",
                kind="multi_file" if multifile else "single_page")
    yield _emit(meta, "agent_done", agent=agent.id, node="code", conclusion=concl,
                status="done" if ok else "done_with_warnings")


# ---------------------------------------------------------------- 迭代

async def run_iteration(session_id: str, instruction: str) -> AsyncGenerator[str, None]:
    """补丁优先的增量迭代：先快照，让 Builder 输出补丁，应用；失败回退全量重写。"""
    meta = store.load_meta(session_id)
    if not meta:
        return
    agent = AGENTS["maker"]
    meta["stage"] = "running"
    store.save_meta(meta)

    rev = files.take_snapshot(session_id)
    yield _emit(meta, "snapshot", rev=rev)
    yield _emit(meta, "agent_start", agent=agent.id, node="iterate", role="迭代修改")

    ws_files = store.list_workspace_files(session_id)
    file_contents = "\n\n".join(
        f"===FILE: {p}===\n{store.read_workspace_file(session_id, p)}"
        for p in ws_files
    )
    system = prompts.MAKER_PATCH_SYSTEM
    user = prompts.MAKER_PATCH_USER.format(
        files_summary="、".join(ws_files),
        file_contents=file_contents[:12000],
        instruction=instruction,
    )
    system = _with_skills(system, "maker", meta["idea"] + " " + instruction)

    raw = ""
    async for text in llm.stream(system, user):
        raw += text
        yield _emit(meta, "delta", agent=agent.id, text=text)

    data = parse_json(raw) or {}
    patches = data.get("patches", [])

    if patches:
        applied, errors = files.apply_patches(session_id, patches)
        if applied and not errors:
            for path in applied:
                content = store.read_workspace_file(session_id, path) or ""
                yield _emit(meta, "file_write", path=path, content=content, change="modified")
            yield _emit(meta, "verify", level="patch", ok=True,
                        errors=[], note=data.get("note", ""))
            _finish_iteration(meta, agent, data.get("note", "补丁已应用"))
            yield _emit(meta, "preview_ready",
                        url=f"/api/preview/{session_id}/index.html", kind="multi_file")
            yield _emit(meta, "agent_done", agent=agent.id, node="iterate", status="done")
            yield _emit(meta, "done", summary=data.get("note", "迭代完成"),
                        files=store.list_workspace_files(session_id))
            return
        yield _emit(meta, "verify", level="patch", ok=False, errors=errors)

    yield _emit(meta, "phase", note="补丁不适用，转为全量重写")
    async for ev in _full_rewrite(meta, instruction):
        yield ev


def _finish_iteration(meta, agent, note):
    store.append_message(meta["id"], "assistant", note, agent=agent.id)
    meta["stage"] = "done"
    store.save_meta(meta)


def _existing_storage_keys(sid: str) -> list:
    """扫描当前工作区代码里已使用的 localStorage 键名（保护用户数据用）。"""
    keys: list = []
    for p in store.list_workspace_files(sid):
        if not p.endswith((".html", ".htm", ".js")):
            continue
        content = store.read_workspace_file(sid, p) or ""
        for m in re.finditer(r"localStorage\.(?:getItem|setItem)\(\s*[\"']([^\"']+)[\"']", content):
            if m.group(1) not in keys:
                keys.append(m.group(1))
    return keys


async def _full_rewrite(meta: dict, instruction: str) -> AsyncGenerator[str, None]:
    sid = meta["id"]
    agent = AGENTS["maker"]
    yield _emit(meta, "agent_start", agent=agent.id, node="rewrite", role="全量重写")

    prev = store.read_workspace_file(sid, "index.html") or ""
    keep = ""
    keys = _existing_storage_keys(sid)
    if keys:
        keep = (
            "\n\n【重要】当前应用已使用以下 localStorage 键保存用户数据："
            + "、".join(keys)
            + "。重写后必须继续使用完全相同的键名读写已有数据，"
              "确保用户既有记录（如历史、待办）在重写后仍然可见，不许更换键名或清空数据。"
        )
    context = (f"\n这是当前的 index.html，请在此基础上按指令修改：\n{prev[:6000]}"
               f"\n\n修改指令：{instruction}{keep}")
    system = prompts.MAKER_MULTIFILE_SYSTEM
    user = prompts.MAKER_MULTIFILE_USER.format(idea=meta["idea"], context=context)
    system = _with_skills(system, "maker", meta["idea"])

    raw = ""
    async for text in llm.stream(system, user):
        raw += text
        yield _emit(meta, "delta", agent=agent.id, text=text)

    parsed = files.parse_multifile(raw)
    if not parsed:
        yield _emit(meta, "agent_done", agent=agent.id, node="rewrite", status="failed")
        yield _emit(meta, "error", message="重写未解析出文件", fatal=False)
        return
    written = files.write_files(sid, parsed)
    for path in written:
        yield _emit(meta, "file_write", path=path, content=parsed[path], change="modified")
    _finish_iteration(meta, agent, "已全量重写")
    yield _emit(meta, "preview_ready", url=f"/api/preview/{sid}/index.html", kind="multi_file")
    yield _emit(meta, "agent_done", agent=agent.id, node="rewrite", status="done")
    yield _emit(meta, "done", summary="迭代完成（全量重写）",
                files=store.list_workspace_files(sid))
