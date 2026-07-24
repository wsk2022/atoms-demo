"use client";

import { Mode } from "@/lib/api";

export default function Landing({
  modes,
  mode,
  setMode,
  idea,
  setIdea,
  onStart,
}: {
  modes: Mode[];
  mode: string;
  setMode: (m: string) => void;
  idea: string;
  setIdea: (v: string) => void;
  onStart: () => void;
}) {
  const examples = [
    "一个番茄钟计时器",
    "个人记账应用，能记录收支并统计",
    "一个待办清单，支持标记完成",
  ];

  const team =
    modes.find((m) => m.id === mode)?.agent_details ||
    modes.find((m) => m.id === "workshop")?.agent_details ||
    [];

  return (
    <div className="relative min-h-full overflow-hidden">
      {/* 背景：网格 + 双光晕 */}
      <div className="pointer-events-none absolute inset-0 bg-grid-fade opacity-70" />
      <div className="pointer-events-none absolute left-[-10%] top-[-160px] h-[420px] w-[520px] rounded-full bg-accent/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[-160px] h-[420px] w-[520px] rounded-full bg-accent2/10 blur-[120px]" />
      {/* 细网格线 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 80%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 40%, black, transparent 80%)",
        }}
      />

      <div className="relative mx-auto grid min-h-full max-w-6xl grid-cols-1 gap-10 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        {/* 左：叙事 + 输入 */}
        <div className="fade-in-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1 text-xs text-sub backdrop-blur">
            <span className="dot dot-running" />
            6 个 AI 智能体 · 接力协作 · 实时可观测
          </div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight lg:text-6xl">
            <span className="text-grad">你的 AI 团队</span>
            <br />
            <span className="text-ink">把一句话变成可运行的应用</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-sub">
            不只是生成代码。统筹、解构、探索、设计、开发、审查——六个专职智能体接力交付，每一步你都能看见。
          </p>

          {/* 输入卡（玻璃拟态） */}
          <div className="glass mt-8 rounded-2xl p-5 shadow-panel fade-in-up" style={{ animationDelay: "60ms" }}>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onStart();
              }}
              placeholder="描述你想要的应用…（⌘/Ctrl + Enter 开始）"
              className="h-28 w-full resize-none bg-transparent text-base outline-none placeholder:text-faint"
              autoFocus
            />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <div className="flex flex-wrap gap-1.5">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    title={m.desc}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      mode === m.id
                        ? "bg-soft text-ink ring-1 ring-accent/30"
                        : "text-sub hover:text-ink"
                    }`}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
              <button
                onClick={onStart}
                disabled={!idea.trim()}
                className="btn-accent rounded-lg px-5 py-2 text-sm"
              >
                开始生成 →
              </button>
            </div>
          </div>

          {/* 示例 */}
          <div className="mt-5 flex flex-wrap gap-2 fade-in-up" style={{ animationDelay: "120ms" }}>
            <span className="self-center text-xs text-faint">试试：</span>
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => setIdea(ex)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-sub transition hover:border-accent/40 hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* 右：智能体接力时间线可视化 */}
        <div className="fade-in-up" style={{ animationDelay: "180ms" }}>
          <RelayTimeline team={team} />
        </div>
      </div>
    </div>
  );
}

/**
 * 智能体接力时间线：垂直排列节点，节点间用流光连线串联。
 * 静态展示团队构成，但通过呼吸光晕 + 流动渐变暗示"实时协作"。
 */
function RelayTimeline({ team }: { team: { id: string; name: string; role: string; icon: string; desc?: string }[] }) {
  if (team.length === 0) return null;
  return (
    <div className="glass relative rounded-2xl p-6 shadow-panel">
      {/* 顶部标签 */}
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-sub">
          接力流程
        </div>
        <div className="flex items-center gap-1.5 text-xs text-accent">
          <span className="dot dot-running" />
          实时协作
        </div>
      </div>

      {/* 时间线主体 */}
      <div className="relative">
        {team.map((a, i) => {
          const isLast = i === team.length - 1;
          return (
            <div key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
              {/* 节点 + 连线列 */}
              <div className="relative flex w-10 shrink-0 flex-col items-center">
                {/* 发光节点 */}
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-panel2 text-lg shadow-glow">
                  <span className="absolute inset-0 rounded-full bg-accent/10 animate-pulseDot" />
                  <span className="relative">{a.icon}</span>
                </div>
                {/* 流光连线 */}
                {!isLast && (
                  <div className="absolute top-10 h-[calc(100%-2.5rem)] w-px overflow-hidden">
                    <div className="h-full w-full bg-line" />
                    <div
                      className="absolute left-0 top-0 h-1/3 w-full animate-[flow_2.4s_ease-in-out_infinite]"
                      style={{
                        background:
                          "linear-gradient(to bottom, transparent, #34d399, transparent)",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* 文本 */}
              <div className="flex-1 pt-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{a.name}</span>
                  <span className="text-xs text-faint">· {a.role}</span>
                </div>
                {a.desc && (
                  <div className="mt-0.5 text-xs leading-relaxed text-sub">{a.desc}</div>
                )}
              </div>

              {/* 步骤序号 */}
              <div className="pt-2 text-[10px] font-mono text-faint">
                {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes flow {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(300%); }
        }
      `}</style>
    </div>
  );
}
