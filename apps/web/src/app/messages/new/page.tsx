'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

function ComposeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [toUsername, setToUsername] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get('to')?.trim();
    if (t) setToUsername(t.replace(/^@/, ''));
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace('/login?redirect=/messages/new');
  }, [authLoading, user, router]);

  const send = async () => {
    if (!toUsername.trim() || !body.trim()) {
      setErr('请填写收件人用户名与正文');
      return;
    }
    setSending(true);
    setErr(null);
    try {
      await api.siteMessages.send({
        toUsername: toUsername.trim().replace(/^@/, ''),
        subject: subject.trim() || undefined,
        body: body.trim(),
      });
      router.replace('/messages');
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !user) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-lg px-4 py-8 text-slate-200">
        <Link href="/messages" className="text-sm text-violet-400 hover:underline">
          ← 收件箱
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white">写站内信</h1>
        <p className="text-xs text-slate-500 mt-2">收件人须为已注册的站内用户名（与登录名一致，大小写不敏感）。</p>

        {err && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">收件人用户名</span>
            <input
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="不含 @ 的登录名"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">主题（可选）</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">正文</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm resize-y min-h-[160px]"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={sending}
              onClick={() => void send()}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white"
            >
              {sending ? '发送中…' : '发送'}
            </button>
            <Link
              href="/messages"
              className="inline-flex items-center rounded-xl border border-white/15 px-5 py-2 text-sm text-slate-400 hover:bg-white/[0.06]"
            >
              取消
            </Link>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default function MessagesNewPage() {
  return (
    <Suspense
      fallback={
        <MainLayout flatBackground>
          <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-400">加载中…</div>
        </MainLayout>
      }
    >
      <ComposeContent />
    </Suspense>
  );
}
