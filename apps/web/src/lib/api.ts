import type { DarwinOnboardingAnswers } from '@clawlive/shared-types';

const _BACKEND_URL = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');
const _PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

/**
 * 浏览器：若配置的 API 与当前站点不同源，则使用 ''（同源 `/api/...`），由 next.config.js
 * rewrites 反代到后端。避免直连 Railway 时当前 Origin 未写入后端 CORS 而出现 `Failed to fetch`。
 * Socket 等仍可用 NEXT_PUBLIC_SOCKET_URL 直连（见 socket.ts）。
 * 服务端 / SSR：始终使用完整后端地址。
 */
function getBrowserApiBaseUrl(): string {
  if (!_PUBLIC_API_URL) return '';
  try {
    const apiOrigin = new URL(_PUBLIC_API_URL).origin;
    if (apiOrigin !== window.location.origin) return '';
  } catch {
    return _PUBLIC_API_URL;
  }
  return _PUBLIC_API_URL;
}

export const API_BASE_URL =
  typeof window === 'undefined' ? _BACKEND_URL : getBrowserApiBaseUrl();

/** Actual backend origin for server-only contexts (e.g. video-proxy, OG images). */
export const SERVER_API_URL = _BACKEND_URL;

/**
 * 媒体地址：/uploads/... 使用同源相对路径，由 next.config.js rewrites 转发到后端；
 * 避免 NEXT_PUBLIC_API_URL 未注入时回退 localhost 导致线上裂图。
 */
