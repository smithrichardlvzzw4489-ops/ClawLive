'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

type PlazaItem = {
  id: string;
  title: string;
  companyName: string | null;
  location: string | null;
  matchTags: string[];
  status: string;
  publishedAt: string | null;
  author?: { username: string; githubUsername: string | null };
};

export default function JobPlazaPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setErr(null);
    setLoading(true);
    try {
      const data = await api.jobPlaza.list({ page: p, limit: 20 });
      setItems((data.items ?? []) as PlazaItem[]);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setPage(typeof data.page === 'number' ? data.page : p);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/job-plaza');
      return;
    }
    void load(1);
  }, [authLoading, user, router, load]);

  if (authLoading || loading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  if (!user) return null;

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-4xl px-4 py-8 text-slate-200">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">招聘广场</h1>
            <p className="text-sm text-slate-500 mt-1">已发布的职位 JD；在「招聘管理」新建 JD 时会自动出现在此列表。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/recruitment"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.06]"
            >
              招聘管理
            </Link>
            <Link
              href="/recruitment/new"
              className="rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white"
            >
              新建 JD
            </Link>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <p className="text-xs text-slate-600 mb-4">共 {total} 条</p>

        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={`/job-plaza/${encodeURIComponent(it.id)}`}
                className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 transition hover:border-violet-500/30 hover:bg-white/[0.05]"
              >
                <h2 className="text-lg font-semibold text-white">{it.title}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {[it.companyName, it.location].filter(Boolean).join(' · ') || '未填公司与地点'}
                  {it.author?.username ? ` · @${it.author.username}` : ''}
                </p>
                {it.matchTags?.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {it.matchTags.slice(0, 8).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-slate-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        {items.length === 0 && !loading && (
          <p className="text-center text-slate-500 py-12">暂无已发布职位，去招聘管理新建一个吧。</p>
        )}

        {total > 20 && (
          <div className="mt-8 flex justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page * 20 >= total}
              onClick={() => void load(page + 1)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
