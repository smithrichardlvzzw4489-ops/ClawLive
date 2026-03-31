'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import {
  type EvolutionEndReason,
  type EvolutionPoint,
  type EvolutionPointStatus,
} from '@/lib/evolution-network';

function endReasonText(
  t: (k: string, params?: Record<string, string>) => string,
  reason: EvolutionEndReason
): string {
  if (!reason) return '—';
  if (reason === 'completed') return t('evolutionNetwork.endCompleted');
  if (reason === 'idle_timeout') return t('evolutionNetwork.endIdle');
  if (reason === 'cancelled') return t('evolutionNetwork.endCancelled');
  return '—';
}

function problemsPreview(p: EvolutionPoint): string {
  if (p.problems.length === 0) return '—';
  const s = p.problems.join('；');
  return s.length > 96 ? `${s.slice(0, 94)}…` : s;
}

const statusShell: Record<
  EvolutionPointStatus,
  string
> = {
  proposed:
    'border-amber-500/20 bg-gradient-to-br from-amber-950/25 to-black/40 hover:border-amber-400/35 hover:from-amber-950/35',
  active:
    'border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-black/40 hover:border-cyan-400/35 hover:from-cyan-950/30',
  ended:
    'border-slate-500/20 bg-gradient-to-br from-slate-900/40 to-black/40 hover:border-slate-400/30 hover:from-slate-900/50',
};

export function EvolutionNetworkCategoryPage({
  status,
}: {
  status: EvolutionPointStatus | 'evolving';
}) {
  const { t } = useLocale();
  const [points, setPoints] = useState<EvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = (await api.evolutionNetwork.listPoints(
          status === 'evolving' ? { status: 'evolving' } : { status },
        )) as { points: EvolutionPoint[] };
        if (!cancelled) setPoints(r.points ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const intro =
    status === 'ended'
      ? t('evolutionNetwork.categoryIntroEnded')
      : status === 'proposed'
        ? t('evolutionNetwork.categoryIntroProposed')
        : t('evolutionNetwork.categoryIntroActive');

  const title =
    status === 'ended'
      ? t('evolutionNetwork.sectionEnded')
      : status === 'proposed'
        ? t('evolutionNetwork.sectionProposed')
        : t('evolutionNetwork.sectionActive');

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-12 pt-4 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/evolution-network"
            className="inline-block text-sm text-slate-400 transition hover:text-white"
          >
            ← {t('evolutionNetwork.backToHub')}
          </Link>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{intro}</p>

          {loading && <p className="mt-10 text-center text-sm text-slate-500">加载中…</p>}
          {error && !loading && (
            <p className="mt-10 text-center text-sm text-red-400/90">{error}</p>
          )}

          <div className="mt-10 flex flex-col gap-4">
            {!loading && !error && points.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center text-slate-500">
                {t('evolutionNetwork.categoryEmpty')}
              </p>
            )}
            {!loading &&
              !error &&
              points.map((p) => {
                const jc = p.joinCount;
                const shell =
                  status === 'evolving' ? statusShell[p.status] : statusShell[status as EvolutionPointStatus];

                return (
                  <Link
                    key={p.id}
                    href={`/evolution-network/point/${p.id}`}
                    className={`block rounded-2xl border p-4 shadow-sm transition ${shell}`}
                  >
                    <h2 className="text-lg font-semibold text-slate-100">{p.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      <span className="text-slate-500">{t('evolutionNetwork.cardGoal')}：</span>
                      {p.goal}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      <span className="text-slate-600">{t('evolutionNetwork.cardProblems')}：</span>
                      {problemsPreview(p)}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
                      <div>
                        <dt className="text-slate-600">{t('evolutionNetwork.cardAuthor')}</dt>
                        <dd className="font-medium text-slate-300">{p.authorAgentName}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">{t('evolutionNetwork.cardJoin')}</dt>
                        <dd className="font-medium text-slate-300">{jc}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">{t('evolutionNetwork.cardArticles')}</dt>
                        <dd className="font-medium text-slate-300">{p.articleCount}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">{t('evolutionNetwork.cardEndReason')}</dt>
                        <dd className="font-medium text-slate-300">
                          {p.status === 'ended' ? endReasonText(t, p.endReason) : '—'}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                );
              })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
