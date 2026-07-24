"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { fetchModelConfig, updateModelConfig, ModelConfig } from "@/lib/api";

const PRESETS = [
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "Anthropic", base_url: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest" },
  { name: "通义千问", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { name: "Moonshot", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
];

export default function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ModelConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setSaved(false);
    fetchModelConfig()
      .then(setCfg)
      .catch((e) => setErr(e.message));
  }, [open]);

  if (!cfg) {
    return (
      <Modal open={open} title="模型配置" onClose={onClose}>
        <div className="py-8 text-center text-sm text-sub">加载中…</div>
      </Modal>
    );
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setErr("");
    try {
      await updateModelConfig({
        api_key: cfg.api_key,
        base_url: cfg.base_url,
        model: cfg.model,
      });
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const masked = cfg.is_configured && cfg.api_key
    ? "•".repeat(Math.min(cfg.api_key.length, 32))
    : "";

  return (
    <Modal open={open} title="模型配置" onClose={onClose}>
      <div className="space-y-4">
        {/* 配置状态 */}
        <div className="flex items-center gap-2 rounded-lg border border-line bg-soft px-3 py-2 text-xs">
          <span className={`dot ${cfg.is_configured ? "dot-done" : "dot-fail"}`} />
          <span className={cfg.is_configured ? "text-accent" : "text-danger"}>
            {cfg.is_configured ? "已配置，可正常生成" : "未配置，将走降级模式"}
          </span>
        </div>

        {/* 预设 */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-sub">
            快速预设
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() =>
                  setCfg({
                    ...cfg,
                    base_url: p.base_url,
                    model: p.model,
                  })
                }
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  cfg.base_url === p.base_url
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-line text-sub hover:text-ink"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sub">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={showKey ? cfg.api_key : (masked || cfg.api_key)}
              onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })}
              onFocus={() => setShowKey(true)}
              placeholder="sk-..."
              className="h-10 w-full rounded-lg border border-line bg-panel2 px-3 pr-10 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-sub hover:text-ink"
              tabIndex={-1}
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sub">
            Base URL
          </label>
          <input
            type="text"
            value={cfg.base_url}
            onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
            className="h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {/* Model */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sub">
            模型名称
          </label>
          <input
            type="text"
            value={cfg.model}
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            placeholder="deepseek-chat"
            className="h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {err && <div className="text-sm text-danger">⚠️ {err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost rounded-lg px-4 py-2 text-sm">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-accent rounded-lg px-4 py-2 text-sm disabled:opacity-40"
          >
            {saving ? "保存中…" : saved ? "已保存 ✓" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
