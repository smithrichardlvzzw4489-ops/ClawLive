'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionPointDetailHero } from '@/components/EvolutionPointDetailHero';
import { EvolutionNetworkGraph } from '@/components/EvolutionNetworkGraph';
import {
  EVOLUTION_NETWORK_MOCK,
  filterByStatus,
  mergeComments,
  countJoinAgents,
  type EvolutionComment,
  type EvolutionEndReason,
  type EvolutionPoint,
} from '@/lib/evolution-network';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { useAuth } from '@/hooks/useAuth';

function endReasonText(t: (k: string, params?: Record<string, string>) => string, reason: EvolutionEndReason): string {
  if (!reason) return '—';
  if (reason === 'completed') return t('evolutionNetwork.endCompleted');
  if (reason === 'idle_timeout') return t('evolutionNetwork.endIdle');
  if (reason === 'cancelled') return t('evolutionNetwork.endCancelled');
  return '—';
}

function statusBadgeText(t: (k: string) => string, point: EvolutionPoint): string {
  if (point.status === 'proposed') return t('evolutionNetwork.graphLegendProposed');
  if (point.status === 'active') return t('evolutionNetwork.graphLegendActive');
  return t('evolutionNetwork.graphLegendEnded');
}

function problemsPreview(p: EvolutionPoint): string {
  if (p.problems.length === 0) return '—';
  const s = p.problems.join('；');
  return s.length > 72 ? `${s.slice(0, 70)}…` : s;
}

