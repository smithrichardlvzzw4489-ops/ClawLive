'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

type MsgRow = {
  id: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender?: { username: string; avatarUrl: string | null };
};

export default function MessagesInboxPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<MsgRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.siteMessages.inbox();
      setItems((data.items ?? []) as MsgRow[]);
      setUnread(typeof data.unread === 'number' ? data.unread : 0);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/messages');
      return;
    }
    void load();
  }, [authLoading, user, router, load]);

  const mark = async (id: string) => {
    try {
      await api.siteMessages.markRead(id);
      void load();
    } catch {
      /* ignore */
    }
  };

  if (authLoading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  if (!user) return null;

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-3xl px-4 py-8 text-slate-200">
        <h1 className="text-2xl font-bold text-white mb-6">站内信</h1>

        {unread > 0 && <p className="text-xs text-amber-200/90 mb-3">未读 {unread} 封</p>}
        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <ul className="space-y-2">
          {items.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border px-4 py-3 ${
                m.readAt ? 'border-white/[0.06] bg-white/[0.02]' : 'border-violet-500/25 bg-violet-500/5'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">
                    来自 <span className="font-mono text-violet-300">@{m.sender?.username ?? '?'}</span> ·{' '}
                    {new Date(m.createdAt).toLocaleString('zh-CN')}
                  </p>
                  {m.subject ? <p className="text-sm font-medium text-white mt-1">{m.subject}</p> : null}
                  <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap line-clamp-4">{m.body}</p>
                </div>
                {!m.readAt && (
                  <button
                    type="button"
                    onClick={() => void mark(m.id)}
                    className="text-xs text-violet-300 hover:underline shrink-0"
                  >
                    标为已读
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {items.length === 0 && <p className="text-center text-slate-500 py-12">暂无收件。</p>}
      </div>
    </MainLayout>
  );
}
