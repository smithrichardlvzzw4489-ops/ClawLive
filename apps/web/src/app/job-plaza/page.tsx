'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, APIError } from '@/lib/api';
import { MainLayout } from '@/components/MainLayout';
import { usePrimaryPersona } from '@/contexts/PrimaryPersonaContext';
import { useLocale } from '@/lib/i18n/LocaleContext';

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
  const { persona, personaReady } = usePrimaryPersona();
  const { t } = useLocale();
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
    void load(1);
  }, [load]);

  if (loading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-4xl px-4 py-8 text-slate-200">
        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <p className="text-xs text-slate-600 mb-4">共 {total} 条</p>

        <div
          className={
            personaReady && persona === 'recruiter'
              ? 'flex flex-col sm:flex-row gap-4 sm:items-start'
              : undefined
          }
        >
          <ul className={`space-y-3 ${personaReady && persona === 'recruiter' ? 'min-w-0 flex-1' : ''}`}>
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/job-plaza/${encodeURIComponent(it.id)}`}
                  className="flex rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-violet-500/30 hover:bg-white/[0.05] px-5 py-4 text-left min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-white">{it.title}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {[it.companyName, it.location].filter(Boolean).join(' · ') || '未填公司与地点'}
                      {it.author?.username ? ` · @${it.author.username}` : ''}
                    </p>
                    {it.matchTags?.length ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {it.matchTags.slice(0, 8).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {personaReady && persona === 'recruiter' ? (
            <div className="shrink-0 sm:pt-1">
              <Link
                href="/recruitment"
                className="inline-flex items-center justify-center rounded-xl border border-violet-500/35 bg-violet-600/20 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:border-violet-400/50 hover:bg-violet-600/35 whitespace-nowrap"
              >
                {t('nav.jobPlazaPostJob')}
              </Link>
            </div>
          ) : null}
        </div>

        {items.length === 0 && !loading && (
          <p className="text-center text-slate-500 py-12">暂无已发布职位。</p>
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
