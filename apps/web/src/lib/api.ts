const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const NETWORK_ERROR_MSG = {
  zh: '无法连接服务器，请确认后端服务已启动（默认端口 3001）',
  en: 'Cannot connect to server. Please ensure the backend is running (default port 3001).',
};

function getNetworkErrorMsg(): string {
  if (typeof window === 'undefined') return NETWORK_ERROR_MSG.zh;
  const locale = localStorage.getItem('clawlive-locale');
  return locale === 'en' ? NETWORK_ERROR_MSG.en : NETWORK_ERROR_MSG.zh;
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

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch') || msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
      throw new APIError(0, getNetworkErrorMsg());
    }
    throw new APIError(0, msg || 'Network request failed');
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
    register: (username: string, email: string, password: string) =>
      fetchAPI('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
    me: () => fetchAPI('/api/auth/me'),
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
};
