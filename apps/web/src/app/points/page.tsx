'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { api, APIError } from '@/lib/api';

type LlmInfo = {
  clawPoints: number;
  pointsPerUsd: number;
  minRedeemPoints: number;
  litellmConfigured: boolean;
  litellmProxyBaseUrl: string | null;
  litellmModels: string[];
  virtualKeyMasked: string | null;
  hasVirtualKey: boolean;
};

type SpendLog = {
  request_id?: string;
  model?: string;
  spend?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  startTime?: string;
};

type RedeemRecord = {
  createdAt: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  usd: number | null;
};

type KeyStats = {
  maxBudgetUsd: number | null;
  spendUsd: number;
  remainingUsd: number | null;
  usageLogs: SpendLog[];
};

type KeyStatsResponse = {
  keyStats: KeyStats | null;
  redeemHistory: RedeemRecord[];
};

const PRESET_MODELS = [
  { label: '── Anthropic ──', value: '', disabled: true },
  { label: 'Claude 3.5 Sonnet', value: 'openrouter/anthropic/claude-3-5-sonnet' },
  { label: 'Claude 3.5 Haiku', value: 'openrouter/anthropic/claude-3-5-haiku' },
  { label: 'Claude Opus 4', value: 'openrouter/anthropic/claude-opus-4' },
  { label: '── Google ──', value: '', disabled: true },
  { label: 'Gemini 2.0 Flash', value: 'openrouter/google/gemini-2.0-flash' },
  { label: 'Gemini 2.5 Pro', value: 'openrouter/google/gemini-2.5-pro' },
  { label: '── OpenAI ──', value: '', disabled: true },
  { label: 'GPT-4o', value: 'openrouter/openai/gpt-4o' },
  { label: 'GPT-4o Mini', value: 'openrouter/openai/gpt-4o-mini' },
  { label: '── DeepSeek ──', value: '', disabled: true },
  { label: 'DeepSeek R1', value: 'openrouter/deepseek/deepseek-r1' },
  { label: 'DeepSeek Chat V3', value: 'openrouter/deepseek/deepseek-chat-v3-0324' },
  { label: '── 自定义 ──', value: '__custom__' },
];

function fmtUsd(v: number) {
  return `$${v.toFixed(4)}`;
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return s;
  }
}