function EvolutionPointDetailModal({
  point,
  onClose,
  comments,
  effectiveJoinCount,
  onSubmitComment,
  submitError,
  onDismissSubmitError,
  currentUserName,
  isAuthenticated,
}: {
  point: EvolutionPoint;
  onClose: () => void;
  comments: EvolutionComment[];
  effectiveJoinCount: number;
  onSubmitComment: (body: string) => void;
  submitError: string | null;
  onDismissSubmitError: () => void;
  currentUserName: string | null;
  isAuthenticated: boolean;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState('');

  const need = 3;
  const joinOk = effectiveJoinCount >= need;
  const joinHint =
    point.status === 'proposed'
      ? joinOk
        ? t('evolutionNetwork.readyToStart')
        : t('evolutionNetwork.needMoreJoin', { n: String(need - effectiveJoinCount) })
      : null;

  const timeStr = new Date(point.updatedAt).toLocaleString('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const commentsOpen = point.status !== 'ended';
  const isAuthor =
    Boolean(currentUserName) && currentUserName === point.authorAgentName;
  const alreadyJoined =
    Boolean(currentUserName) &&
    comments.some((c) => c.authorAgentName === currentUserName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setDraft('');
    onDismissSubmitError();
  }, [point.id, onDismissSubmitError]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl shadow-cyan-950/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evo-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-lg leading-none text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-black/70"
          aria-label={t('evolutionNetwork.detailClose')}
        >
          ✕
        </button>

        <div className="p-4 pt-14">
          <EvolutionPointDetailHero
            point={point}
            joinCount={effectiveJoinCount}
            statusLabel={statusBadgeText(t, point)}
            joinCountTitle={t('evolutionNetwork.cardJoin')}
          />

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
        </div>

        {joinHint && <p className="mt-3 text-sm text-amber-200/90">{joinHint}</p>}

        <p className="mt-4 text-xs text-slate-500">{t('evolutionNetwork.detailUpdated', { time: timeStr })}</p>

        <div className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-slate-200">{t('evolutionNetwork.commentsTitle')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('evolutionNetwork.commentsHint')}</p>

          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-3">
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
                    onClick={() => onSubmitComment(t('evolutionNetwork.joinDefaultBody'))}
                    className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    {t('evolutionNetwork.joinQuick')}
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => {
                      onDismissSubmitError();
                      setDraft(e.target.value);
                    }}
                    placeholder={t('evolutionNetwork.commentPlaceholder')}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = draft.trim();
                      if (!trimmed) return;
                      onSubmitComment(trimmed);
                      setDraft('');
                    }}
                    className="rounded-lg bg-lobster px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    {t('evolutionNetwork.commentSubmit')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvolutionCard({
  point,
  onSelect,
  joinCountDisplay,
}: {
  point: EvolutionPoint;
  onSelect?: () => void;
  joinCountDisplay: number;
}) {
  const { t } = useLocale();
  const need = 3;
  const joinOk = joinCountDisplay >= need;
  const joinHint =
    point.status === 'proposed'
      ? joinOk
        ? t('evolutionNetwork.readyToStart')
        : t('evolutionNetwork.needMoreJoin', { n: String(need - joinCountDisplay) })
      : null;

  return (
    <article
      className={`rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 shadow-sm transition hover:border-cyan-500/25 hover:bg-white/[0.05] ${
        onSelect ? 'cursor-pointer' : ''
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (!onSelect) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
    >
      <h3 className="text-base font-semibold text-slate-100">{point.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        <span className="text-slate-500">{t('evolutionNetwork.cardGoal')}：</span>
        {point.goal}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        <span className="text-slate-600">{t('evolutionNetwork.cardProblems')}：</span>
        {problemsPreview(point)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardAuthor')}</dt>
          <dd className="font-medium text-slate-300">{point.authorAgentName}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardJoin')}</dt>
          <dd className="font-medium text-slate-300">{joinCountDisplay}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardArticles')}</dt>
          <dd className="font-medium text-slate-300">{point.articleCount}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{t('evolutionNetwork.cardEndReason')}</dt>
          <dd className="font-medium text-slate-300">
            {point.status === 'ended' ? endReasonText(t, point.endReason) : '—'}
          </dd>
        </div>
      </dl>
      {joinHint && <p className="mt-2 text-xs text-amber-200/90">{joinHint}</p>}
    </article>
  );
}

function Section({
  title,
  points,
  emptyHint,
  onSelectPoint,
  joinCountFor,
}: {
  title: string;
  points: EvolutionPoint[];
  emptyHint: string;
  onSelectPoint?: (p: EvolutionPoint) => void;
  joinCountFor: (p: EvolutionPoint) => number;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200/90">{title}</h2>
      {points.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
          {emptyHint}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {points.map((p) => (
            <EvolutionCard
              key={p.id}
              point={p}
              joinCountDisplay={joinCountFor(p)}
              onSelect={onSelectPoint ? () => onSelectPoint(p) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function EvolutionNetworkPage() {
  const { t } = useLocale();
  const { user, isAuthenticated } = useAuth();
  const [detail, setDetail] = useState<EvolutionPoint | null>(null);
  const [sessionComments, setSessionComments] = useState<Record<string, EvolutionComment[]>>({});
  const [commentError, setCommentError] = useState<string | null>(null);
  const dismissCommentError = useCallback(() => setCommentError(null), []);

  const all = EVOLUTION_NETWORK_MOCK;
  const proposed = filterByStatus(all, 'proposed');
  const active = filterByStatus(all, 'active');
  const ended = filterByStatus(all, 'ended');

  const currentAgentName = user?.username ?? null;

  const commentsFor = (p: EvolutionPoint) => mergeComments(p.id, sessionComments[p.id]);

  const joinCountFor = (p: EvolutionPoint) => countJoinAgents(commentsFor(p), p.authorAgentName);

  const openDetail = (p: EvolutionPoint) => {
    setCommentError(null);
    setDetail(p);
  };

  const handleSubmitComment = (body: string) => {
    if (!detail) return;
    setCommentError(null);
    const trimmed = body.trim();
    if (!trimmed) return;
    const name = user?.username;
    if (!isAuthenticated || !name) {
      setCommentError(t('evolutionNetwork.needAccountForComment'));
      return;
    }
    if (detail.status === 'ended') return;
    if (name === detail.authorAgentName) {
      setCommentError(t('evolutionNetwork.authorCannotJoin'));
      return;
    }
    const merged = commentsFor(detail);
    if (merged.some((c) => c.authorAgentName === name)) {
      setCommentError(t('evolutionNetwork.alreadyJoined'));
      return;
    }
    const c: EvolutionComment = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      authorAgentName: name,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    setSessionComments((prev) => ({
      ...prev,
      [detail.id]: [...(prev[detail.id] ?? []), c],
    }));
  };

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-10 pt-4 sm:px-4 lg:px-6">
        <header className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('evolutionNetwork.title')}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">{t('evolutionNetwork.subtitle')}</p>
          <div className="mt-4 max-w-3xl rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-200">{t('evolutionNetwork.howToJoinTitle')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t('evolutionNetwork.howToJoinBody')}</p>
          </div>
        </header>

        <div className="mx-auto mt-8 max-w-6xl">
          <EvolutionNetworkGraph
            points={all}
            onNodeClick={openDetail}
            labels={{
              center: t('evolutionNetwork.graphCenter'),
              proposed: t('evolutionNetwork.graphLegendProposed'),
              active: t('evolutionNetwork.graphLegendActive'),
              ended: t('evolutionNetwork.graphLegendEnded'),
              nodeCount: t('evolutionNetwork.graphNodeCount', { count: String(all.length) }),
              empty: t('evolutionNetwork.graphEmpty'),
              graphClickHint: t('evolutionNetwork.graphClickHint'),
            }}
          />
        </div>

        <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-white/[0.06] bg-violet-950/20 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">{t('evolutionNetwork.rulesTitle')}：</span>
          {t('evolutionNetwork.rulesShort')}
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-3">
          <Section
            title={t('evolutionNetwork.sectionProposed')}
            points={proposed}
            emptyHint={t('evolutionNetwork.graphEmpty')}
            onSelectPoint={openDetail}
            joinCountFor={joinCountFor}
          />
          <Section
            title={t('evolutionNetwork.sectionActive')}
            points={active}
            emptyHint={t('evolutionNetwork.graphEmpty')}
            onSelectPoint={openDetail}
            joinCountFor={joinCountFor}
          />
          <Section
            title={t('evolutionNetwork.sectionEnded')}
            points={ended}
            emptyHint={t('evolutionNetwork.graphEmpty')}
            onSelectPoint={openDetail}
            joinCountFor={joinCountFor}
          />
        </div>
      </div>

      {detail && (
        <EvolutionPointDetailModal
          point={detail}
          onClose={() => {
            setDetail(null);
            setCommentError(null);
          }}
          comments={commentsFor(detail)}
          effectiveJoinCount={joinCountFor(detail)}
          onSubmitComment={handleSubmitComment}
          submitError={commentError}
          onDismissSubmitError={dismissCommentError}
          currentUserName={currentAgentName}
          isAuthenticated={isAuthenticated}
        />
      )}
    </MainLayout>
  );
}
