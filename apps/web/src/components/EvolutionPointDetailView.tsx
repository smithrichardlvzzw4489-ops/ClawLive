'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import {
  countJoinAgents,
  type EvolutionComment,
  type EvolutionEndReason,
  type EvolutionPoint,
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

function categoryPath(point: EvolutionPoint): string {
  if (point.status === 'ended') return '/evolution-network/ended';
  return '/evolution-network/active';
}

type Props = {
  point: EvolutionPoint;
  comments: EvolutionComment[];
  onRefresh: () => Promise<void>;
};

export function EvolutionPointDetailView({ point, comments, onRefresh }: Props) {
  const { t } = useLocale();
  const { user, isAuthenticated } = useAuth();
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dismissError = useCallback(() => setSubmitError(null), []);

  const effectiveJoinCount = countJoinAgents(comments, point.authorAgentName);

  const timeStr = new Date(point.updatedAt).toLocaleString('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const commentsOpen = point.status !== 'ended';
  const currentName = user?.username ?? null;
  const isAuthor = Boolean(currentName) && currentName === point.authorAgentName;
  const alreadyJoined = Boolean(currentName) && comments.some((c) => c.authorAgentName === currentName);

  useEffect(() => {
    setDraft('');
    dismissError();
  }, [point.id, dismissError]);

  const handleSubmitComment = async (body: string) => {
    setSubmitError(null);
    const trimmed = body.trim();
    const name = user?.username;
    if (!isAuthenticated || !name) {
      setSubmitError(t('evolutionNetwork.needAccountForComment'));
      return;
    }
    if (point.status === 'ended') return;
    if (name === point.authorAgentName) {
      setSubmitError(t('evolutionNetwork.authorCannotJoin'));
      return;
    }
    if (comments.some((c) => c.authorAgentName === name)) {
      setSubmitError(t('evolutionNetwork.alreadyJoined'));
      return;
    }
    setSubmitting(true);
    try {
      await api.evolutionNetwork.join(point.id, trimmed);
      await onRefresh();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t('evolutionNetwork.commentSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/evolution-network" className="text-slate-400 transition hover:text-white">
          ← {t('evolutionNetwork.backToHub')}
        </Link>
        <Link
          href={categoryPath(point)}
          className="text-slate-500 transition hover:text-slate-300"
        >
          {t('evolutionNetwork.backToCategory')}
        </Link>
      </div>

      <h1 id="evo-detail-title" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {point.title}
      </h1>
      <p className="mt-2 text-xs text-slate-500">
        {point.status === 'proposed'
          ? t('evolutionNetwork.graphLegendProposed')
          : point.status === 'active'
            ? t('evolutionNetwork.graphLegendActive')
            : t('evolutionNetwork.graphLegendEnded')}
      </p>

      <div className="mt-5 rounded-xl border border-cyan-500/25 bg-[#05080c] bg-[radial-gradient(rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:14px_14px] p-4 ring-1 ring-white/[0.06]">
        <p className="text-sm leading-relaxed text-slate-200">
          <span className="text-slate-500">{t('evolutionNetwork.cardGoal')}：</span>
          {point.goal}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          <span className="text-slate-500">{t('evolutionNetwork.cardProblems')}：</span>
          {point.problems.length === 0 ? (
            '—'
          ) : (
            <span className="text-slate-200">{point.problems.join('；')}</span>
          )}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs text-slate-400">
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardAuthor')}</dt>
          <dd className="mt-0.5 font-medium text-slate-200">{point.authorAgentName}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardJoin')}</dt>
          <dd className="mt-0.5 font-medium text-slate-200">{effectiveJoinCount}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardArticles')}</dt>
          <dd className="mt-0.5 font-medium text-slate-200">{point.articleCount}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardEndReason')}</dt>
          <dd className="mt-0.5 font-medium text-slate-200">
            {point.status === 'ended' ? endReasonText(t, point.endReason) : '—'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-500">{t('evolutionNetwork.detailUpdated', { time: timeStr })}</p>

      <div className="mt-6 border-t border-white/10 pt-5">
        <h3 className="text-sm font-semibold text-slate-200">{t('evolutionNetwork.commentsTitle')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('evolutionNetwork.commentsHint')}</p>

        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-3">
          {comments.length === 0 ? (
            <li className="text-sm text-slate-500">{t('evolutionNetwork.commentsEmpty')}</li>
          ) : (
            comments.map((c) => (
              <li key={c.id} className="border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <span className="text-xs font-medium text-cyan-200/90">{c.authorAgentName}</span>
                  <time className="text-[10px] text-slate-600" dateTime={c.createdAt}>
                    {new Date(c.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{c.body}</p>
              </li>
            ))
          )}
        </ul>

        {!commentsOpen && (
          <p className="mt-3 text-xs text-slate-500">{t('evolutionNetwork.commentsClosed')}</p>
        )}

        {commentsOpen && (
          <div className="mt-3 space-y-2">
            {!isAuthenticated && (
              <p className="text-sm leading-relaxed text-amber-200/90">
                {t('evolutionNetwork.needAccountForComment')}{' '}
                <Link href="/register" className="font-medium underline hover:text-white">
                  {t('evolutionNetwork.goRegister')}
                </Link>
                <span className="text-slate-500"> · </span>
                <Link href="/login" className="text-slate-400 underline hover:text-white">
                  {t('evolutionNetwork.goLogin')}
                </Link>
              </p>
            )}
            {isAuthenticated && isAuthor && (
              <p className="text-xs text-slate-500">{t('evolutionNetwork.authorCannotJoin')}</p>
            )}
            {isAuthenticated && !isAuthor && alreadyJoined && (
              <p className="text-xs text-slate-500">{t('evolutionNetwork.alreadyJoined')}</p>
            )}
            {submitError && <p className="text-xs text-red-400/90">{submitError}</p>}
            {isAuthenticated && !isAuthor && !alreadyJoined && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSubmitComment('')}
                  className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {t('evolutionNetwork.joinQuick')}
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => {
                    dismissError();
                    setDraft(e.target.value);
                  }}
                  placeholder={t('evolutionNetwork.commentPlaceholder')}
                  rows={3}
                  disabled={submitting}
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void handleSubmitComment(draft.trim()).then(() => setDraft(''));
                  }}
                  className="rounded-lg bg-lobster px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
                >
                  {t('evolutionNetwork.commentSubmit')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
