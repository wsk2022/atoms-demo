"use client";

import { useEffect, useState } from "react";
import { listSessions, SessionSummary } from "@/lib/api";

const MODE_ICON: Record<string, string> = {
  dev: "⚙️",
  team: "👥",
  research: "🔬",
};

export default function HistorySidebar({
  currentId,
  refreshKey,
  onOpen,
  onNew,
}: {
  currentId?: string;
  refreshKey: number;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, [refreshKey]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-full w-10 items-center justify-center border-r border-line bg-panel text-sub hover:text-ink"
        title="展开历史"
      >
        ☰
      </button>
    );
  }

  return (
    <div className="flex h-full w-56 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-sub">历史项目</span>
        <button onClick={() => setOpen(false)} className="text-sub hover:text-ink" title="收起">
          «
        </button>
      </div>
      <button
        onClick={onNew}
        className="mx-3 mt-3 rounded-lg border border-dashed border-line py-2 text-sm text-sub hover:border-accent/50 hover:text-ink"
      >
        ＋ 新建项目
      </button>
      <div className="mt-2 flex-1 overflow-auto p-2">
        {sessions.length === 0 && (
          <div className="mt-6 text-center text-xs text-sub">暂无历史</div>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={`mb-1 flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition ${
              s.id === currentId ? "bg-soft" : "hover:bg-soft"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{MODE_ICON[s.mode] || "•"}</span>
              <span className="truncate text-sm text-ink">{s.title}</span>
            </div>
            <span className="text-[11px] text-sub">
              {s.stage === "done" ? "已完成" : s.stage}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
