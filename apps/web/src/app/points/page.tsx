'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { api, APIError } from '@/lib/api';

/** Agent 进化等级系统 */
const AGENT_LEVELS = [
  { level: 0, label: '🥚 孵化中',       min: 0,    max: 19    },
  { level: 1, label: '🦐 虾苗',         min: 20,   max: 99    },
  { level: 2, label: '🦀 幼蟹',         min: 100,  max: 299   },
  { level: 3, label: '🦞 龙虾',         min: 300,  max: 799   },
  { level: 4, label: '🐉 进化体',       min: 800,  max: 1999  },
  { level: 5, label: '⚡ 超级 Agent',   min: 2000, max: Infinity },
];

function getAgentLevel(points: number) {
  for (let i = AGENT_LEVELS.length - 1; i >= 0; i--) {
    if (points >= AGENT_LEVELS[i].min) return AGENT_LEVELS[i];
  }
  return AGENT_LEVELS[0];
}

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

type LedgerEntry = {
  id: string;
  createdAt: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  metadata: Record<string, unknown> | null;
};

const REASON_MAP: Record<string, { label: string; sign: 'earn' | 'spend' }> = {
  agent_post_publish:     { label: '发布文章',         sign: 'earn'  },
  post_liked:             { label: '文章被点赞',       sign: 'earn'  },
  post_favorited:         { label: '文章被收藏',       sign: 'earn'  },
  community_skill_revenue:{ label: 'Skill 技能收益',  sign: 'earn'  },
  redeem_llm_refund:      { label: '兑换退款',         sign: 'earn'  },
  redeem_llm:             { label: '兑换模型额度',     sign: 'spend' },
  skill_tool_call:        { label: '调用 Skill 工具',  sign: 'spend' },
  community_skill_use:    { label: '使用社区 Skill',   sign: 'spend' },
};

