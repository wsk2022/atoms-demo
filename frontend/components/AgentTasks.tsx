"use client";

import { AgentStatus } from "@/lib/api";

export interface AgentDetail {
  id: string;
  name: string;
  role: string;
  icon: string;
  desc?: string;
}

const STATUS_META: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  pending: { label: "等待中", cls: "text-sub", dot: "bg-faint" },
  running: { label: "工作中…", cls: "text-accent", dot: "bg-accent animate-pulseDot" },
  done: { label: "已完成", cls: "text-accent", dot: "bg-accent" },
  done_with_warnings: { label: "完成(有警告)", cls: "text-warn", dot: "bg-warn" },
  skipped: { label: "未参与", cls: "text-faint", dot: "bg-faint" },
  failed: { label: "失败", cls: "text-danger", dot: "bg-danger" },
};

export default function AgentTasks({
  mode,
  roster,
  statuses,
  activeNote,
}: {
  mode?: string;
  roster: AgentDetail[];            // 当前模式的全部角色（固定展示）
  statuses: Record<string, AgentStatus>; // agentId → 状态
  activeNote?: Record<string, string>;   // agentId → 当前任务描述（如“修复(第1轮)”）
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-sub">
          AI 团队
        </div>
        {mode && <div className="mt-1 text-sm text-ink">{mode}</div>}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {roster.length === 0 && (
          <div className="mt-8 text-center text-sm text-sub">选择模式后显示团队</div>
        )}
        <div className="space-y-2">
          {roster.map((a) => {
            const status = statuses[a.id] || "pending";
            const meta = STATUS_META[status];
            const note = activeNote?.[a.id];
            const active = status === "running";
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-3 transition ${
                  active
                    ? "border-accent/40 bg-accent/5 shadow-glow"
                    : status === "done"
                    ? "border-line bg-soft"
                    : "border-line bg-panel"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-xl leading-none">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">{a.name}</span>
                      <span className="text-xs text-sub">· {a.role}</span>
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-sub">
                      {a.desc}
                    </div>
                  </div>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                </div>
                {/* 状态行 */}
                <div className="mt-2 flex items-center gap-1.5 border-t border-line/60 pt-2">
                  <span className={`text-xs font-medium ${meta.cls}`}>
                    {active && note ? note : meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
