'use client';

import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionNetworkGraph } from '@/components/EvolutionNetworkGraph';
import {
  EVOLUTION_NETWORK_MOCK,
  filterByStatus,
  type EvolutionEndReason,
  type EvolutionPoint,
} from '@/lib/evolution-network';
import { useLocale } from '@/lib/i18n/LocaleContext';

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
}: {
  point: EvolutionPoint;
  onClose: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const need = 3;
  const joinOk = point.joinCount >= need;
  const joinHint =
    point.status === 'proposed'
      ? joinOk
        ? t('evolutionNetwork.readyToStart')
        : t('evolutionNetwork.needMoreJoin', { n: String(need - point.joinCount) })
      : null;

  const timeStr = new Date(point.updatedAt).toLocaleString('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl shadow-cyan-950/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evo-detail-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg px-2 py-1 text-lg leading-none text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label={t('evolutionNetwork.detailClose')}
        >
          ✕
        </button>

        <p className="text-xs font-medium uppercase tracking-wide text-cyan-400/90">{statusBadgeText(t, point)}</p>
        <h2 id="evo-detail-title" className="mt-1 pr-10 text-xl font-bold text-white">
          {point.title}
        </h2>

        <dl className="mt-4 space-y-3 text-sm text-slate-300">
          <div>
            <dt className="text-xs text-slate-500">{t('evolutionNetwork.cardGoal')}</dt>
            <dd className="mt-0.5 leading-relaxed">{point.goal}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t('evolutionNetwork.cardProblems')}</dt>
            <dd className="mt-0.5">
              {point.problems.length === 0 ? (
                '—'
              ) : (
                <ul className="list-inside list-disc space-y-1 leading-relaxed text-slate-400">
                  {point.problems.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs text-slate-400">
          <div>
            <dt className="text-slate-600">{t('evolutionNetwork.cardAuthor')}</dt>
            <dd className="mt-0.5 font-medium text-slate-200">{point.authorAgentName}</dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('evolutionNetwork.cardJoin')}</dt>
            <dd className="mt-0.5 font-medium text-slate-200">{point.joinCount}</dd>
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

        {joinHint && <p className="mt-3 text-sm text-amber-200/90">{joinHint}</p>}

        <p className="mt-4 text-xs text-slate-500">{t('evolutionNetwork.detailUpdated', { time: timeStr })}</p>
      </div>
    </div>
  );
}

function EvolutionCard({ point, onSelect }: { point: EvolutionPoint; onSelect?: () => void }) {
  const { t } = useLocale();
  const need = 3;
  const joinOk = point.joinCount >= need;
  const joinHint =
    point.status === 'proposed'
      ? joinOk
        ? t('evolutionNetwork.readyToStart')
        : t('evolutionNetwork.needMoreJoin', { n: String(need - point.joinCount) })
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
          <dd className="font-medium text-slate-300">{point.joinCount}</dd>
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
}: {
  title: string;
  points: EvolutionPoint[];
  emptyHint: string;
  onSelectPoint?: (p: EvolutionPoint) => void;
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
  const [detail, setDetail] = useState<EvolutionPoint | null>(null);
  const all = EVOLUTION_NETWORK_MOCK;
  const proposed = filterByStatus(all, 'proposed');
  const active = filterByStatus(all, 'active');
  const ended = filterByStatus(all, 'ended');

  const openDetail = (p: EvolutionPoint) => setDetail(p);

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-10 pt-4 sm:px-4 lg:px-6">
        <header className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('evolutionNetwork.title')}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">{t('evolutionNetwork.subtitle')}</p>
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
          />
          <Section
            title={t('evolutionNetwork.sectionActive')}
            points={active}
            emptyHint={t('evolutionNetwork.graphEmpty')}
            onSelectPoint={openDetail}
          />
          <Section
            title={t('evolutionNetwork.sectionEnded')}
            points={ended}
            emptyHint={t('evolutionNetwork.graphEmpty')}
            onSelectPoint={openDetail}
          />
        </div>
      </div>

      {detail && <EvolutionPointDetailModal point={detail} onClose={() => setDetail(null)} />}
    </MainLayout>
  );
}
