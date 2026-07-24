"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSnapshots, rollbackSnapshot } from "@/lib/api";

export default function Snapshots({
  sessionId,
  refreshKey,
  onRolledBack,
}: {
  sessionId: string;
  refreshKey: number;        // 变化时重新拉取快照列表
  onRolledBack: () => void;  // 回滚成功后回调（刷新预览/文件）
}) {
  const [open, setOpen] = useState(false);
  const [snaps, setSnaps] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSnapshots(sessionId).then(setSnaps).catch(() => setSnaps([]));
  }, [sessionId, refreshKey]);

  // 点击外部关闭
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function doRollback(rev: string) {
    setBusy(rev);
    try {
      await rollbackSnapshot(sessionId, rev);
      onRolledBack();
      setOpen(false);
    } catch {
      /* 忽略 */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-soft"
        title="查看并回滚到历史快照"
      >
        📸 快照{snaps.length ? ` (${snaps.length})` : ""}
      </button>

      {open && (
        <div className="fade-in absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-panel2 p-2 shadow-panel">
          <div className="px-2 py-1 text-xs text-sub">
            每次迭代前自动创建快照，可回滚到任一版本
          </div>
          {snaps.length === 0 && (
            <div className="px-2 py-3 text-center text-sm text-sub">暂无快照</div>
          )}
          {/* 最新在上 */}
          {[...snaps].reverse().map((rev, i) => (
            <div
              key={rev}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-soft"
            >
              <span className="text-sm text-ink">
                {rev}
                {i === 0 && <span className="ml-1.5 text-xs text-sub">最新</span>}
              </span>
              <button
                onClick={() => doRollback(rev)}
                disabled={!!busy}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-soft hover:text-ink disabled:opacity-40"
              >
                {busy === rev ? "回滚中…" : "回滚"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
