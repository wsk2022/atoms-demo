"use client";

import { useEffect, useRef, useState } from "react";
import {
  createSession,
  fetchModes,
  fetchModelConfig,
  runSession,
  submitAnswer,
  iterateSession,
  loadSession,
  exportUrl,
  LoomEvent,
  Mode,
} from "@/lib/api";
import AgentTimeline from "@/components/AgentTimeline";
import CenterPanel, { FileItem } from "@/components/CenterPanel";
import Chat, { ChatMessage } from "@/components/Chat";
import ConfirmCard, { ConfirmData } from "@/components/ConfirmCard";
import HistorySidebar from "@/components/HistorySidebar";
import Landing from "@/components/Landing";
import Modal from "@/components/Modal";
import SettingsModal from "@/components/SettingsModal";
import Snapshots from "@/components/Snapshots";
import Logo from "@/components/Logo";
import Gallery from "@/components/Gallery";
import SkillMarket from "@/components/SkillMarket";
import { AgentStatus } from "@/lib/api";

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// agent 名 → 中文动作，用于对话里的关键信息
const AGENT_ACTION: Record<string, string> = {
  director: "分析需求中…",
  strategist: "梳理需求规格…",
  scout: "调研中…",
  architect: "设计架构…",
  maker: "编写代码…",
  auditor: "验收中…",
};

const NODE_LABEL: Record<string, string> = {
  route: "需求分流",
  brief: "需求规格",
  report: "调研报告",
  blueprint: "架构设计",
  code: "代码",
  review: "验收",
  iterate: "迭代修改",
  fix: "修复",
  rewrite: "全量重写",
};

