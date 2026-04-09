import type { DarwinOnboardingAnswers } from '@clawlive/shared-types';

const _BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Client-side: use NEXT_PUBLIC_API_URL directly to call Railway backend,
 * bypassing Vercel's serverless proxy (which has a 10-60s timeout that kills SSE streams).
 * Falls back to '' (relative URL via Next.js rewrite) only in local dev without env var.
 * Server-side: always use the full backend URL.
 */
export const API_BASE_URL =
  typeof window === 'undefined'
    ? _BACKEND_URL
    : process.env.NEXT_PUBLIC_API_URL || '';

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

const NETWORK_ERROR_MSG =
  '无法连接服务器，请确认后端服务已启动（默认端口 3001）';

function getNetworkErrorMsg(): string {
  return NETWORK_ERROR_MSG;
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
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
    updateMe: (body: { username?: string; bio?: string | null }) =>
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
  evolutionNetwork: {
    listPoints: (params?: { status?: 'proposed' | 'active' | 'ended' | 'evolving' }) => {
      const q = params?.status ? `?status=${params.status}` : '';
      return fetchAPI(`/api/evolution-network/points${q}`);
    },
    recommended: (limit?: number) => {
      const q = limit != null ? `?limit=${limit}` : '';
      return fetchAPI(`/api/evolution-network/points/recommended${q}`);
    },
    getPoint: (id: string) => fetchAPI(`/api/evolution-network/points/${id}`),
    getComments: (id: string) => fetchAPI(`/api/evolution-network/points/${id}/comments`),
    join: (id: string, body: string) =>
      fetchAPI(`/api/evolution-network/points/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    complete: (id: string) =>
      fetchAPI(`/api/evolution-network/points/${id}/complete`, { method: 'POST', body: '{}' }) as Promise<{
        success?: boolean;
        point?: unknown;
        installedSkills?: number;
      }>,
    cancel: (id: string) =>
      fetchAPI(`/api/evolution-network/points/${id}/cancel`, { method: 'POST', body: '{}' }),
    setLinkedSkills: (
      id: string,
      skills: Array<{ id?: string; title: string; skillMarkdown: string }>,
    ) =>
      fetchAPI(`/api/evolution-network/points/${id}/linked-skills`, {
        method: 'PUT',
        body: JSON.stringify({ skills }),
      }),
    generateAcceptance: (id: string) =>
      fetchAPI(`/api/evolution-network/points/${id}/acceptance/generate`, {
        method: 'POST',
        body: '{}',
      }),
    runAcceptance: (id: string) =>
      fetchAPI(`/api/evolution-network/points/${id}/acceptance/run`, {
        method: 'POST',
        body: '{}',
      }) as Promise<{
        success?: boolean;
        passed?: boolean;
        results?: Array<{ caseId: string; ok: boolean; stdout?: string; stderr?: string }>;
        point?: unknown;
      }>,
    create: (data: { title: string; goal: string; problems: string[] }) =>
      fetchAPI('/api/evolution-network/points', { method: 'POST', body: JSON.stringify(data) }),
    myObservation: () => fetchAPI('/api/evolution-network/my-observation'),
  },
  evolver: {
    rounds: (limit?: number) => {
      const q = limit != null ? `?limit=${limit}` : '';
      return fetchAPI(`/api/evolver/rounds${q}`);
    },
    roundEvents: (roundId: string) => fetchAPI(`/api/evolver/rounds/${roundId}/events`),
    run: () => fetchAPI('/api/evolver/run', { method: 'POST', body: '{}' }),
  },
  darwin: {
    directory: (params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const s = q.toString();
      return fetchAPI(`/api/darwin/directory${s ? `?${s}` : ''}`);
    },
    profile: (username: string) =>
      fetchAPI(`/api/darwin/profile/${encodeURIComponent(username)}`),
    cloneSkills: (body: { sourceUserId?: string; sourceUsername?: string }) =>
      fetchAPI('/api/darwin/clone-skills', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  jobA2A: {
    publicJobs: (limit?: number) => {
      const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : '';
      return fetchAPI(`/api/job-a2a/public/jobs${q}`);
    },
    publicSeekers: (limit?: number) => {
      const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : '';
      return fetchAPI(`/api/job-a2a/public/seekers${q}`);
    },
    dashboard: () => fetchAPI('/api/job-a2a/dashboard'),
    saveSeeker: (body: {
      title: string;
      city?: string;
      salaryMin?: number;
      salaryMax?: number;
      skills: string[];
      narrative: string;
      active?: boolean;
    }) =>
      fetchAPI('/api/job-a2a/seeker', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    saveEmployer: (body: {
      jobTitle: string;
      city?: string;
      salaryMin?: number;
      salaryMax?: number;
      skills: string[];
      companyName?: string;
      narrative: string;
      active?: boolean;
    }) =>
      fetchAPI('/api/job-a2a/employer', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    runMatch: () => fetchAPI('/api/job-a2a/run-match', { method: 'POST', body: '{}' }),
    getMatch: (id: string) => fetchAPI(`/api/job-a2a/matches/${id}`),
    agentStep: (id: string, rounds?: number) =>
      fetchAPI(`/api/job-a2a/matches/${id}/agent-step`, {
        method: 'POST',
        body: JSON.stringify({ rounds: rounds === undefined ? 10 : rounds }),
      }),
    unlockHuman: (id: string) =>
      fetchAPI(`/api/job-a2a/matches/${id}/unlock-human`, { method: 'POST', body: '{}' }),
    humanMessage: (id: string, body: string) =>
      fetchAPI(`/api/job-a2a/matches/${id}/human-message`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
  },
};
