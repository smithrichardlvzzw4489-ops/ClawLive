'use client';

import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { CodernetCardPageClient } from '@/components/codernet/CodernetCardPageClient';

export default function CodernetCardPage() {
  const params = useParams<{ username: string }>();
  const raw = params?.username;
  const username = typeof raw === 'string' ? decodeURIComponent(raw) : Array.isArray(raw) ? decodeURIComponent(raw[0]) : '';
  if (!username) {
    return (
      <MainLayout flatBackground>
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f] text-slate-400 text-sm">无效的用户名</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <CodernetCardPageClient username={username} variant="public" />
    </MainLayout>
  );
}
