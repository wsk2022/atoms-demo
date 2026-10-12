// 后端 API + SSE 事件类型
// 子路径部署（BASE_PATH=/atoms_demo）时，API 与预览走同源的 /atoms_demo/api，
// 由 nginx 反代到后端。独立域名部署可用 NEXT_PUBLIC_API_BASE 指定绝对地址。

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BASE_PATH ||
  "http://localhost:8000";

// ---------------------------------------------------------------- 登录态 token

const TOKEN_KEY = "relay_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

/** 统一请求：自动注入 Authorization 头。供所有需要鉴权的接口复用。 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

// ---------------------------------------------------------------- 认证接口

export interface AuthUser {
  id: number;
  email: string;
}

export async function register(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const r = await apiFetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || "注册失败");
  return j;
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const r = await apiFetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || "登录失败");
  return j;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const r = await apiFetch(`${API_BASE}/api/auth/me`);
  if (r.status === 401) return null;
  if (!r.ok) throw new Error("读取用户失败");
  return r.json();
}

export async function logout(): Promise<void> {
  try {
    await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
  } catch {
    /* 忽略网络错误，本地 token 仍要清掉 */
  }
  clearAuthToken();
}


export interface AgentDetail {
  id: string;
  name: string;
  role: string;
  icon: string;
  desc?: string;
}

export interface Mode {
  id: string;
  name: string;
  icon: string;
  agents: string[];
  desc: string;
  agent_details?: AgentDetail[];
}

export interface PipelineNode {
  agent: string;
  node: string;
}

export type AgentStatus = "pending" | "running" | "done" | "done_with_warnings" | "skipped" | "failed";

export interface LoomEvent {
  v: number;
  seq: number;
  session: string;
  type: string;
  payload: any;
}

export async function fetchModes(): Promise<Mode[]> {
  const r = await apiFetch(`${API_BASE}/api/modes`);
  const j = await r.json();
  return j.modes;
}

export async function createSession(mode: string, idea: string): Promise<{ id: string }> {
  const r = await apiFetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, idea }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "创建会话失败");
  const j = await r.json();
  // 后端返回 { session: meta }
  return { id: j.session?.id ?? j.id };
}

// 用 fetch 流式读取 SSE（比 EventSource 更可控，支持自定义 header/取消）
export async function runSession(
  sessionId: string,
  onEvent: (e: LoomEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const resp = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/run`, {
    method: "POST",
    signal,
  });
  if (!resp.body) throw new Error("无响应流");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        /* 忽略半包 */
      }
    }
  }
}

export function previewUrl(sessionId: string, path = "index.html", nonce?: number): string {
  // iframe 无法带 Authorization 头，改用 ?token= 查询参数（后端 get_current_user 支持）
  const token = getAuthToken();
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (nonce != null) params.set("t", String(nonce));
  const qs = params.toString();
  return `${API_BASE}/api/preview/${sessionId}/${path}${qs ? `?${qs}` : ""}`;
}

export async function submitAnswer(
  sessionId: string,
  answer: any
): Promise<{ ok: boolean; resume: boolean }> {
  // 后端 AnswerIn: { answers: dict, choice?: string }
  const body = answer && (answer.answers || answer.choice)
    ? { answers: answer.answers || {}, choice: answer.choice ?? null }
    : { answers: answer || {}, choice: null };
  const r = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "提交失败");
  return r.json();
}

// 迭代修改：流式返回过程事件（补丁优先）
export async function iterateSession(
  sessionId: string,
  instruction: string,
  onEvent: (e: LoomEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const resp = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/iterate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction }),
    signal,
  });
  if (!resp.body) throw new Error("无响应流");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        /* 忽略半包 */
      }
    }
  }
}

export async function fetchSnapshots(sessionId: string): Promise<string[]> {
  const r = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/snapshots`);
  return (await r.json()).snapshots || [];
}

export interface SessionSummary {
  id: string;
  title: string;
  mode: string;
  stage: string;
  updated_at: number;
  has_app?: boolean;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const r = await apiFetch(`${API_BASE}/api/sessions`);
  return (await r.json()).sessions || [];
}

export async function loadSession(sessionId: string): Promise<any> {
  const r = await apiFetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!r.ok) throw new Error("加载会话失败");
  return r.json();
}

export function exportUrl(sessionId: string): string {
  const token = getAuthToken();
  return `${API_BASE}/api/sessions/${sessionId}/export${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

// ---------------- Skill 市场 ----------------

export interface Skill {
  id: string;
  name: string;
  description: string;
  agent: string;
  keywords: string[];
  instructions: string;
  builtin: boolean;
  enabled: boolean;
}

export async function listSkills(): Promise<Skill[]> {
  const r = await apiFetch(`${API_BASE}/api/skills`);
  return (await r.json()).skills || [];
}

export async function uploadSkill(content: string): Promise<Skill> {
  const r = await apiFetch(`${API_BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || "上传失败");
  return j.skill;
}

export async function toggleSkill(id: string, enabled: boolean): Promise<void> {
  const r = await apiFetch(`${API_BASE}/api/skills/${id}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error("操作失败");
}

export async function deleteSkill(id: string): Promise<void> {
  const r = await apiFetch(`${API_BASE}/api/skills/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("删除失败");
}

export async function rollbackSnapshot(
  sessionId: string,
  rev: string
): Promise<void> {
  const r = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rev }),
  });
  if (!r.ok) throw new Error("回滚失败");
}

// ---------------- 模型配置 ----------------

export interface ModelConfig {
  api_key: string;
  base_url: string;
  model: string;
  is_configured: boolean;
}

export async function fetchModelConfig(): Promise<ModelConfig> {
  const r = await apiFetch(`${API_BASE}/api/model`);
  if (!r.ok) throw new Error("读取模型配置失败");
  return r.json();
}

export async function updateModelConfig(
  cfg: Pick<ModelConfig, "api_key" | "base_url" | "model">
): Promise<void> {
  const r = await apiFetch(`${API_BASE}/api/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "保存失败");
}
