"use client";

import { useState } from "react";
import { API_BASE, AgentStatus, AgentDetail } from "@/lib/api";

export interface FileItem {
  path: string;
  content: string;
  change?: string;
}

export interface Overview {
  idea?: string;
  mode?: string;
  files: number;
  stage?: string;
  summary?: string;
  plan?: string;
}

type Tab = "preview" | "files" | "detail";

const STATUS_META: Record<AgentStatus, { label: string; cls: string }> = {
  pending: { label: "等待中", cls: "text-sub" },
  running: { label: "工作中…", cls: "text-accent" },
  done: { label: "已完成", cls: "text-accent" },
  done_with_warnings: { label: "完成(有警告)", cls: "text-warn" },
  skipped: { label: "未参与", cls: "text-faint" },
  failed: { label: "失败", cls: "text-danger" },
};

export default function CenterPanel({
  sessionId,
  previewReady,
  previewNonce,
  files,
  overview,
  roster,
  agentStatus,
  agentLog,
}: {
  sessionId?: string;
  previewReady: boolean;
  previewNonce: number;
  files: FileItem[];
  overview: Overview;
  roster: AgentDetail[];
  agentStatus: Record<string, AgentStatus>;
  agentLog: Record<string, string[]>;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "preview", label: "预览" },
    { id: "files", label: `文件${files.length ? ` (${files.length})` : ""}` },
    { id: "detail", label: "详细" },
  ];

  const current = files.find((f) => f.path === activeFile) || files[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              tab === t.id ? "bg-soft text-ink ring-1 ring-line" : "text-sub hover:bg-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" && (
          <div className="h-full bg-panel">
            {previewReady && sessionId ? (
              <iframe
                key={previewNonce}
                title="preview"
                src={`${API_BASE}/api/preview/${sessionId}/index.html?t=${previewNonce}`}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-sub">
                生成完成后这里会显示实时预览
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="flex h-full">
            <div className="w-52 shrink-0 overflow-auto border-r border-line p-2">
              {files.length === 0 && <div className="p-3 text-sm text-sub">暂无文件</div>}
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActiveFile(f.path)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    (activeFile || files[0]?.path) === f.path
                      ? "bg-soft text-ink"
                      : "text-sub hover:bg-soft"
                  }`}
                >
                  <span className="truncate">{f.path}</span>
                  {f.change === "new" && (
                    <span className="ml-auto rounded bg-accent/15 px-1 text-xs text-accent">新</span>
                  )}
                  {f.change === "modified" && (
                    <span className="ml-auto rounded bg-warn/15 px-1 text-xs text-warn">改</span>
                  )}
                </button>
              ))}
            </div>
            <pre className="flex-1 overflow-auto bg-soft p-4 text-xs leading-relaxed text-ink">
              {current?.content || "选择一个文件查看内容"}
            </pre>
          </div>
        )}

        {tab === "detail" && (
          <div className="h-full overflow-auto p-6">
            {/* 项目信息 */}
            <div className="space-y-3 text-sm">
              <Field label="需求" value={overview.idea || "—"} />
              <Field label="模式" value={overview.mode || "—"} />
              {overview.summary && <Field label="需求理解" value={overview.summary} />}
              {overview.plan && <Field label="执行计划" value={overview.plan} />}
              <div className="flex gap-8">
                <Field label="文件数" value={String(overview.files)} inline />
                <Field label="状态" value={overview.stage || "—"} inline />
              </div>
            </div>

            {/* 各 Agent 执行情况 */}
            {roster.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-sub">
                  Agent 执行情况
                </div>
                <div className="space-y-2.5">
                  {roster.map((a) => {
                    const status = agentStatus[a.id] || "pending";
                    const logs = agentLog[a.id] || [];
                    const sm = STATUS_META[status];
                    return (
                      <div key={a.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{a.icon}</span>
                          <span className="text-sm font-semibold text-ink">{a.name}</span>
                          <span className="text-xs text-sub">· {a.role}</span>
                          <span className={`ml-auto text-xs ${sm.cls}`}>{sm.label}</span>
                        </div>
                        {/* 该 agent 的结论/总结（可能多条：如多轮修复复审） */}
                        {logs.length > 0 ? (
                          <ul className="mt-2 space-y-1 border-t border-line/60 pt-2">
                            {logs.map((c, i) => (
                              <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink">
                                <span className="text-sub">·</span>
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-2 border-t border-line/60 pt-2 text-xs text-sub">
                            {a.desc}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, inline }: { label: string; value: string; inline?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-sub">{label}</div>
      <div className={`mt-1 text-ink ${inline ? "" : "whitespace-pre-wrap"}`}>{value}</div>
    </div>
  );
}
