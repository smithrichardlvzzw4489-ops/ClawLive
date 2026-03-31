'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, APIError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { EvolutionPoint } from '@/lib/evolution-network';

type SkillRow = { id: string; title: string; skillMarkdown: string };

function initRows(p: EvolutionPoint): SkillRow[] {
  const ls = p.linkedSkills;
  if (ls?.length) {
    return ls.map((s) => ({ id: s.id, title: s.title, skillMarkdown: s.skillMarkdown }));
  }
  return [{ id: '', title: '', skillMarkdown: '' }];
}

function emptyRow(): SkillRow {
  return { id: '', title: '', skillMarkdown: '' };
}

type Props = {
  point: EvolutionPoint;
  onRefresh: () => Promise<void>;
};

export function EvolutionPointAuthorPanel({ point, onRefresh }: Props) {
  const { t } = useLocale();
  const [rows, setRows] = useState<SkillRow[]>(() => initRows(point));
  const [saveBusy, setSaveBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setRows(initRows(point));
  }, [point.id, point.updatedAt]);

  const dismissMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const hasLinkedOnServer = (point.linkedSkills?.length ?? 0) > 0;
  const acc = point.acceptance;
  const status = acc?.status ?? 'none';

  const canComplete =
    !hasLinkedOnServer || status === 'passed';

  const statusLabel = (() => {
    if (!hasLinkedOnServer) return t('evolutionNetwork.acceptanceStatusNone');
    if (status === 'passed') return t('evolutionNetwork.acceptanceStatusPassed');
    if (status === 'failed') return t('evolutionNetwork.acceptanceStatusFailed');
    return t('evolutionNetwork.acceptanceStatusPending');
  })();

  const handleSaveLinked = async () => {
    dismissMessages();
    const skills = rows
      .filter((r) => r.skillMarkdown.trim().length > 0)
      .map((r) => ({
        id: r.id.trim() || undefined,
        title: r.title.trim() || 'Skill',
        skillMarkdown: r.skillMarkdown,
      }));
    setSaveBusy(true);
    try {
      await api.evolutionNetwork.setLinkedSkills(point.id, skills);
      await onRefresh();
      setSuccess(t('evolutionNetwork.linkedSkillsSavedOk'));
    } catch (e: unknown) {
      setError(e instanceof APIError ? e.message : e instanceof Error ? e.message : 'Error');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleGenerate = async () => {
    dismissMessages();
    setGenBusy(true);
    try {
      await api.evolutionNetwork.generateAcceptance(point.id);
      await onRefresh();
      setSuccess(t('evolutionNetwork.generateCases'));
    } catch (e: unknown) {
      setError(e instanceof APIError ? e.message : e instanceof Error ? e.message : 'Error');
    } finally {
      setGenBusy(false);
    }
  };

  const handleRun = async () => {
    dismissMessages();
    setRunBusy(true);
    try {
      await api.evolutionNetwork.runAcceptance(point.id);
      await onRefresh();
      setSuccess(t('evolutionNetwork.runAcceptanceOk'));
    } catch (e: unknown) {
      setError(e instanceof APIError ? e.message : e instanceof Error ? e.message : 'Error');
    } finally {
      setRunBusy(false);
    }
  };

  const handleComplete = async () => {
    dismissMessages();
    if (!canComplete) return;
    setCompleteBusy(true);
    try {
      const r = await api.evolutionNetwork.complete(point.id);
      const n = typeof r.installedSkills === 'number' ? r.installedSkills : 0;
      await onRefresh();
      if (n > 0) {
        setSuccess(t('evolutionNetwork.installedSkillsToast', { n: String(n) }));
      } else {
        setSuccess(t('evolutionNetwork.completeOk'));
      }
    } catch (e: unknown) {
      setError(e instanceof APIError ? e.message : e instanceof Error ? e.message : 'Error');
    } finally {
      setCompleteBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(t('evolutionNetwork.confirmCancelPoint'))) return;
    dismissMessages();
    setCancelBusy(true);
    try {
      await api.evolutionNetwork.cancel(point.id);
      await onRefresh();
    } catch (e: unknown) {
      setError(e instanceof APIError ? e.message : e instanceof Error ? e.message : 'Error');
    } finally {
      setCancelBusy(false);
    }
  };

  if (point.status !== 'active') {
    return null;
  }

  return (
    <section className="mt-6 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 ring-1 ring-white/[0.06]">
      <h2 className="text-sm font-semibold text-amber-100/95">{t('evolutionNetwork.authorPanelTitle')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('evolutionNetwork.authorPanelBlurb')}</p>

      {error && <p className="mt-3 text-xs text-red-400/95">{error}</p>}
      {success && <p className="mt-3 text-xs text-emerald-400/95">{success}</p>}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t('evolutionNetwork.linkedSkillsTitle')}
      </h3>
      <div className="mt-2 space-y-4">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-white/[0.08] bg-black/25 p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px] text-slate-500">
                {t('evolutionNetwork.skillTitleLabel')}
                <input
                  value={row.title}
                  onChange={(e) => {
                    dismissMessages();
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)));
                  }}
                  className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-slate-200"
                />
              </label>
              <label className="block text-[11px] text-slate-500">
                {t('evolutionNetwork.skillIdOptional')}
                <input
                  value={row.id}
                  onChange={(e) => {
                    dismissMessages();
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, id: e.target.value } : r)));
                  }}
                  className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-slate-200"
                />
              </label>
            </div>
            <label className="mt-2 block text-[11px] text-slate-500">
              {t('evolutionNetwork.skillMarkdownLabel')}
              <textarea
                value={row.skillMarkdown}
                onChange={(e) => {
                  dismissMessages();
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, skillMarkdown: e.target.value } : r)));
                }}
                rows={6}
                className="mt-1 w-full resize-y rounded border border-white/10 bg-black/40 px-2 py-2 font-mono text-xs leading-relaxed text-slate-200"
              />
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  dismissMessages();
                  setRows((prev) => prev.filter((_, i) => i !== idx));
                }}
                className="mt-2 text-xs text-slate-500 underline hover:text-slate-300"
              >
                {t('evolutionNetwork.removeSkill')}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            dismissMessages();
            setRows((prev) => [...prev, emptyRow()]);
          }}
          className="text-xs text-cyan-400/90 hover:text-cyan-300"
        >
          + {t('evolutionNetwork.addSkill')}
        </button>
        <button
          type="button"
          disabled={saveBusy}
          onClick={() => void handleSaveLinked()}
          className="ml-3 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {saveBusy ? t('evolutionNetwork.savingLinkedSkills') : t('evolutionNetwork.saveLinkedSkills')}
        </button>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('evolutionNetwork.acceptanceTitle')}
        </h3>
        <p className="mt-2 text-xs text-slate-400">
          <span className="text-slate-500">{t('evolutionNetwork.acceptanceStatusLabel')}：</span>
          {statusLabel}
          {acc?.lastRunAt && (
            <span className="ml-2 text-slate-600">
              ({new Date(acc.lastRunAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })})
            </span>
          )}
        </p>

        {acc?.cases && acc.cases.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li className="text-slate-500">{t('evolutionNetwork.acceptanceCases')}</li>
            {acc.cases.map((c) => (
              <li key={c.id} className="pl-2">
                <span className="text-slate-300">{c.name}</span>
                <span className="text-slate-600"> · {c.skillId}</span>
              </li>
            ))}
          </ul>
        )}

        {acc?.lastResults && acc.lastResults.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded border border-white/[0.06] bg-black/20">
            <table className="w-full min-w-[280px] text-left text-[11px] text-slate-400">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500">
                  <th className="px-2 py-1.5 font-medium">{t('evolutionNetwork.acceptanceResults')}</th>
                  <th className="px-2 py-1.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {acc.lastResults.map((r) => (
                  <tr key={r.caseId} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-2 py-1.5 font-mono text-slate-300">{r.caseId}</td>
                    <td className="px-2 py-1.5">
                      {r.ok ? (
                        <span className="text-emerald-400/90">{t('evolutionNetwork.resultOk')}</span>
                      ) : (
                        <span className="text-red-400/90">{t('evolutionNetwork.resultFail')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {acc.lastResults.some((r) => !r.ok && r.stderr) && (
              <div className="border-t border-white/[0.06] px-2 py-2 text-[10px] text-slate-500">
                {acc.lastResults
                  .filter((r) => !r.ok && r.stderr)
                  .map((r) => (
                    <pre key={r.caseId} className="mt-1 whitespace-pre-wrap font-mono text-red-300/80">
                      {r.stderr}
                    </pre>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={genBusy || !hasLinkedOnServer}
            title={!hasLinkedOnServer ? t('evolutionNetwork.saveLinkedSkills') : undefined}
            onClick={() => void handleGenerate()}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            {genBusy ? t('evolutionNetwork.generatingCases') : t('evolutionNetwork.generateCases')}
          </button>
          <button
            type="button"
            disabled={runBusy || !hasLinkedOnServer}
            onClick={() => void handleRun()}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            {runBusy ? t('evolutionNetwork.runningAcceptance') : t('evolutionNetwork.runAcceptance')}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          disabled={completeBusy || !canComplete}
          onClick={() => void handleComplete()}
          className="rounded-lg bg-lobster px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-40"
        >
          {completeBusy ? t('evolutionNetwork.completing') : t('evolutionNetwork.completePoint')}
        </button>
        {!canComplete && hasLinkedOnServer && (
          <p className="self-center text-xs text-amber-200/80">{t('evolutionNetwork.completePointDisabledHint')}</p>
        )}
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => void handleCancel()}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-400 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
        >
          {cancelBusy ? t('evolutionNetwork.cancelling') : t('evolutionNetwork.cancelPoint')}
        </button>
      </div>
    </section>
  );
}
