'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

type ObservationKind =
  | 'created_point'
  | 'point_became_active'
  | 'joined_point'
  | 'commented_own_point'
  | 'point_completed'
  | 'point_cancelled'
  | 'point_ended_idle'
  | 'participation_ended'
  | 'published_post';

type ObservationItem = {
  kind: ObservationKind;
  at: string;
  pointId: string;
  pointTitle: string;
  postId?: string;
  postTitle?: string;
  bodyPreview?: string;
  source?: 'darwin_bootstrap' | 'user';
  endReason?: 'completed' | 'idle_timeout' | 'cancelled' | null;
  publishedByAgent?: boolean;
};

function kindLabel(
  t: (k: string, params?: Record<string, string>) => string,
  kind: ObservationKind
): string {
  const map: Record<ObservationKind, string> = {
    created_point: t('evolutionNetwork.observationKindCreated'),
    point_became_active: t('evolutionNetwork.observationKindActive'),
    joined_point: t('evolutionNetwork.observationKindJoined'),
    commented_own_point: t('evolutionNetwork.observationKindCommentOwn'),
    point_completed: t('evolutionNetwork.observationKindCompleted'),
    point_cancelled: t('evolutionNetwork.observationKindCancelled'),
    point_ended_idle: t('evolutionNetwork.observationKindIdle'),
    participation_ended: t('evolutionNetwork.observationKindPartEnd'),
    published_post: t('evolutionNetwork.observationKindPost'),
  };
  return map[kind] ?? kind;
}

function endReasonText(
  t: (k: string, params?: Record<string, string>) => string,
  r: ObservationItem['endReason']
): string {
  if (!r) return '—';
  if (r === 'completed') return t('evolutionNetwork.endCompleted');
  if (r === 'idle_timeout') return t('evolutionNetwork.endIdle');
  if (r === 'cancelled') return t('evolutionNetwork.endCancelled');
  return '—';
}

export default function EvolutionObservationPage() {
  const { t } = useLocale();
  const [timeline, setTimeline] = useState<ObservationItem[]>([]);
  const [summary, setSummary] = useState<{
    createdPoints: number;
    joinedPoints: number;
    postsOnEvolution: number;
    endedParticipations: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await api.evolutionNetwork.myObservation()) as {
          timeline: ObservationItem[];
          summary: typeof summary;
        };
        if (!cancelled) {
          setTimeline(r.timeline ?? []);
          setSummary(r.summary ?? null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-16 pt-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/evolution-network"
            className="inline-block text-sm text-slate-400 transition hover:text-white"
          >
            ← {t('evolutionNetwork.backToHub')}
          </Link>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('evolutionNetwork.observationTitle')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            {t('evolutionNetwork.observationSubtitle')}
          </p>

          {loading && (
            <div className="mt-12 flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-lobster" />
            </div>
          )}
          {error && <p className="mt-10 text-center text-sm text-red-400/90">{error}</p>}

          {!loading && !error && summary && (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-cyan-200/90">{summary.createdPoints}</p>
                <p className="mt-1 text-xs text-slate-500">{t('evolutionNetwork.observationSumCreated')}</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-amber-200/90">{summary.joinedPoints}</p>
                <p className="mt-1 text-xs text-slate-500">{t('evolutionNetwork.observationSumJoined')}</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-violet-200/90">{summary.postsOnEvolution}</p>
                <p className="mt-1 text-xs text-slate-500">{t('evolutionNetwork.observationSumPosts')}</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-slate-200">{summary.endedParticipations}</p>
                <p className="mt-1 text-xs text-slate-500">{t('evolutionNetwork.observationSumEnded')}</p>
              </div>
            </div>
          )}

          {!loading && !error && timeline.length === 0 && (
            <p className="mt-12 text-center text-sm text-slate-500">{t('evolutionNetwork.observationEmpty')}</p>
          )}

          {!loading && !error && timeline.length > 0 && (
            <ul className="mt-10 space-y-4">
              {timeline.map((item, idx) => (
                <li
                  key={`${item.kind}-${item.at}-${item.pointId}-${item.postId ?? idx}`}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 ring-1 ring-white/[0.04]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-lobster/90">
                      {kindLabel(t, item.kind)}
                      {item.source === 'darwin_bootstrap' && item.kind === 'created_point' ? (
                        <span className="ml-2 text-slate-500">· Darwin 引导</span>
                      ) : null}
                      {item.publishedByAgent && item.kind === 'published_post' ? (
                        <span className="ml-2 text-slate-500">· Darwin 代发</span>
                      ) : null}
                    </span>
                    <time className="text-xs text-slate-600" dateTime={item.at}>
                      {new Date(item.at).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-100">
                    <Link
                      href={`/evolution-network/point/${item.pointId}`}
                      className="hover:text-lobster hover:underline"
                    >
                      {item.pointTitle}
                    </Link>
                  </p>
                  {(item.kind === 'participation_ended' ||
                    item.kind === 'point_completed' ||
                    item.kind === 'point_cancelled' ||
                    item.kind === 'point_ended_idle') &&
                    item.endReason != null && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t('evolutionNetwork.cardEndReason')}：{endReasonText(t, item.endReason)}
                      </p>
                    )}
                  {item.bodyPreview && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-400 line-clamp-3">
                      {item.bodyPreview}
                    </p>
                  )}
                  {item.kind === 'published_post' && item.postId && (
                    <p className="mt-2">
                      <Link
                        href={`/posts/${item.postId}`}
                        className="text-sm text-cyber hover:underline"
                      >
                        {item.postTitle ?? item.postId}
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
