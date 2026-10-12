"use client";

import { useEffect, useState } from "react";
import { listSessions, SessionSummary, previewUrl } from "@/lib/api";

const MODE_LABEL: Record<string, string> = {
  dev: "开发模式",
  team: "团队模式",
  research: "深度研究模式",
};

export default function Gallery({ onOpen }: { onOpen: (id: string) => void }) {
  const [apps, setApps] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSessions()
      .then((all) => setApps(all.filter((s) => s.has_app)))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">资源</h2>
        <p className="mt-1 text-sm text-sub">所有已生成的应用（{apps.length}）</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-sub">加载中…</div>
      ) : apps.length === 0 ? (
        <div className="py-20 text-center text-sm text-sub">
          还没有生成任何应用，去首页创建一个吧
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="group overflow-hidden rounded-xl border border-line bg-panel text-left transition hover:border-accent/30 hover:shadow-panel"
            >
              {/* 预览缩略图：缩放的 iframe，禁交互 */}
              <div className="relative h-44 overflow-hidden border-b border-line bg-soft">
                <iframe
                  title={s.id}
                  src={previewUrl(s.id)}
                  className="pointer-events-none absolute left-0 top-0 origin-top-left"
                  style={{
                    width: "200%",
                    height: "200%",
                    transform: "scale(0.5)",
                  }}
                  scrolling="no"
                />
                {/* 遮罩层，防止 iframe 抢点击 */}
                <div className="absolute inset-0" />
              </div>
              <div className="p-3.5">
                <div className="truncate text-sm font-medium text-ink">{s.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-sub">
                  <span>{MODE_LABEL[s.mode] || s.mode}</span>
                  <span>·</span>
                  <span>{s.stage === "done" ? "已完成" : s.stage}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
