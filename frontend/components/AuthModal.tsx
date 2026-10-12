"use client";

import { useState } from "react";
import Modal from "./Modal";
import { register, login, setAuthToken, AuthUser } from "@/lib/api";

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export default function AuthModal({
  open,
  onSuccess,
}: {
  open: boolean;
  onSuccess: (user: AuthUser) => void;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setErr("");
    setBusy(false);
  }

  async function submit() {
    setErr("");
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setErr("邮箱格式不正确");
      return;
    }
    if (!password) {
      setErr("密码不能为空");
      return;
    }
    setBusy(true);
    try {
      const fn = tab === "register" ? register : login;
      const { token, user } = await fn(e, password);
      setAuthToken(token);
      onSuccess(user);
      setEmail("");
      setPassword("");
    } catch (e: any) {
      setErr(e.message || (tab === "register" ? "注册失败" : "登录失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={tab === "register" ? "注册" : "登录"}>
      <div className="space-y-4">
        {/* tab 切换 */}
        <div className="flex gap-1 rounded-lg border border-line bg-soft p-1 text-sm">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                reset();
              }}
              className={`flex-1 rounded-md py-1.5 transition ${
                tab === t ? "bg-panel2 text-ink shadow-sm" : "text-sub hover:text-ink"
              }`}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sub">
            邮箱
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="you@example.com"
            className="h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm outline-none focus:border-accent"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sub">
            密码
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="••••••••"
            className="h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {err && <div className="text-sm text-danger">⚠️ {err}</div>}

        <div className="text-xs text-sub">
          {tab === "register"
            ? "仅校验邮箱格式，密码非空即可。"
            : "用注册时的邮箱和密码登录。"}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="btn-accent w-full rounded-lg py-2 text-sm disabled:opacity-40"
        >
          {busy ? "处理中…" : tab === "register" ? "注册并登录" : "登录"}
        </button>
      </div>
    </Modal>
  );
}
