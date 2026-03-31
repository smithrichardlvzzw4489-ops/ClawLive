'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

type EvolverRoundRow = {
  id: string;
  roundNo: number;
  status: string;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

type EvolverEventRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  payload: unknown;
  createdAt: string;
};

export default function DarwinEvolverBoardPage() {
  const { t } = useLocale();
  const [rounds, setRounds] = useState<EvolverRoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<EvolverEventRow[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const loadRounds = useCallback(async () => {
    setError(null);
    try {
      const r = (await api.evolver.rounds(40)) as { rounds: EvolverRoundRow[] };
      setRounds(r.rounds ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
      setRounds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRounds();
  }, [loadRounds]);

  const openRound = async (id: string) => {
    setSelectedId(id);
    setEventsLoading(true);
    setEvents(null);
    try {
      const r = (await api.evolver.roundEvents(id)) as { events: EvolverEventRow[] };
      setEvents(r.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleRun = async () => {
    setRunMsg(null);
    setRunning(true);
    try {
      await api.evolver.run();
      setRunMsg(t('evolutionNetwork.evolverRunOk'));
      await loadRounds();
      if (selectedId) await openRound(selectedId);
    } catch (e: unknown) {
      setRunMsg(e instanceof Error ? e.message : t('evolutionNetwork.evolverRunFail'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl px-3 pb-16 pt-6 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/evolution-network" className="text-sm text-slate-400 hover:text-white">
            ← {t('evolutionNetwork.backToHub')}
          </Link>
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRun()}
            className="rounded-lg bg-cyan-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {running ? t('evolutionNetwork.evolverRunning') : t('evolutionNetwork.evolverRunNow')}
          </button>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t('evolutionNetwork.evolverBoardTitle')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          {t('evolutionNetwork.evolverBoardBlurb')}
        </p>
        {runMsg && <p className="mt-3 text-sm text-amber-200/90">{runMsg}</p>}

        {loading && <p className="mt-10 text-center text-slate-500">{t('evolutionNetwork.evolverLoading')}</p>}
        {error && !loading && <p className="mt-6 text-center text-red-400/90">{error}</p>}

        {!loading && !error && rounds.length === 0 && (
          <p className="mt-10 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center text-slate-500">
            {t('evolutionNetwork.evolverEmpty')}
          </p>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('evolutionNetwork.evolverRounds')}
            </h2>
            <ul className="space-y-2">
              {rounds.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openRound(r.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedId === r.id
                        ? 'border-cyan-500/50 bg-cyan-950/30'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">
                        {t('evolutionNetwork.evolverRoundLabel', { n: String(r.roundNo) })}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          r.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : r.status === 'failed'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {r.summary || r.error || '—'}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {new Date(r.startedAt).toLocaleString('zh-CN')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-h-[280px] rounded-xl border border-white/[0.06] bg-[#070a0f] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('evolutionNetwork.evolverTimeline')}
            </h2>
            {!selectedId && (
              <p className="mt-8 text-center text-sm text-slate-600">{t('evolutionNetwork.evolverPickRound')}</p>
            )}
            {selectedId && eventsLoading && (
              <p className="mt-8 text-center text-sm text-slate-500">{t('evolutionNetwork.evolverLoading')}</p>
            )}
            {selectedId && !eventsLoading && events && (
              <ol className="mt-4 max-h-[min(60vh,520px)] space-y-3 overflow-y-auto pr-1">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span className="text-[10px] font-mono uppercase text-cyan-500/80">{ev.kind}</span>
                      <time className="text-[10px] text-slate-600" dateTime={ev.createdAt}>
                        {new Date(ev.createdAt).toLocaleTimeString('zh-CN')}
                      </time>
                    </div>
                    <p className="mt-0.5 font-medium text-slate-200">{ev.title}</p>
                    {ev.detail && (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{ev.detail}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
