'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

type InboxRow = {
  id: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  source: string;
  sender: { id: string; username: string; avatarUrl?: string | null; githubUsername?: string | null };
};

export default function MessagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.replace('/login?redirect=/messages');
      return;
    }
    setErr(null);
    try {
      const data = (await api.messages.list()) as { messages?: InboxRow[] };
      setRows(data.messages ?? []);
    } catch (e) {
      if (e instanceof APIError && e.status === 401) {
        router.replace('/login?redirect=/messages');
        return;
      }
      setErr(e instanceof APIError ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    try {
      await api.messages.markRead(id);
      setRows((prev) => prev.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)));
    } catch {
      /* ignore */
    }
  };

  if (loading) {
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
      <div className="min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-xl font-bold">站内信</h1>
            <Link href="/codernet" className="text-sm text-violet-400 hover:text-violet-300 font-mono">
              ← GITLINK
            </Link>
          </div>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            来自 LINK 搜索、招聘广场匹配推送或其他联系的消息会出现在此。未注册 GitHub
            账号绑定前发送给你的联系，会在你使用相同 GitHub 登录后自动投递。
          </p>
          {err && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4">{err}</p>
          )}
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">暂无消息</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 ${m.readAt ? 'opacity-90' : 'ring-1 ring-violet-500/25'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{m.subject}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        @{m.sender.username}
                        {m.sender.githubUsername ? ` · GH:${m.sender.githubUsername}` : ''} ·{' '}
                        {new Date(m.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    {!m.readAt && (
                      <button
                        type="button"
                        onClick={() => void markRead(m.id)}
                        className="shrink-0 text-[10px] font-mono text-violet-400 hover:text-violet-300"
                      >
                        标为已读
                      </button>
                    )}
                  </div>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{m.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
