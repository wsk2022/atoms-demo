"use client";

import { useEffect, useRef, useState } from "react";
import { listSkills, uploadSkill, toggleSkill, deleteSkill, Skill } from "@/lib/api";

const AGENT_LABEL: Record<string, string> = {
  director: "总监",
  strategist: "策略师",
  scout: "侦察员",
  architect: "建筑师",
  maker: "制作师",
  auditor: "审计师",
};

const SAMPLE = `---
id: my-skill
name: 我的技能
description: 一句话说明这个技能做什么
agent: maker          # director/strategist/scout/architect/maker/auditor
keywords: [关键词1, 关键词2]   # 命中用户需求时才生效；留空则无条件生效
---

# 我的技能

在这里用 Markdown 写要注入给该 agent 的规范/指引，可以多行、可用列表和标题。

- 要点一
- 要点二`;

export default function SkillMarket() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [text, setText] = useState(SAMPLE);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    listSkills().then(setSkills).catch(() => {});
  }
  useEffect(reload, []);

  async function doUpload() {
    setUploading(true);
    setErr("");
    try {
      await uploadSkill(text);
      setShowUpload(false);
      setText(SAMPLE);
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      setShowUpload(true);
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  async function onToggle(s: Skill) {
    await toggleSkill(s.id, !s.enabled).catch(() => {});
    reload();
  }

  async function onDelete(s: Skill) {
    await deleteSkill(s.id).catch(() => {});
    reload();
  }

  const builtin = skills.filter((s) => s.builtin);
  const user = skills.filter((s) => !s.builtin);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Skill 市场</h2>
          <p className="mt-1 text-sm text-sub">
            启用的技能会动态注入对应 Agent 的 prompt，影响生成行为
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-soft"
          >
            上传 Markdown 文件
          </button>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="btn-accent rounded-lg px-3 py-1.5 text-sm"
          >
            + 粘贴创建
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="mb-6 rounded-xl border border-line p-4">
          <div className="mb-2 text-sm font-medium text-ink">粘贴 / 编辑 Skill Markdown</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="h-56 w-full resize-none rounded-lg border border-line bg-soft p-3 font-mono text-xs text-ink outline-none focus:border-accent"
          />
          {err && <div className="mt-2 text-sm text-danger">⚠️ {err}</div>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={doUpload}
              disabled={uploading}
              className="btn-accent rounded-lg px-4 py-1.5 text-sm disabled:opacity-40"
            >
              {uploading ? "安装中…" : "安装"}
            </button>
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-line px-4 py-1.5 text-sm text-sub hover:text-ink"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <Section title={`内置技能 (${builtin.length})`}>
        {builtin.map((s) => (
          <SkillCard key={s.id} s={s} onToggle={onToggle} />
        ))}
      </Section>

      <Section title={`我的技能 (${user.length})`}>
        {user.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-sub">
            还没有上传技能。点右上角上传 YAML 或粘贴创建。
          </div>
        )}
        {user.map((s) => (
          <SkillCard key={s.id} s={s} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-sub">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function SkillCard({
  s,
  onToggle,
  onDelete,
}: {
  s: Skill;
  onToggle: (s: Skill) => void;
  onDelete?: (s: Skill) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{s.name}</span>
            <span className="rounded bg-soft px-1.5 py-0.5 text-xs text-sub">
              {AGENT_LABEL[s.agent] || s.agent}
            </span>
            {!s.builtin && (
              <span className="rounded bg-soft px-1.5 py-0.5 text-xs text-sub">自定义</span>
            )}
          </div>
          <div className="mt-1 text-sm text-sub">{s.description}</div>
          {s.keywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.keywords.map((k) => (
                <span key={k} className="rounded bg-soft px-1.5 py-0.5 text-xs text-sub">
                  {k}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs text-sub underline-offset-2 hover:text-ink hover:underline"
          >
            {open ? "收起指令" : "查看指令"}
          </button>
          {open && (
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-soft p-3 text-xs leading-relaxed text-ink">
              {s.instructions}
            </pre>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* 开关 */}
          <button
            onClick={() => onToggle(s)}
            className={`relative h-6 w-11 rounded-full transition ${
              s.enabled ? "bg-accent" : "bg-faint"
            }`}
            title={s.enabled ? "已启用" : "已停用"}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition ${
                s.enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(s)}
              className="text-xs text-sub hover:text-danger"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
