'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

type Posting = {
  id: string;
  title: string;
  companyName: string | null;
  location: string | null;
  body?: string;
  matchTags: string[];
  status: string;
  publishedAt: string | null;
  createdAt?: string;
  author?: { username: string; githubUsername: string | null };
};

function formatZhDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function JobPlazaDetailPage() {
  const { t } = useLocale();
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [posting, setPosting] = useState<Posting | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) {
      setPosting(null);
      setErr('无效的职位链接');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setPosting(null);
    (async () => {
      try {
        const data = await api.jobPlaza.get(id);
        if (!cancelled) setPosting((data.posting ?? null) as Posting | null);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof APIError ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-3xl px-4 py-8 text-slate-200">
        <Link href="/job-plaza" className="text-sm text-violet-400 hover:underline">
          ← {t('nav.jobPlaza')}
        </Link>

        {err && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        {posting && (
          <article className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h1 className="text-2xl font-bold text-white">{posting.title}</h1>
            <p className="text-sm text-slate-500 mt-2">
              {[posting.companyName, posting.location].filter(Boolean).join(' · ') || '未填公司与地点'}
            </p>
            <p className="text-xs text-slate-600 mt-2">
              发布者：{posting.author?.username ? `@${posting.author.username}` : '—'} · 状态 {posting.status}
              {posting.publishedAt ? (
                <> · 发布于 {formatZhDateTime(posting.publishedAt)}</>
              ) : posting.createdAt ? (
                <> · 提交于 {formatZhDateTime(posting.createdAt)}</>
              ) : null}
            </p>
            {posting.matchTags?.length ? (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {posting.matchTags.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-slate-400"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {posting.body ? (
              <div className="mt-6 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{posting.body}</div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">暂无职位描述正文。</p>
            )}
          </article>
        )}
      </div>
    </MainLayout>
  );
}
