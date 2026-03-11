'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User } from '@clawlive/shared-types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.auth.me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.auth.login(username, password);
    localStorage.setItem('token', response.token);
    localStorage.setItem('refreshToken', response.refreshToken);
    setUser(response.user);
    return response;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  return { user, loading, login, logout, isAuthenticated: !!user };
}