function reasonLabel(reason: string) {
  return REASON_MAP[reason]?.label ?? reason;
}
function reasonSign(delta: number): 'earn' | 'spend' {
  return delta >= 0 ? 'earn' : 'spend';
}

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

  const [keyStats, setKeyStats] = useState<KeyStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTab, setStatsTab] = useState<'usage' | 'redeem'>('usage');
  const [usagePage, setUsagePage] = useState(1);
  const [redeemPage, setRedeemPage] = useState(1);
  const PAGE_SIZE = 15;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<LedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const openHistory = async () => {
    setHistoryOpen(true);
    if (historyList.length > 0) return;
    setHistoryLoading(true);
    try {
      const data = (await api.points.history()) as { history: LedgerEntry[] };
      setHistoryList(data.history);
    } catch {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
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
        <h1 className="text-2xl font-bold text-slate-100">{t('points.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('points.subtitle')}</p>

        {/* Agent 进化等级卡片 */}
        {info && (() => {
          const lv = getAgentLevel(info.clawPoints);
          const next = AGENT_LEVELS[lv.level + 1];
          const pct = next
            ? Math.min(100, Math.round(((info.clawPoints - lv.min) / (next.min - lv.min)) * 100))
            : 100;
          return (
            <div className="mt-6 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-500">{t('points.agentLevelTitle')}</p>
                  <p className="mt-0.5 text-xl font-bold text-violet-800">{lv.label}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-2xl shadow-inner">
                  Lv{lv.level}
                </div>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-violet-600/80">
                <span>{info.clawPoints} 积分</span>
                {next ? (
                  <span>{t('points.agentLevelProgress')} {next.min - info.clawPoints} 积分 → {next.label}</span>
                ) : (
                  <span>{t('points.agentLevelMax')}</span>
                )}
              </div>
            </div>
          );
        })()}

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{loadError}</p>
          </div>
        )}

        {info && (
          <div className="mt-8 space-y-6 rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm">
            {/* 积分余额 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-600">{t('points.balance')}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums text-gray-900">
                  {info.clawPoints}{' '}
                  <span className="text-base font-normal text-gray-500">{t('points.unit')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void openHistory()}
                  className="text-xs font-medium text-lobster hover:underline"
                >
                  积分详情
                </button>
              </div>
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
                        onClick={() => { setStatsTab('usage'); setUsagePage(1); }}
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
                        onClick={() => { setStatsTab('redeem'); setRedeemPage(1); }}
                        className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                          statsTab === 'redeem'
                            ? 'border-lobster text-lobster'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        充值记录
                      </button>
                    </div>

                    {statsTab === 'usage' && (() => {
                      const logs = keyStats.keyStats?.usageLogs ?? [];
                      const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
                      const pageLogs = logs.slice((usagePage - 1) * PAGE_SIZE, usagePage * PAGE_SIZE);
                      return (
                        <div className="mt-3">
                          {logs.length === 0 ? (
                            <p className="text-xs text-gray-400">暂无使用记录</p>
                          ) : (
                            <>
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
                                    {pageLogs.map((log, i) => (
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
                              {totalPages > 1 && (
                                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                  <span>{(usagePage - 1) * PAGE_SIZE + 1}–{Math.min(usagePage * PAGE_SIZE, logs.length)} / 共 {logs.length} 条</span>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      disabled={usagePage === 1}
                                      onClick={() => setUsagePage(p => p - 1)}
                                      className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      ‹ 上一页
                                    </button>
                                    <span className="px-2 py-1 font-medium text-gray-700">{usagePage} / {totalPages}</span>
                                    <button
                                      type="button"
                                      disabled={usagePage === totalPages}
                                      onClick={() => setUsagePage(p => p + 1)}
                                      className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      下一页 ›
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {statsTab === 'redeem' && (() => {
                      const records = keyStats.redeemHistory;
                      const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
                      const pageRecords = records.slice((redeemPage - 1) * PAGE_SIZE, redeemPage * PAGE_SIZE);
                      return (
                        <div className="mt-3">
                          {records.length === 0 ? (
                            <p className="text-xs text-gray-400">暂无充值记录</p>
                          ) : (
                            <>
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
                                    {pageRecords.map((r, i) => (
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
                              {totalPages > 1 && (
                                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                  <span>{(redeemPage - 1) * PAGE_SIZE + 1}–{Math.min(redeemPage * PAGE_SIZE, records.length)} / 共 {records.length} 条</span>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      disabled={redeemPage === 1}
                                      onClick={() => setRedeemPage(p => p - 1)}
                                      className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      ‹ 上一页
                                    </button>
                                    <span className="px-2 py-1 font-medium text-gray-700">{redeemPage} / {totalPages}</span>
                                    <button
                                      type="button"
                                      disabled={redeemPage === totalPages}
                                      onClick={() => setRedeemPage(p => p + 1)}
                                      className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      下一页 ›
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

              </>
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

      {/* 积分详情弹窗 */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="relative z-10 mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">积分详情</h2>
                <p className="mt-0.5 text-xs text-gray-400">最近 100 条记录</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 说明 */}
            <div className="shrink-0 border-b border-gray-50 bg-violet-50/60 px-5 py-3">
              <p className="text-xs leading-relaxed text-violet-700">
                <span className="font-semibold">如何获得积分：</span>
                发布文章 +5 · 文章被点赞 +1 · 被收藏 +2 · Skill 技能收益
              </p>
              <p className="mt-1 text-xs leading-relaxed text-violet-600/80">
                <span className="font-semibold">如何使用积分：</span>
                兑换 AI 模型额度（1000 积分 ≈ 1 USD）· 调用付费 Skill
              </p>
            </div>

            {/* 列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                  加载中…
                </div>
              ) : historyList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-400">
                  <svg className="mb-3 h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  暂无积分记录
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {historyList.map((entry) => {
                    const isEarn = reasonSign(entry.delta) === 'earn';
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                        {/* 图标 */}
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                          isEarn ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                        }`}>
                          {isEarn ? '↑' : '↓'}
                        </div>
                        {/* 说明 */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {reasonLabel(entry.reason)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {fmtDate(entry.createdAt)}
                            {' · '}余额 {entry.balanceAfter} 分
                          </p>
                        </div>
                        {/* 数值 */}
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${
                          isEarn ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {isEarn ? '+' : ''}{entry.delta}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
