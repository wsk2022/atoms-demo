"use client";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  agent?: string;
  content: string;
  streaming?: boolean;
  kind?: "activity" | "artifact" | "result"; // 关键信息类型
}

const AGENT_LABEL: Record<string, string> = {
  director: "总监",
  strategist: "策略师",
  scout: "侦察员",
  architect: "建筑师",
  maker: "制作师",
  auditor: "审计师",
};

export default function Chat({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {messages.map((m, i) => {
        // 用户消息：右侧气泡
        if (m.role === "user") {
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-grad-accent px-4 py-2.5 text-sm font-medium text-[#052e1a]">
                {m.content}
              </div>
            </div>
          );
        }
        // 系统/活动信息：紧凑行
        if (m.role === "system") {
          return (
            <div key={i} className="flex items-center gap-2 px-1 py-0.5 text-xs text-sub">
              <span>{m.content}</span>
            </div>
          );
        }
        // assistant：关键信息卡（不逐字输出代码）
        return (
          <div key={i} className="fade-in rounded-xl border border-line bg-soft px-3.5 py-2.5">
            {m.agent && (
              <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-accent">
                {AGENT_LABEL[m.agent] || m.agent}
                {m.streaming && (
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
            )}
            <div className="text-sm leading-relaxed text-ink">{m.content}</div>
          </div>
        );
      })}
    </div>
  );
}
