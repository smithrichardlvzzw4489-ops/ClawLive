const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new APIError(response.status, error.error || 'Request failed');
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
    create: (data: { id: string; title: string; description?: string; lobsterName: string; dashboardUrl?: string }) =>
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
