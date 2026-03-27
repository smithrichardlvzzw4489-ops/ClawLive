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

export default function PointsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();
  const [info, setInfo] = useState<LlmInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pointsInput, setPointsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [testModel, setTestModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ reply: string; model: string; mode: string } | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadError(null);
    try {
      const data = (await api.points.llm()) as LlmInfo;
      if (typeof window !== 'undefined') {
        console.log('[Points] API response:', JSON.stringify(data));
      }
      setInfo(data);
    } catch (e) {
      const msg = e instanceof APIError ? e.message : '加载失败';
      if (typeof window !== 'undefined') {
        console.error('[Points] load error:', msg, e);
      }
      setLoadError(msg);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void load();
  }, [authLoading, isAuthenticated, load]);

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

  const runLlmTest = async (useVirtualKey: boolean) => {
    if (!info?.litellmConfigured) return;
    setTestErr(null);
    setTestResult(null);
    setTesting(true);
    try {
      const msg = testMessage.trim();
      const mdl = testModel.trim();
      const data = (await api.points.testLlm({
        useVirtualKey,
        ...(msg ? { message: msg } : {}),
        ...(mdl ? { model: mdl } : {}),
      })) as {
        ok?: boolean;
        reply?: string;
        model?: string;
        mode?: string;
        message?: string;
        error?: string;
      };
      if (data.reply != null && data.model != null) {
        setTestResult({
          reply: data.reply,
          model: data.model,
          mode: data.mode || '',
        });
      } else {
        setTestErr(data.message || data.error || t('points.testFailed'));
      }
    } catch (e) {
      if (e instanceof APIError) {
        if (e.status === 400 && e.message.includes('NO_VIRTUAL')) {
          setTestErr(t('points.testNeedVirtual'));
        } else {
          setTestErr(e.message || t('points.testFailed'));
        }
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

  const usdPreview =
    info && pointsInput
      ? (parseInt(pointsInput, 10) || 0) / info.pointsPerUsd
      : null;

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-2xl px-4 py-8 pb-16">
        <h1 className="text-2xl font-bold text-gray-900">{t('points.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('points.subtitle')}</p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{loadError}</p>
            <p className="mt-1 text-xs text-gray-500">[DEBUG] API endpoint: /api/points/llm</p>
          </div>
        )}

        {info && (
          <div className="mt-8 space-y-6 rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-gray-600">{t('points.balance')}</span>
              <span className="text-2xl font-semibold tabular-nums text-gray-900">
                {info.clawPoints} <span className="text-base font-normal text-gray-500">{t('points.unit')}</span>
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {t('points.rateValue').replace('{{points}}', String(info.pointsPerUsd))}
            </p>
            <p className="text-sm text-gray-500">
              {t('points.min')}: {info.minRedeemPoints}
            </p>
            {info.litellmModels.length > 0 && (
              <p className="text-xs text-gray-500">
                {t('points.models')}: {info.litellmModels.join(', ')}
              </p>
            )}

            {!info.litellmConfigured ? (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>{t('points.notConfigured')}</p>
                <p className="mt-2 text-xs text-gray-500 break-all">
                  [DEBUG] litellmConfigured={String(info.litellmConfigured)},
                  clawPoints={info.clawPoints},
                  proxyBaseUrl={info.litellmProxyBaseUrl ?? 'null'},
                  loadError={loadError ?? 'none'}
                </p>
              </div>
            ) : (
              <>
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

                <div className="border-t border-gray-100 pt-6">
                  <p className="text-sm font-medium text-gray-800">{t('points.testSection')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('points.testHint')}</p>
                  <label className="mt-3 block text-xs font-medium text-gray-600">
                    模型名（可选）
                  </label>
                  <input
                    type="text"
                    value={testModel}
                    onChange={(e) => setTestModel(e.target.value)}
                    placeholder="留空用默认，如 openrouter/anthropic/claude-3-5-sonnet"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                    disabled={testing}
                  />
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

            {info.hasVirtualKey && (
              <div className="border-t border-gray-100 pt-6">
                <p className="text-sm font-medium text-gray-800">{t('points.virtualKey')}</p>
                <p className="mt-1 font-mono text-sm text-gray-700">{info.virtualKeyMasked}</p>
                {revealedKey ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="max-w-full break-all rounded-lg bg-gray-100 px-3 py-2 text-xs">{revealedKey}</code>
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