export default function PointsPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();
  const [info, setInfo] = useState<LlmInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pointsInput, setPointsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const [testMessage, setTestMessage] = useState('');
  const [testModelSelect, setTestModelSelect] = useState('');
  const [testModelCustom, setTestModelCustom] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ reply: string; model: string; mode: string } | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const [keyStats, setKeyStats] = useState<KeyStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTab, setStatsTab] = useState<'usage' | 'redeem'>('usage');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadError(null);
    try {
      const data = (await api.points.llm()) as LlmInfo;
      setInfo(data);
    } catch (e) {
      setLoadError(e instanceof APIError ? e.message : '加载失败');
    }
  }, [isAuthenticated]);

  const loadStats = useCallback(async () => {
    if (!isAuthenticated) return;
    setStatsLoading(true);
    try {
      const data = (await api.points.keyStats()) as KeyStatsResponse;
      setKeyStats(data);
    } catch {
      setKeyStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void load();
    }
  }, [authLoading, isAuthenticated, load]);

  useEffect(() => {
    if (info?.hasVirtualKey) {
      void loadStats();
      void api.points.fixKeyModels().catch(() => {});
    }
  }, [info?.hasVirtualKey, loadStats]);

  const onRedeem = async () => {
    const n = parseInt(pointsInput, 10);
    if (!Number.isFinite(n) || n < (info?.minRedeemPoints ?? 1)) {
      setActionError(t('points.invalidAmount'));
      return;
    }
    setActionError(null);
    setSubmitting(true);
    try {
      await api.points.redeemLlm(n);
      setPointsInput('');
      setRevealedKey(null);
      await load();
      void loadStats();
    } catch (e) {
      if (e instanceof APIError) {
        if (e.status === 400 && e.message.includes('INSUFFICIENT')) {
          setActionError(t('points.insufficient'));
        } else if (e.status === 503) {
          setActionError(t('points.notConfigured'));
        } else {
          setActionError(e.message);
        }
      } else {
        setActionError(t('points.redeemFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setActionError(t('points.copyFailed'));
    }
  };

  const effectiveTestModel =
    testModelSelect === '__custom__' ? testModelCustom.trim() : testModelSelect;

  const runLlmTest = async (useVirtualKey: boolean) => {
    if (!info?.litellmConfigured) return;
    setTestErr(null);
    setTestResult(null);
    setTesting(true);
    try {
      const msg = testMessage.trim();
      const mdl = effectiveTestModel;
      const data = (await api.points.testLlm({
        useVirtualKey,
        ...(msg ? { message: msg } : {}),
        ...(mdl ? { model: mdl } : {}),
      })) as { ok?: boolean; reply?: string; model?: string; mode?: string; message?: string; error?: string };
      if (data.reply != null && data.model != null) {
        setTestResult({ reply: data.reply, model: data.model, mode: data.mode || '' });
      } else {
        setTestErr(data.message || data.error || t('points.testFailed'));
      }
    } catch (e) {
      if (e instanceof APIError) {
        setTestErr(
          e.status === 400 && e.message.includes('NO_VIRTUAL')
            ? t('points.testNeedVirtual')
            : e.message || t('points.testFailed')
        );
      } else {
        setTestErr(t('points.testFailed'));
      }
    } finally {
      setTesting(false);
    }
  };

  const showFullKey = async () => {
    setActionError(null);
    try {
      const { virtualKey } = (await api.points.getVirtualKey()) as { virtualKey: string };
      setRevealedKey(virtualKey);
    } catch {
      setActionError(t('points.noKey'));
    }
  };

  if (authLoading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-2xl px-4 py-10">{t('loading')}</div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <p className="text-gray-700">{t('points.needLogin')}</p>
          <Link href="/login" className="mt-4 inline-block text-lobster underline">
            {t('login')}
          </Link>
        </div>
      </MainLayout>
    );
  }

  const usdPreview = info && pointsInput ? (parseInt(pointsInput, 10) || 0) / info.pointsPerUsd : null;
  const ks = keyStats?.keyStats;
  const usedPct = ks?.maxBudgetUsd ? Math.min(100, (ks.spendUsd / ks.maxBudgetUsd) * 100) : 0;

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-2xl px-4 py-8 pb-16">
        <h1 className="text-2xl font-bold text-gray-900">{t('points.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('points.subtitle')}</p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{loadError}</p>
          </div>
        )}

        {info && (
          <div className="mt-8 space-y-6 rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm">
            {/* 积分余额 */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-gray-600">{t('points.balance')}</span>
              <span className="text-2xl font-semibold tabular-nums text-gray-900">
                {info.clawPoints}{' '}
                <span className="text-base font-normal text-gray-500">{t('points.unit')}</span>
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {t('points.rateValue').replace('{{points}}', String(info.pointsPerUsd))}
            </p>
            <p className="text-sm text-gray-500">
              {t('points.min')}: {info.minRedeemPoints}
            </p>

            {!info.litellmConfigured ? (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>{t('points.notConfigured')}</p>
              </div>
            ) : (
              <>
                {/* 兑换 */}
                <div>
                  <label className="block text-sm font-medium text-gray-800">{t('points.pointsLabel')}</label>
                  <input
                    type="number"
                    min={info.minRedeemPoints}
                    step={1}
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    className="mt-2 w-full max-w-xs rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                  />
                  {usdPreview != null && Number.isFinite(usdPreview) && usdPreview > 0 && (
                    <p className="mt-2 text-sm text-gray-600">
                      {t('points.usdPreview').replace('{{usd}}', usdPreview.toFixed(4))}
                    </p>
                  )}
                </div>
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void onRedeem()}
                  className="rounded-full bg-lobster px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                >
                  {submitting ? t('points.redeeming') : t('points.redeem')}
                </button>

                {/* Key 余额概览 */}
                {info.hasVirtualKey && (
                  <div className="border-t border-gray-100 pt-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-800">额度概览</p>
                      <button
                        type="button"
                        onClick={() => void loadStats()}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {statsLoading ? '刷新中…' : '刷新'}
                      </button>
                    </div>
                    {ks ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>已用 {fmtUsd(ks.spendUsd)}</span>
                          <span>总额 {ks.maxBudgetUsd !== null ? fmtUsd(ks.maxBudgetUsd) : '—'}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-lobster transition-all"
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">
                          剩余：
                          <span className="font-medium text-gray-800">
                            {ks.remainingUsd !== null ? fmtUsd(ks.remainingUsd) : '—'}
                          </span>
                        </p>
                      </div>
                    ) : statsLoading ? (
                      <p className="mt-2 text-xs text-gray-400">加载中…</p>
                    ) : null}
                  </div>
                )}

                {/* 使用记录 & 充值记录 */}
                {info.hasVirtualKey && keyStats && (
                  <div className="border-t border-gray-100 pt-6">
                    <div className="flex gap-4 border-b border-gray-100 pb-2">
                      <button
                        type="button"
                        onClick={() => setStatsTab('usage')}
                        className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                          statsTab === 'usage'
                            ? 'border-lobster text-lobster'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        使用记录
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatsTab('redeem')}
                        className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                          statsTab === 'redeem'
                            ? 'border-lobster text-lobster'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        充值记录
                      </button>
                    </div>

                    {statsTab === 'usage' && (
                      <div className="mt-3">
                        {keyStats.keyStats?.usageLogs.length === 0 ? (
                          <p className="text-xs text-gray-400">暂无使用记录</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-gray-700">
                              <thead>
                                <tr className="border-b border-gray-100 text-gray-400">
                                  <th className="py-2 pr-3 text-left font-normal">时间</th>
                                  <th className="py-2 pr-3 text-left font-normal">模型</th>
                                  <th className="py-2 pr-3 text-right font-normal">Token</th>
                                  <th className="py-2 text-right font-normal">消费</th>
                                </tr>
                              </thead>
                              <tbody>
                                {keyStats.keyStats?.usageLogs.map((log, i) => (
                                  <tr key={log.request_id ?? i} className="border-b border-gray-50">
                                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-400">
                                      {log.startTime ? fmtDate(log.startTime) : '—'}
                                    </td>
                                    <td className="py-1.5 pr-3 max-w-[180px] truncate" title={log.model}>
                                      {log.model ?? '—'}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums">
                                      {log.total_tokens ?? '—'}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">
                                      {typeof log.spend === 'number' ? fmtUsd(log.spend) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {statsTab === 'redeem' && (
                      <div className="mt-3">
                        {keyStats.redeemHistory.length === 0 ? (
                          <p className="text-xs text-gray-400">暂无充值记录</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-gray-700">
                              <thead>
                                <tr className="border-b border-gray-100 text-gray-400">
                                  <th className="py-2 pr-3 text-left font-normal">时间</th>
                                  <th className="py-2 pr-3 text-right font-normal">积分</th>
                                  <th className="py-2 pr-3 text-right font-normal">换得 USD</th>
                                  <th className="py-2 text-right font-normal">剩余积分</th>
                                </tr>
                              </thead>
                              <tbody>
                                {keyStats.redeemHistory.map((r, i) => (
                                  <tr key={i} className="border-b border-gray-50">
                                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-400">
                                      {fmtDate(r.createdAt)}
                                    </td>
                                    <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${r.delta < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                      {r.delta > 0 ? `+${r.delta}` : r.delta}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums">
                                      {r.usd !== null ? fmtUsd(r.usd) : '—'}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                                      {r.balanceAfter}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 连接测试 */}
                <div className="border-t border-gray-100 pt-6">
                  <p className="text-sm font-medium text-gray-800">{t('points.testSection')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('points.testHint')}</p>

                  <label className="mt-3 block text-xs font-medium text-gray-600">模型（可选）</label>
                  <select
                    value={testModelSelect}
                    onChange={(e) => setTestModelSelect(e.target.value)}
                    disabled={testing}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                  >
                    <option value="">留空（用服务端默认）</option>
                    {PRESET_MODELS.map((m, i) =>
                      m.disabled ? (
                        <option key={i} disabled value="">
                          {m.label}
                        </option>
                      ) : (
                        <option key={i} value={m.value}>
                          {m.label}
                        </option>
                      )
                    )}
                  </select>

                  {testModelSelect === '__custom__' && (
                    <input
                      type="text"
                      value={testModelCustom}
                      onChange={(e) => setTestModelCustom(e.target.value)}
                      placeholder="如 openrouter/anthropic/claude-3-5-sonnet"
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                      disabled={testing}
                    />
                  )}

                  <label className="mt-3 block text-xs font-medium text-gray-600">
                    {t('points.testMessageLabel')}
                  </label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder={t('points.testMessagePlaceholder')}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                    disabled={testing}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={() => void runLlmTest(false)}
                      className="rounded-full border border-lobster/40 bg-white px-4 py-2 text-sm font-medium text-lobster hover:bg-lobster/5 disabled:opacity-50"
                    >
                      {testing ? t('points.testing') : t('points.testMaster')}
                    </button>
                    <button
                      type="button"
                      disabled={testing || !info.hasVirtualKey}
                      onClick={() => void runLlmTest(true)}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      title={!info.hasVirtualKey ? t('points.testNeedVirtual') : undefined}
                    >
                      {testing ? t('points.testing') : t('points.testVirtual')}
                    </button>
                  </div>
                  {testErr && <p className="mt-2 text-sm text-red-600">{testErr}</p>}
                  {testResult && (
                    <div className="mt-3 rounded-lg border border-green-100 bg-green-50/80 px-3 py-2 text-sm text-gray-800">
                      <p className="text-xs text-gray-500">
                        {t('points.models')}: {testResult.model} · {testResult.mode}
                      </p>
                      <p className="mt-1 font-medium">{t('points.testOk')}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{testResult.reply}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 代理地址 */}
            {info.litellmProxyBaseUrl && (
              <div className="border-t border-gray-100 pt-6">
                <p className="text-sm font-medium text-gray-800">{t('points.proxyUrl')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-800">
                    {info.litellmProxyBaseUrl}/v1
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(`${info.litellmProxyBaseUrl}/v1`)}
                    className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {t('points.copy')}
                  </button>
                </div>
              </div>
            )}

            {/* 虚拟 Key */}
            {info.hasVirtualKey && (
              <div className="border-t border-gray-100 pt-6">
                <p className="text-sm font-medium text-gray-800">{t('points.virtualKey')}</p>
                <p className="mt-1 font-mono text-sm text-gray-700">{info.virtualKeyMasked}</p>
                {revealedKey ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="max-w-full break-all rounded-lg bg-gray-100 px-3 py-2 text-xs">
                      {revealedKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyText(revealedKey)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {t('points.copyKey')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void showFullKey()}
                    className="mt-3 text-sm text-lobster underline"
                  >
                    {t('points.showKey')}
                  </button>
                )}
                <p className="mt-4 text-xs leading-relaxed text-gray-500">{t('points.openclawHint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
