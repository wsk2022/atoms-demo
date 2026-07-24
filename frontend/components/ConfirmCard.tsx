"use client";

import { useState } from "react";

export interface Question {
  id: string;
  question: string;
  type?: string;
  options?: { id: string; label: string; description?: string }[];
  allow_custom?: boolean;
}

export interface ConfirmData {
  kind: "clarify" | "confirm";
  summary?: string;
  questions?: Question[];
  options?: { id: string; label: string }[];
  purpose?: string;
}

export default function ConfirmCard({
  data,
  onSubmit,
}: {
  data: ConfirmData;
  onSubmit: (answer: any) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState("");
  const [done, setDone] = useState(false);

  function submit(answer: any) {
    if (done) return;
    setDone(true);
    onSubmit(answer);
  }

  // gate 确认
  if (data.kind === "confirm") {
    return (
      <div>
        <div className="mb-4 text-sm text-ink">{data.summary || "请确认"}</div>
        <div className="flex flex-wrap gap-2">
          {(data.options || []).map((o, i) => (
            <button
              key={o.id}
              disabled={done}
              onClick={() => submit({ choice: o.id })}
              className={`rounded-lg px-4 py-2 text-sm transition disabled:opacity-40 ${
                i === 0
                  ? "btn-accent"
                  : "btn-ghost"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // clarify 澄清
  const qs = data.questions || [];
  const allAnswered = qs.every((q) => choices[q.id]) || custom.trim().length > 0;

  return (
    <div>
      {data.summary && (
        <div className="mb-4 rounded-lg bg-soft px-3 py-2 text-sm text-sub">
          我的理解：{data.summary}
        </div>
      )}
      <div className="space-y-4">
        {qs.map((q) => (
          <div key={q.id}>
            <div className="mb-2 text-sm font-medium text-ink">{q.question}</div>
            <div className="flex flex-wrap gap-2">
              {(q.options || []).map((o) => (
                <button
                  key={o.id}
                  disabled={done}
                  onClick={() => setChoices((c) => ({ ...c, [q.id]: o.label }))}
                  title={o.description}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    choices[q.id] === o.label
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-ink hover:border-accent/40"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        disabled={done}
        placeholder="或直接补充说明…"
        className="mt-4 h-16 w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <button
        disabled={done || !allAnswered}
        onClick={() =>
          submit({ ...choices, text: custom.trim() || Object.values(choices).join("；") })
        }
        className="btn-accent mt-3 w-full rounded-lg py-2.5 text-sm disabled:opacity-40"
      >
        {done ? "已提交" : "提交"}
      </button>
    </div>
  );
}
