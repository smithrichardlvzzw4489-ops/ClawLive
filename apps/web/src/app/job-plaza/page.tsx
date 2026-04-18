'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, APIError } from '@/lib/api';
import { MainLayout } from '@/components/MainLayout';
import { usePrimaryPersona } from '@/contexts/PrimaryPersonaContext';
import {
  JobPlazaSeekerMatchModal,
  type SeekerTagPreview,
} from '@/components/job-plaza/JobPlazaSeekerMatchModal';

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

const MATH_PREFIX = 'clawlive-job-plaza-math:';

function readCachedOverall(jobId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MATH_PREFIX + jobId);
    if (!raw) return null;
    const o = JSON.parse(raw) as { overallMatch?: unknown };
    return typeof o.overallMatch === 'number' ? o.overallMatch : null;
  } catch {
    return null;
  }
}

export default function JobPlazaPage() {
  const { persona, personaReady } = usePrimaryPersona();
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [previews, setPreviews] = useState<Record<string, SeekerTagPreview>>({});
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [mathCachedOverall, setMathCachedOverall] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalJobId, setModalJobId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  const showSeekerMatch = personaReady && persona === 'developer' && hasToken;

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

  useEffect(() => {
    setHasToken(Boolean(typeof window !== 'undefined' && localStorage.getItem('token')));
  }, []);

  useEffect(() => {
    if (!items.length) {
      setMathCachedOverall({});
      return;
    }
    const next: Record<string, number> = {};
    for (const it of items) {
      const v = readCachedOverall(it.id);
      if (v != null) next[it.id] = v;
    }
    setMathCachedOverall(next);
  }, [items]);

  useEffect(() => {
    if (!showSeekerMatch || items.length === 0) {
      setPreviews({});
      setPreviewErr(null);
      return;
    }
    let cancelled = false;
    setPreviewErr(null);
    (async () => {
      try {
        const ids = items.map((i) => i.id);
        const data = await api.jobPlaza.matchPreviews(ids);
        if (cancelled) return;
        setPreviews((data.previews ?? {}) as Record<string, SeekerTagPreview>);
      } catch (e: unknown) {
        if (cancelled) return;
        setPreviewErr(e instanceof APIError ? e.message : '匹配预估加载失败');
        setPreviews({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSeekerMatch, items]);

  const openMatchModal = (it: PlazaItem) => {
    setModalJobId(it.id);
    setModalTitle(it.title);
    setModalOpen(true);
  };

  const onMathSaved = useCallback((jobId: string, overall: number) => {
    setMathCachedOverall((prev) => ({ ...prev, [jobId]: overall }));
  }, []);

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
        {previewErr && showSeekerMatch ? (
          <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
            {previewErr}
          </div>
        ) : null}

        <p className="text-xs text-slate-600 mb-4">共 {total} 条</p>

        <ul className="space-y-3">
          {items.map((it) => {
            const pv = previews[it.id];
            const mathOverall = mathCachedOverall[it.id];
            return (
              <li key={it.id}>
                <div className="flex rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-violet-500/30 hover:bg-white/[0.05] overflow-hidden">
                  <Link
                    href={`/job-plaza/${encodeURIComponent(it.id)}`}
                    className="min-w-0 flex-1 block px-5 py-4 text-left"
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
                  {showSeekerMatch ? (
                    <button
                      type="button"
                      onClick={() => openMatchModal(it)}
                      className="shrink-0 w-[5.5rem] sm:w-28 border-l border-white/[0.08] px-2 py-3 flex flex-col items-center justify-center gap-0.5 bg-black/20 hover:bg-violet-950/30 transition text-center"
                    >
                      <span className="text-[10px] text-slate-500 leading-none">匹配度</span>
                      <span className="text-2xl sm:text-3xl font-black text-violet-300 tabular-nums leading-none">
                        {typeof mathOverall === 'number' ? mathOverall : pv?.tagMatchPercent ?? '—'}
                      </span>
                      <span className="text-[9px] text-slate-600 leading-none">
                        {typeof mathOverall === 'number' ? 'MATH' : '预估'}
                      </span>
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

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

        <JobPlazaSeekerMatchModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          jobId={modalJobId}
          jobTitle={modalTitle}
          preview={modalJobId ? previews[modalJobId] : undefined}
          onMathSaved={onMathSaved}
        />
      </div>
    </MainLayout>
  );
}