export function resolveMediaUrl(path: string | null | undefined): string {
  if (path == null || path === '') return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/uploads/')) {
    return normalized;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${normalized}`;
}

function getNetworkErrorMsg(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return '无法连接服务器。请确认本地后端已启动（本仓库默认 http://localhost:3001）。';
    }
  }
  return '无法连接服务器。若前端在 Vercel、后端在 Railway，请在 Vercel 环境变量中设置 BACKEND_URL 或 NEXT_PUBLIC_API_URL（Railway 公网 https 根地址，无尾斜杠），保存后重新部署；并确认 Railway 服务在线。';
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

/** LINK `POST /api/codernet/search` 流式进度（与后端 `SearchProgress` 对齐） */
export type CodernetSearchProgress = {
  phase: 'parsing' | 'searching' | 'enriching' | 'ranking' | 'done' | 'error';
  detail: string;
  githubQuery?: string;
  totalFound?: number;
};

export type CodernetLinkSearchBucketKey =
  | 'jobSeekingAndContact'
  | 'jobSeekingOnly'
  | 'contactOnly'
  | 'neither';

export type CodernetLinkSearchBuckets = Record<CodernetLinkSearchBucketKey, unknown[]>;

export type CodernetLinkSearchResponse = {
  results: unknown[];
  buckets?: CodernetLinkSearchBuckets;
  meta?: { mergedGithubCount?: number; enrichedCount?: number };
};

function stripUtf8Bom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

/** LINK 搜索流异常时附带 `X-Request-Id`，便于与后端 `[GITLINK] linkSearch` 日志逐条对齐。 */
function withCodernetSearchTrace(message: string, traceId: string | null | undefined): string {
  const id = typeof traceId === 'string' ? traceId.trim() : '';
  if (!id) return message;
  return `${message}\n（请求追踪 ID: ${id}；可与服务端日志 [GITLINK] linkSearch 对照）`;
}

function handleCodernetSearchNdjsonLine(
  trimmed: string,
  onProgress: ((p: CodernetSearchProgress) => void) | undefined,
  state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  },
  traceId?: string | null,
): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return;
  }
  const typ = typeof msg.type === 'string' ? msg.type.toLowerCase() : '';
  if (typ === 'progress' && msg.progress && typeof msg.progress === 'object' && onProgress) {
    onProgress(msg.progress as CodernetSearchProgress);
  } else if (typ === 'complete') {
    state.results = Array.isArray(msg.results) ? msg.results : [];
    const b = msg.buckets;
    if (b && typeof b === 'object') {
      state.buckets = {
        jobSeekingAndContact: Array.isArray((b as Record<string, unknown>).jobSeekingAndContact)
          ? ((b as Record<string, unknown>).jobSeekingAndContact as unknown[])
          : [],
        jobSeekingOnly: Array.isArray((b as Record<string, unknown>).jobSeekingOnly)
          ? ((b as Record<string, unknown>).jobSeekingOnly as unknown[])
          : [],
        contactOnly: Array.isArray((b as Record<string, unknown>).contactOnly)
          ? ((b as Record<string, unknown>).contactOnly as unknown[])
          : [],
        neither: Array.isArray((b as Record<string, unknown>).neither)
          ? ((b as Record<string, unknown>).neither as unknown[])
          : [],
      };
    } else {
      state.buckets = null;
    }
    const m = msg.meta;
    state.meta =
      m && typeof m === 'object'
        ? (m as { mergedGithubCount?: number; enrichedCount?: number })
        : null;
  } else if (typ === 'error') {
    throw new APIError(
      500,
      withCodernetSearchTrace(typeof msg.message === 'string' ? msg.message : '搜索失败', traceId),
    );
  }
}

/**
 * 解析整段响应：NDJSON 行 + 最后一行可能无换行；若无 `complete` 行则尝试整包 JSON `{ results }`。
 */
function parseCodernetSearchResponseBody(
  rawText: string,
  onProgress?: (p: CodernetSearchProgress) => void,
  traceId?: string | null,
): CodernetLinkSearchResponse {
  const text = stripUtf8Bom(rawText);
  const state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  } = { results: null, buckets: null, meta: null };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    handleCodernetSearchNdjsonLine(trimmed, onProgress, state, traceId);
  }

  if (state.results !== null) {
    return {
      results: state.results,
      buckets: state.buckets ?? undefined,
      meta: state.meta ?? undefined,
    };
  }

  try {
    const msg = JSON.parse(text) as Record<string, unknown>;
    if (msg && typeof msg === 'object' && Array.isArray(msg.results)) {
      const out: CodernetLinkSearchResponse = { results: msg.results };
      const b = msg.buckets;
      if (b && typeof b === 'object') {
        out.buckets = {
          jobSeekingAndContact: Array.isArray((b as Record<string, unknown>).jobSeekingAndContact)
            ? ((b as Record<string, unknown>).jobSeekingAndContact as unknown[])
            : [],
          jobSeekingOnly: Array.isArray((b as Record<string, unknown>).jobSeekingOnly)
            ? ((b as Record<string, unknown>).jobSeekingOnly as unknown[])
            : [],
          contactOnly: Array.isArray((b as Record<string, unknown>).contactOnly)
            ? ((b as Record<string, unknown>).contactOnly as unknown[])
            : [],
          neither: Array.isArray((b as Record<string, unknown>).neither)
            ? ((b as Record<string, unknown>).neither as unknown[])
            : [],
        };
      }
      if (msg.meta && typeof msg.meta === 'object') {
        out.meta = msg.meta as { mergedGithubCount?: number; enrichedCount?: number };
      }
      return out;
    }
  } catch {
    /* fall through */
  }

  throwCodernetSearchResponseUnusable(text, traceId);
}

/** 无法得到带 `results` 的 `complete` 行或等价 JSON 时的兜底说明（区分空/HTML/JSON 错误体）。 */
function throwCodernetSearchResponseUnusable(rawText: string, traceId?: string | null): never {
  const text = stripUtf8Bom(rawText);
  const t = text.trim();
  if (!t) {
    throw new APIError(0, withCodernetSearchTrace('搜索响应为空，可能是连接中断或网关超时，请重试。', traceId));
  }
  if (/<\s*!DOCTYPE|<\s*html[\s>]/i.test(t)) {
    throw new APIError(0, withCodernetSearchTrace('搜索返回了网页而非数据（常见于网关超时或反代错误），请重试。', traceId));
  }
  if (t.length < 8192 && /\b(502|503|504)\b/i.test(t) && !t.trimStart().startsWith('{')) {
    throw new APIError(0, withCodernetSearchTrace('上游返回了错误页文本（如 502/503/504），请稍后重试。', traceId));
  }
  try {
    const msg = JSON.parse(text) as Record<string, unknown>;
    if (msg && typeof msg === 'object') {
      if (typeof msg.error === 'string' && msg.error.trim()) {
        throw new APIError(500, withCodernetSearchTrace(msg.error, traceId));
      }
      const typ = typeof msg.type === 'string' ? msg.type.toLowerCase() : '';
      if (typ === 'error' && typeof msg.message === 'string' && msg.message.trim()) {
        throw new APIError(500, withCodernetSearchTrace(msg.message, traceId));
      }
    }
  } catch (e) {
    if (e instanceof APIError) throw e;
  }
  throw new APIError(
    0,
    withCodernetSearchTrace('搜索响应不完整或未识别。请重试；若持续出现多为网络或服务负载导致。', traceId),
  );
}

/**
 * 读取 LINK 搜索响应：按行解析 NDJSON，并同步累积全文。
 * 不在此处使用 `body.tee()`：部分环境下未消费的 tee 分支会带来背压/内存问题；
 * 若行级解析未收到 `complete`，再用全文走 `parseCodernetSearchResponseBody`（兼容反代改写 Content-Type、
 * 或仅能通过整包解析识别的边界情况）。
 */
async function consumeCodernetSearchNdjsonStream(
  response: Response,
  onProgress?: (p: CodernetSearchProgress) => void,
  traceId?: string | null,
): Promise<CodernetLinkSearchResponse> {
  const body = response.body;
  if (!body) {
    throw new APIError(0, withCodernetSearchTrace('无法读取搜索响应流', traceId));
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  } = { results: null, buckets: null, meta: null };

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      throw new APIError(0, withCodernetSearchTrace(`读取搜索流失败，连接可能已断开：${raw}`, traceId));
    }
    const { done, value } = chunk;
    const piece = decoder.decode(value ?? new Uint8Array(0), { stream: !done });
    full += piece;
    buffer += piece;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      handleCodernetSearchNdjsonLine(trimmed, onProgress, state, traceId);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    handleCodernetSearchNdjsonLine(buffer.trim(), onProgress, state, traceId);
  }

  if (state.results !== null) {
    return {
      results: state.results,
      buckets: state.buckets ?? undefined,
      meta: state.meta ?? undefined,
    };
  }

  // 未识别到 complete 行：用全文兜底（例如网关剥掉 ndjson Content-Type、或截断前行仍拼成可解析包）
  return parseCodernetSearchResponseBody(full, undefined, traceId);
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const optsHeaders = options.headers;
  if (optsHeaders && typeof optsHeaders === 'object' && !(optsHeaders instanceof Headers) && !Array.isArray(optsHeaders)) {
    Object.assign(headers, optsHeaders as Record<string, string>);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const detail = `[${url}] ${raw}`;
    throw new APIError(0, `${getNetworkErrorMsg()}\n(${detail})`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const msg = error?.error || (response.status >= 500 ? `服务器错误 (${response.status})` : response.status === 0 ? '网络或 CORS 错误，请检查后端 CORS 配置' : `请求失败 (${response.status})`);
    throw new APIError(response.status, msg);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      fetchAPI('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, email: string, password: string, avatar: string) =>
      fetchAPI('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, avatar }),
      }),
    me: () => fetchAPI('/api/auth/me'),
    updateMe: (body: { username?: string; bio?: string | null; personalResume?: string | null }) =>
      fetchAPI('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  rooms: {
    list: (params?: { page?: number; limit?: number; isLive?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', params.page.toString());
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.isLive !== undefined) query.set('isLive', params.isLive.toString());
      return fetchAPI(`/api/rooms?${query}`);
    },
    get: (roomId: string) => fetchAPI(`/api/rooms/${roomId}`),
    create: (data: { id: string; title: string; description?: string; lobsterName: string }) =>
      fetchAPI('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (roomId: string, data: any) =>
      fetchAPI(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}`, {
        method: 'DELETE',
      }),
    start: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}/start`, {
        method: 'POST',
      }),
    stop: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}/stop`, {
        method: 'POST',
      }),
    messages: (roomId: string, params?: { limit?: number; before?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.before) query.set('before', params.before);
      return fetchAPI(`/api/rooms/${roomId}/messages?${query}`);
    },
    logs: (roomId: string, params?: { limit?: number; before?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.before) query.set('before', params.before);
      return fetchAPI(`/api/rooms/${roomId}/logs?${query}`);
    },
  },
  points: {
    llm: () => fetchAPI('/api/points/llm'),
    redeemLlm: (clawPoints: number, idempotencyKey?: string) =>
      fetchAPI('/api/points/redeem-llm', {
        method: 'POST',
        body: JSON.stringify({ clawPoints }),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),
    getVirtualKey: () => fetchAPI('/api/points/llm/virtual-key'),
    keyStats: () => fetchAPI('/api/points/llm/key-stats'),
    fixKeyModels: () => fetchAPI('/api/points/llm/fix-key-models', { method: 'POST' }),
    testLlm: (body?: { message?: string; useVirtualKey?: boolean; model?: string }) =>
      fetchAPI('/api/points/llm/test', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    history: () => fetchAPI('/api/points/history'),
  },
  lobster: {
    me: () => fetchAPI('/api/lobster/me'),
    apply: (name?: string, onboarding?: DarwinOnboardingAnswers) =>
      fetchAPI('/api/lobster/apply', {
        method: 'POST',
        body: JSON.stringify({ name, onboarding }),
      }),
    rename: (name: string) => fetchAPI('/api/lobster/name', { method: 'PATCH', body: JSON.stringify({ name }) }),
    history: () => fetchAPI('/api/lobster/history'),
    chat: (message: string, image?: string, pageContext?: string, pageUrl?: string) =>
      fetchAPI('/api/lobster/chat', { method: 'POST', body: JSON.stringify({ message, image, pageContext, pageUrl }) }),
    clearHistory: () => fetchAPI('/api/lobster/history', { method: 'DELETE' }),
    keyStatus: () => fetchAPI('/api/lobster/key-status'),
    listFiles: () => fetchAPI('/api/lobster/files'),
    deleteFile: (fileId: string) =>
      fetchAPI(`/api/lobster/files/${fileId}`, { method: 'DELETE' }),
  },
  agentKeys: {
    list: () => fetchAPI('/api/open/agent/keys'),
    create: (agentName: string, agentType?: string) =>
      fetchAPI('/api/open/agent/register', {
        method: 'POST',
        body: JSON.stringify({ agentName, agentType: agentType || 'custom' }),
      }),
    revoke: (keyId: string) => fetchAPI(`/api/open/agent/keys/${keyId}`, { method: 'DELETE' }),
  },
  publishedSkills: {
    list: (params?: { q?: string; tag?: string; page?: number }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.tag) qs.set('tag', params.tag);
      if (params?.page) qs.set('page', String(params.page));
      return fetchAPI(`/api/published-skills?${qs.toString()}`);
    },
    my: () => fetchAPI('/api/published-skills/my'),
    get: (id: string) => fetchAPI(`/api/published-skills/${id}`),
    publish: (data: {
      title: string;
      description?: string;
      skillMarkdown: string;
      tags?: string[];
      creditCostPerCall?: number;
    }) =>
      fetchAPI('/api/published-skills', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: { title?: string; description?: string; skillMarkdown?: string; tags?: string[]; creditCostPerCall?: number },
    ) => fetchAPI(`/api/published-skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI(`/api/published-skills/${id}`, { method: 'DELETE' }),
    creditTable: () => fetchAPI('/api/published-skills/credit-table'),
  },
  platform: {
    getModels: () => fetchAPI('/api/platform/models'),
    getLitellmModels: () => fetchAPI('/api/platform/litellm-models'),
    saveModels: (models: { id: string; name: string; enabled: boolean }[], adminSecret: string) =>
      fetchAPI('/api/platform/models', {
        method: 'POST',
        headers: { 'x-admin-secret': adminSecret },
        body: JSON.stringify({ models }),
      }),
  },
  feedPosts: {
    list: (params?: { evolutionPointId?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.evolutionPointId) q.set('evolutionPointId', params.evolutionPointId);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return fetchAPI(`/api/feed-posts${qs ? `?${qs}` : ''}`);
    },
    get: (postId: string) => fetchAPI(`/api/feed-posts/${postId}`),
    update: (
      postId: string,
      body: { title?: string; content?: string; images?: string[]; coverIdx?: number },
    ) =>
      fetchAPI(`/api/feed-posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  codernet: {
    /** 登录：邮箱 → GitHub 登录名（站内绑定或 GitHub 公开 commit 搜索） */
    resolveGithubFromEmail: (email: string) =>
      fetchAPI('/api/codernet/github/resolve-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    /**
     * Semantic developer search → ranked GitHub users (no email).
     * Optional `files` → multipart `query` + `attachments[]`（txt/md/pdf/docx/图片等）。
     */
    searchDevelopers: async (
      query: string,
      files?: File[],
      onProgress?: (p: CodernetSearchProgress) => void,
    ) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/codernet/search`;
      const headers: Record<string, string> = {
        Accept: 'application/x-ndjson, application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const requestTraceId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `ts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      headers['X-Request-Id'] = requestTraceId;

      let body: BodyInit;
      if (files?.length) {
        const fd = new FormData();
        fd.set('query', query);
        for (const f of files) {
          fd.append('attachments', f);
        }
        body = fd;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ query });
      }

      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(
          0,
          withCodernetSearchTrace(`${getNetworkErrorMsg()}\n([${url}] ${raw})`, requestTraceId),
        );
      }

      const traceForLogs =
        response.headers.get('x-request-id')?.trim() ||
        response.headers.get('X-Request-Id')?.trim() ||
        requestTraceId;

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string };
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        throw new APIError(response.status, withCodernetSearchTrace(msg, traceForLogs));
      }

      // 200 时后端约定为 NDJSON；反代可能改写 Content-Type，故只要存在 body 就按流读取并带全文兜底
      if (response.body) {
        return consumeCodernetSearchNdjsonStream(response, onProgress, traceForLogs);
      }
      const text = await response.text();
      return parseCodernetSearchResponseBody(text, onProgress, traceForLogs);
    },
  },
  recruitment: {
    pipelineStages: () => fetchAPI('/api/recruitment/pipeline-stages'),
    listJds: () => fetchAPI('/api/recruitment/jds'),
    createJd: (body: {
      title: string;
      body: string;
      companyName?: string | null;
      location?: string | null;
      matchTags?: string[];
    }) =>
      fetchAPI('/api/recruitment/jds', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    getJd: (id: string) => fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`),
    updateJd: (
      id: string,
      body: { title?: string; body?: string; companyName?: string | null; location?: string | null; matchTags?: string[] },
    ) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteJd: (id: string) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    addCandidate: (
      jdId: string,
      body: {
        githubUsername: string;
        displayName?: string | null;
        email?: string | null;
        notes?: string | null;
        pipelineStage?: string;
      },
    ) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateCandidate: (
      jdId: string,
      candidateId: string,
      body: { displayName?: string | null; email?: string | null; notes?: string | null; pipelineStage?: string },
    ) =>
      fetchAPI(
        `/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/${encodeURIComponent(candidateId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),
    deleteCandidate: (jdId: string, candidateId: string) =>
      fetchAPI(
        `/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/${encodeURIComponent(candidateId)}`,
        { method: 'DELETE' },
      ),
    recommend: (jdId: string, body?: { limit?: number }) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/recommend`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
  },
  math: {
    /** SSE: same FormData as match(); onEvent receives JSON payloads { phase, ... } */
    matchStream: async (formData: FormData, onEvent: (payload: Record<string, unknown>) => void) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/math/match-stream`;
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (token) headers.Authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body: formData });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(0, `${getNetworkErrorMsg()}\n([${url}] ${raw})`);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        throw new APIError(response.status, msg);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new APIError(0, '无法读取响应流');
      }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
              onEvent(payload);
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      }
    },
    /** Multipart: jdText, resumeText, githubUsername, jdFiles[], resumeFiles[] */
    match: async (formData: FormData) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/math/match`;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body: formData });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(0, `${getNetworkErrorMsg()}\n([${url}] ${raw})`);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        throw new APIError(response.status, msg);
      }
      return response.json() as Promise<{
        result: {
          jdItemMatches: Array<{
            id: string;
            title: string;
            matchScore: number;
            rationale: string;
            gap?: string;
          }>;
          overallMatch: number;
          executiveSummary: string;
          notes?: string;
        };
        meta: { jdChars: number; resumeChars: number; githubUsed: boolean };
      }>;
    },
  },
  admin: {
    usersOverview: () => fetchAPI('/api/admin/users-overview'),
  },
};
