'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { CodernetCardPageClient } from '@/components/codernet/CodernetCardPageClient';
import { API_BASE_URL } from '@/lib/api';

/**
 * 「我的」开发者画像：登录后首次进入会触发后台爬取/生成（与公开 /codernet/card/:user 同源数据）。
 */
export default function MyProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my/profile');
      return;
    }
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { username?: string } | null) => {
        if (u?.username) setUsername(u.username);
        else router.replace('/login?redirect=/my/profile');
      })
      .catch(() => router.replace('/login?redirect=/my/profile'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !username) {
    return (
      <MainLayout flatBackground>
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <CodernetCardPageClient username={username} variant="mine" />
    </MainLayout>
  );
}
