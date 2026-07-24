"use client";

import { AgentStatus } from "@/lib/api";

export interface AgentDetail {
  id: string;
  name: string;
  role: string;
  icon: string;
}

const STATUS_DOT: Record<AgentStatus, string> = {
  pending: "bg-faint",
  running: "bg-accent shadow-glow animate-pulseDot",
  done: "bg-accent",
  done_with_warnings: "bg-warn",
  skipped: "bg-faint",
  failed: "bg-danger",
};

/**
 * 横向智能体时间线：工作台顶部进度条。
 * 节点间用连线串联，当前 running 节点发光、连线流光，done 节点连线实色。
 */
export default function AgentTimeline({
  roster,
  statuses,
  note,
}: {
  roster: AgentDetail[];
  statuses: Record<string, AgentStatus>;
  note?: Record<string, string>;
}) {
  if (roster.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-0 border-b border-line bg-panel/60 px-5 py-3 backdrop-blur">
      <div className="mr-4 shrink-0 text-[10px] font-medium uppercase tracking-wider text-faint">
        接力
      </div>
      <div className="flex min-w-0 flex-1 items-center">
        {roster.map((a, i) => {
          const status = statuses[a.id] || "pending";
          const isLast = i === roster.length - 1;
          const active = status === "running";
          const passed =
            status === "done" ||
            status === "done_with_warnings" ||
            status === "running";
          const currentNote = note?.[a.id];
          return (
            <div key={a.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              {/* 节点 */}
              <div className="group relative flex shrink-0 flex-col items-center">
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-base transition ${
                    active
                      ? "border-accent/50 bg-panel2 shadow-glow"
                      : status === "done" || status === "done_with_warnings"
                      ? "border-accent/30 bg-panel2"
                      : status === "failed"
                      ? "border-danger/40 bg-panel2"
                      : "border-line bg-panel2 opacity-60"
                  }`}
                >
                  <span className="relative">{a.icon}</span>
                  {active && (
                    <span className="absolute inset-0 rounded-full bg-accent/10 animate-pulseDot" />
                  )}
                </div>
                {/* 名字 + 状态 */}
                <div className="mt-1.5 flex flex-col items-center">
                  <span
                    className={`max-w-[64px] truncate text-[11px] ${
                      active ? "text-ink" : status === "pending" ? "text-faint" : "text-sub"
                    }`}
                  >
                    {a.name}
                  </span>
                  <span
                    className={`mt-0.5 h-1 w-1 rounded-full ${STATUS_DOT[status]}`}
                    title={currentNote || status}
                  />
                </div>
              </div>

              {/* 连线 */}
              {!isLast && (
                <div className="relative mx-1 h-px flex-1 overflow-hidden">
                  <div
                    className={`absolute inset-0 ${
                      passed ? "bg-accent/40" : "bg-line"
                    }`}
                  />
                  {active && (
                    <div
                      className="absolute left-0 top-0 h-full w-1/3 animate-[flowH_1.8s_ease-in-out_infinite]"
                      style={{
                        background:
                          "linear-gradient(to right, transparent, #34d399, transparent)",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes flowH {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
