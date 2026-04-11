'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

type Posting = {
  id: string;
  title: string;
  companyName?: string | null;
  location?: string | null;
  body: string;
  matchTags: string[];
  status: string;
  publishedAt: string | null;
  author?: { username: string; githubUsername?: string | null };
};

export default function JobPlazaDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState<Posting | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = (await api.jobPlaza.get(id)) as { posting?: Posting };
      setPosting(data.posting ?? null);
    } catch (e) {
      if (e instanceof APIError && e.status === 404) {
        setErr('该职位不存在或未公开。');
      } else {
        setErr(e instanceof APIError ? e.message : '加载失败');
      }
      setPosting(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <Link href="/job-plaza" className="text-sm text-violet-400 hover:text-violet-300 font-mono mb-6 inline-block">
            ← 招聘广场
          </Link>
          {err || !posting ? (
            <p className="text-sm text-slate-400 mt-4">{err ?? '未找到'}</p>
          ) : (
            <article className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
              <h1 className="text-xl font-bold">{posting.title}</h1>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                {posting.companyName || '公司未填'} · {posting.location || '地点未填'}
                {posting.author?.username ? ` · @${posting.author.username}` : ''}
              </p>
              {posting.matchTags?.length ? (
                <p className="text-[11px] text-slate-600 font-mono mt-3">{posting.matchTags.join(' · ')}</p>
              ) : null}
              <pre className="mt-6 text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed border-t border-white/[0.06] pt-6">
                {posting.body}
              </pre>
            </article>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