export default function Home() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [mode, setMode] = useState("sketch");
  const [idea, setIdea] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false); // 是否进入工作台
  const [homeTab, setHomeTab] = useState<"home" | "gallery" | "skills">("home");

  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>({});
  const [agentNote, setAgentNote] = useState<Record<string, string>>({});
  // 各 agent 的执行记录（供“详细”面板展示）：agentId → 结论历史
  const [agentLog, setAgentLog] = useState<Record<string, string[]>>({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [stage, setStage] = useState<string>();
  const [confirm, setConfirm] = useState<ConfirmData | null>(null);
  const [overview, setOverview] = useState<any>({});
  const [completed, setCompleted] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [snapKey, setSnapKey] = useState(0); // 快照列表刷新触发器
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);

  // 启动时检查模型是否已配置
  useEffect(() => {
    fetchModelConfig()
      .then((c) => setModelConfigured(c.is_configured))
      .catch(() => setModelConfigured(false));
  }, []);

  // 设置弹窗关闭后刷新配置状态
  function onSettingsClose() {
    setSettingsOpen(false);
    fetchModelConfig()
      .then((c) => setModelConfigured(c.is_configured))
      .catch(() => {});
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // delta 缓冲：累积每个 agent 的输出，用 rAF 批量刷新当前活动卡（避免上万次 setState）
  const bufRef = useRef<Record<string, string>>({});
  const rawRef = useRef<Record<string, string>>({});
  const rafRef = useRef<number | null>(null);

  function flushBuf() {
    rafRef.current = null;
    const buf = bufRef.current;
    setMessages((prev) => {
      const next = [...prev];
      // 更新每个仍在 streaming 的活动卡为其最新预览
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (m.streaming && m.agent && buf[m.agent] != null) {
          next[i] = { ...m, content: buf[m.agent] };
        }
      }
      return next;
    });
  }

  function scheduleFlush() {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushBuf);
  }

  // 把 agent 的原始输出转成对话里展示的“关键信息预览”（固定长度滚动窗口，防刷屏）
  function previewText(agent: string, raw: string): string {
    const WINDOW = 160; // 固定展示末尾 N 个字符，滚动更新
    const clean = raw.replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.length > WINDOW ? "…" + clean.slice(-WINDOW) : clean;
  }

  useEffect(() => {
    fetchModes().then(setModes).catch(() => {});
  }, []);

  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  const modeName = modes.find((m) => m.id === mode)?.name;

  // 当前会话对应模式的完整角色名单（固定展示在右侧）
  const [rosterMode, setRosterMode] = useState<string>("sketch");
  const roster = modes.find((m) => m.id === rosterMode)?.agent_details || [];

  // 把某模式的全部角色初始化为 pending
  function seedRoster(modeId: string): Record<string, AgentStatus> {
    const m = modes.find((mm) => mm.id === modeId);
    const seed: Record<string, AgentStatus> = {};
    (m?.agent_details || []).forEach((a) => (seed[a.id] = "pending"));
    return seed;
  }

  // 关键信息驱动：不再逐字输出，只在生命周期事件写简短活动行
  function handleEvent(e: LoomEvent) {
    const p = e.payload || {};
    switch (e.type) {
      case "mode_selected":
        // 用后端每节点状态更新对应 agent 的状态（保留已完成/进行中，不无脑重置）
        setAgentStatus((prev) => {
          const next = { ...prev };
          (p.pipeline || []).forEach((n: any) => {
            const s = n.status as AgentStatus | undefined;
            if (s && s !== "pending") next[n.agent] = s;
            else if (!next[n.agent]) next[n.agent] = "pending";
          });
          return next;
        });
        break;

      case "agent_start":
        setAgentStatus((prev) => ({ ...prev, [p.agent]: "running" }));
        setAgentNote((prev) => ({ ...prev, [p.agent]: p.role || "工作中…" }));
        bufRef.current[p.agent] = "";
        // 活动卡：一条“XX 正在做什么”的卡（随后由 delta 实时更新预览）
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            agent: p.agent,
            content: p.role || AGENT_ACTION[p.agent] || "处理中…",
            streaming: true,
          },
        ]);
        break;

      // delta：累积原始文本，rAF 批量把“关键信息预览”刷进活动卡（不逐字刷 state）
      case "delta":
        if (p.agent) {
          rawRef.current[p.agent] = (rawRef.current[p.agent] || "") + (p.text || "");
          bufRef.current[p.agent] = previewText(p.agent, rawRef.current[p.agent]);
          scheduleFlush();
        }
        break;

      case "agent_done": {
        setAgentStatus((prev) => ({ ...prev, [p.agent]: p.status || "done" }));
        setAgentNote((prev) => {
          const next = { ...prev };
          delete next[p.agent];
          return next;
        });
        // 收尾：清空该 agent 的缓冲，活动卡定格为该 agent 的“结论”
        delete bufRef.current[p.agent];
        delete rawRef.current[p.agent];
        const label = NODE_LABEL[p.node] || p.node || "";
        const conclusion = p.conclusion || (label ? `已完成 · ${label}` : "已完成");
        // 记入“详细”面板的 agent 执行记录
        setAgentLog((prev) => ({
          ...prev,
          [p.agent]: [...(prev[p.agent] || []), conclusion],
        }));
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].streaming && next[i].agent === p.agent) {
              next[i] = { ...next[i], streaming: false, content: conclusion };
              break;
            }
          }
          return next;
        });
        break;
      }

      case "file_write":
        setFiles((prev) => {
          const others = prev.filter((f) => f.path !== p.path);
          return [...others, { path: p.path, content: p.content, change: p.change }];
        });
        break;

      // artifact 的摘要已由各 agent 的“结论”覆盖，此处不再重复输出
      case "artifact":
        break;

      case "overview":
        setOverview((o: any) => ({ ...o, summary: p.summary, plan: p.plan }));
        break;

      case "parallel_start":
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `⚡ 并行：${(p.agents || []).join("、")}` },
        ]);
        break;

      case "verify":
        if (p.level === "review") {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: p.ok ? "✅ 验收通过" : `⚠️ 验收发现问题：${(p.errors || []).join("；")}`,
            },
          ]);
        } else if (!p.ok) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `⚠️ 校验：${(p.errors || []).join("；")}` },
          ]);
        }
        break;

      case "snapshot":
        setSnapKey((k) => k + 1);
        setMessages((prev) => [...prev, { role: "system", content: `📸 已创建快照 ${p.rev}` }]);
        break;

      case "phase":
        if (p.note) setMessages((prev) => [...prev, { role: "system", content: `↻ ${p.note}` }]);
        break;

      case "clarify":
        setConfirm({ kind: "clarify", summary: p.summary, questions: p.questions || [] });
        setRunning(false);
        setStage("waiting_input");
        break;

      case "confirm":
        setConfirm({ kind: "confirm", summary: p.summary, options: p.options || [], purpose: p.purpose });
        setRunning(false);
        setStage("waiting_input");
        break;

      case "preview_ready":
        setPreviewReady(true);
        setPreviewNonce((n) => n + 1);
        break;

      case "done":
        setStage("done");
        setRunning(false);
        setPreviewReady(true);
        setPreviewNonce((n) => n + 1);
        setCompleted(true);
        setHistoryKey((k) => k + 1);
        break;

      case "error":
        setMessages((prev) => [...prev, { role: "system", content: `⚠️ ${p.message}` }]);
        setStage("error");
        setRunning(false);
        break;
    }
  }

  async function start() {
    if (!idea.trim() || running) return;
    setStarted(true);
    setRunning(true);
    setMessages([{ role: "user", content: idea.trim() }]);
    setRosterMode(mode);
    setAgentStatus(seedRoster(mode));
    setAgentNote({});
    setAgentLog({});
    setFiles([]);
    setPreviewReady(false);
    setStage("running");
    setConfirm(null);
    setOverview({});
    setCompleted(false);
    stickRef.current = true;
    bufRef.current = {};
    rawRef.current = {};

    try {
      const { id } = await createSession(mode, idea.trim());
      setSessionId(id);
      await runSession(id, handleEvent);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "system", content: `⚠️ ${err.message}` }]);
      setRunning(false);
    }
  }

  async function handleAnswer(answer: any) {
    if (!sessionId) return;
    setConfirm(null);
    setMessages((prev) => [...prev, { role: "user", content: answer.text || answer.choice || "已确认" }]);
    try {
      const res = await submitAnswer(sessionId, answer);
      if (res.resume) {
        setRunning(true);
        setStage("running");
        stickRef.current = true;
        await runSession(sessionId, handleEvent);
      } else {
        setStage("done");
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "system", content: `⚠️ ${err.message}` }]);
    }
  }

  async function handleIterate() {
    if (!idea.trim() || running || !sessionId) return;
    const instruction = idea.trim();
    setIdea("");
    setRunning(true);
    setStage("running");
    stickRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: instruction }]);
    try {
      await iterateSession(sessionId, instruction, handleEvent);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "system", content: `⚠️ ${err.message}` }]);
      setRunning(false);
    }
  }

  function resetToNew() {
    setStarted(false);
    setHomeTab("home");
    setSessionId(undefined);
    setMessages([]);
    setAgentStatus({});
    setAgentNote({});
    setAgentLog({});
    setFiles([]);
    setPreviewReady(false);
    setStage(undefined);
    setConfirm(null);
    setOverview({});
    setCompleted(false);
    setIdea("");
  }

  async function openSession(id: string) {
    if (running) return;
    try {
      const data = await loadSession(id);
      setStarted(true);
      setSessionId(id);
      setMessages(
        (data.messages || []).map((m: any) => ({
          role: m.role,
          agent: m.agent,
          content: m.content,
        }))
      );
      setFiles(
        (data.files || []).map((f: any) =>
          typeof f === "string" ? { path: f, content: "" } : { path: f.path, content: f.content ?? "" }
        )
      );
      // 恢复该模式的完整角色名单 + 各 agent 最终状态
      const openedMode = data.meta?.mode || "sketch";
      setRosterMode(openedMode);
      const status = seedRoster(openedMode);
      (data.pipeline || []).forEach((n: any) => {
        if (n.status && n.status !== "pending") status[n.agent] = n.status;
      });
      setAgentStatus(status);
      setAgentNote({});
      setAgentLog({});
      setOverview({ mode: data.meta?.mode });
      setStage(data.meta?.stage);
      const hasFiles = (data.files || []).length > 0;
      setPreviewReady(hasFiles);
      setPreviewNonce((n) => n + 1);
      setCompleted(data.meta?.stage === "done" && hasFiles);
      setConfirm(null);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "system", content: `⚠️ ${err.message}` }]);
    }
  }

  // 回滚成功后：重新加载文件与预览
  async function handleRolledBack() {
    if (!sessionId) return;
    try {
      const data = await loadSession(sessionId);
      setFiles(
        (data.files || []).map((f: any) =>
          typeof f === "string" ? { path: f, content: "" } : { path: f.path, content: f.content ?? "" }
        )
      );
      setPreviewReady((data.files || []).length > 0);
      setPreviewNonce((n) => n + 1);
      setMessages((prev) => [...prev, { role: "system", content: "↩️ 已回滚到所选快照" }]);
    } catch {
      /* 忽略 */
    }
  }

  // -------- 首页 / 资源页 --------
  if (!started) {
    return (
      <div className="flex h-screen overflow-hidden">
        <HistorySidebar
          currentId={sessionId}
          refreshKey={historyKey}
          onOpen={openSession}
          onNew={resetToNew}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 顶部导航 */}
          <header className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-3">
            <div className="flex items-center gap-2 text-ink">
              <Logo size={20} />
              <span className="text-sm font-semibold tracking-tight">Relay</span>
            </div>
            <nav className="ml-2 flex gap-1">
              {([
                ["home", "首页"],
                ["gallery", "资源"],
                ["skills", "Skill 市场"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setHomeTab(id)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    homeTab === id ? "bg-soft text-ink ring-1 ring-line" : "text-sub hover:bg-soft hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {modelConfigured === false && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs text-warn transition hover:bg-warn/15"
                  title="模型未配置，点击配置"
                >
                  <span className="dot dot-warn" />
                  未配置模型
                </button>
              )}
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-md border border-line p-1.5 text-sub transition hover:text-ink"
                title="模型配置"
              >
                <GearIcon />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto">
            {homeTab === "gallery" ? (
              <Gallery onOpen={openSession} />
            ) : homeTab === "skills" ? (
              <SkillMarket />
            ) : (
              <Landing
                modes={modes}
                mode={mode}
                setMode={setMode}
                idea={idea}
                setIdea={setIdea}
                onStart={start}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------- 工作台 --------
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <button onClick={resetToNew} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
          <Logo size={22} />
          Relay
        </button>
        <div className="ml-auto flex items-center gap-3">
          {completed && sessionId && (
            <Snapshots
              sessionId={sessionId}
              refreshKey={snapKey}
              onRolledBack={handleRolledBack}
            />
          )}
          {completed && sessionId && (
            <a
              href={exportUrl(sessionId)}
              className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-soft"
              title="下载项目 zip"
            >
              ⬇ 导出
            </a>
          )}
          {stage && <span className="text-xs text-sub">状态：{stage}</span>}
          {modelConfigured === false && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs text-warn transition hover:bg-warn/15"
              title="模型未配置，点击配置"
            >
              <span className="dot dot-warn" />
              未配置
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-line p-1.5 text-sub transition hover:text-ink"
            title="模型配置"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* 智能体接力时间线（顶部进度可视化） */}
      <AgentTimeline
        roster={roster}
        statuses={agentStatus}
        note={agentNote}
      />

      {/* 布局：历史 | 对话 | 中央预览（agent 详情在中央"详细"tab） */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <HistorySidebar
          currentId={sessionId}
          refreshKey={historyKey}
          onOpen={openSession}
          onNew={resetToNew}
        />
        <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] overflow-hidden">
          {/* 左：对话 */}
          <div className="flex min-h-0 flex-col border-r border-line bg-panel">
            <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
              <Chat messages={messages} />
            </div>

            {/* 输入区 */}
            <div className="shrink-0 border-t border-line p-3">
              {completed && (
                <div className="mb-2 text-xs text-sub">
                  💬 迭代模式：描述要修改的地方（小改走补丁，快而省）
                </div>
              )}
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    completed ? handleIterate() : start();
                  }
                }}
                disabled={running}
                placeholder={
                  completed
                    ? "例如：把主按钮改成蓝色 / 加一个清空按钮…"
                    : "描述你想要的应用…"
                }
                className="h-20 w-full resize-none rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={completed ? handleIterate : start}
                  disabled={running || !idea.trim()}
                  className="btn-accent flex-1 rounded-lg py-2 text-sm disabled:opacity-30"
                >
                  {running ? "处理中…" : completed ? "应用修改" : "开始生成"}
                </button>
                {completed && (
                  <button
                    onClick={resetToNew}
                    disabled={running}
                    className="rounded-lg border border-line px-3 py-2 text-sm text-sub hover:text-ink disabled:opacity-40"
                    title="开始一个新项目"
                  >
                    新建
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 中：预览/文件/概览 */}
          <div className="min-h-0 overflow-hidden">
            <CenterPanel
              sessionId={sessionId}
              previewReady={previewReady}
              previewNonce={previewNonce}
              files={files}
              overview={{
                idea: messages.find((m) => m.role === "user")?.content,
                mode: modeName || overview.mode,
                files: files.length,
                stage,
                summary: overview.summary,
                plan: overview.plan,
              }}
              roster={roster}
              agentStatus={agentStatus}
              agentLog={agentLog}
            />
          </div>
        </div>
      </div>

      {/* 弹窗：确认/澄清 */}
      <Modal
        open={!!confirm}
        title={confirm?.kind === "clarify" ? "需要你确认几个细节" : "请确认"}
      >
        {confirm && <ConfirmCard data={confirm} onSubmit={handleAnswer} />}
      </Modal>

      {/* 弹窗：模型配置 */}
      <SettingsModal open={settingsOpen} onClose={onSettingsClose} />
    </div>
  );
}
