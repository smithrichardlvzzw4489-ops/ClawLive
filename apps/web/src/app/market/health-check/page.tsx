'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

type InputMode = 'platform' | 'url' | 'text';

interface SkillOption {
  id: string;
  title: string;
}

interface HealthCheckResult {
  riskLevel: 'safe' | 'low' | 'medium' | 'high';
  score: number;
  hits: Array<{
    ruleId: string;
    ruleName: string;
    riskLevel: string;
    description: string;
    snippet: string;
    startIndex: number;
  }>;
  summary: string;
  checkedAt: string;
}

function HealthCheckContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const querySkillId = searchParams.get('skillId');
  const [inputMode, setInputMode] = useState<InputMode>(querySkillId ? 'platform' : 'text');
  const [platformSkills, setPlatformSkills] = useState<SkillOption[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState(querySkillId || '');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState('');

  const loadPlatformSkills = async () => {
    if (platformSkills.length > 0 && !querySkillId) return;
    try {
      setLoadingSkills(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.skills || []).map((s: { id: string; title: string }) => ({
          id: s.id,
          title: s.title,
        }));
        setPlatformSkills(list);
      }
    } catch {
      setError(t('healthCheck.loadSkillsFailed'));
    } finally {
      setLoadingSkills(false);
    }
  };

  useEffect(() => {
    if (querySkillId && inputMode === 'platform') {
      setSelectedSkillId(querySkillId);
      loadPlatformSkills();
    }
  }, [querySkillId, inputMode]);

  const handleModeChange = (mode: InputMode) => {
    setInputMode(mode);
    setResult(null);
    setError('');
    if (mode === 'platform') loadPlatformSkills();
  };

  const runCheck = async () => {
    setError('');
    setResult(null);

    let body: { content?: string; url?: string; skillId?: string } = {};
    if (inputMode === 'platform') {
      if (!selectedSkillId.trim()) {
        setError(t('healthCheck.selectSkillError'));
        return;
      }
      body.skillId = selectedSkillId.trim();
    } else if (inputMode === 'url') {
      if (!url.trim()) {
        setError(t('healthCheck.enterUrl'));
        return;
      }
      body.url = url.trim();
    } else {
      if (!content.trim()) {
        setError(t('healthCheck.pasteContent'));
        return;
      }
      body.content = content.trim();
    }

    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/health-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('healthCheck.checkFailed'));
        return;
      }
      setResult(data);
    } catch {
      setError(t('healthCheck.networkError'));
    } finally {
      setLoading(false);
    }
  };

  const riskLevelStyles: Record<string, string> = {
    safe: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    low: 'bg-amber-100 text-amber-800 border-amber-200',
    medium: 'bg-orange-100 text-orange-800 border-orange-200',
    high: 'bg-red-100 text-red-800 border-red-200',
  };

  const riskLabels: Record<string, string> = {
    safe: t('healthCheck.riskSafe'),
    low: t('healthCheck.riskLow'),
    medium: t('healthCheck.riskMedium'),
    high: t('healthCheck.riskHigh'),
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <Link href="/market" className="text-lobster hover:underline mb-6 inline-block">
          ← {t('back')} {t('market.title')}
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('healthCheck.title')}</h1>
          <p className="text-gray-600">{t('healthCheck.subtitle')}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex rounded-lg bg-gray-100 p-0.5 mb-6">
            {(['text', 'url', 'platform'] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  inputMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t(`healthCheck.mode${m === 'text' ? 'Text' : m === 'url' ? 'Url' : 'Platform'}`)}
              </button>
            ))}
          </div>

          {inputMode === 'platform' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('healthCheck.selectSkill')}
              </label>
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              >
                <option value="">{loadingSkills ? t('loading') : t('healthCheck.chooseSkill')}</option>
                {platformSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {inputMode === 'url' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('healthCheck.enterUrl')}
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/skill.md"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              />
            </div>
          )}

          {inputMode === 'text' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('healthCheck.pasteContent')}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('healthCheck.pastePlaceholder')}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent font-mono text-sm"
              />
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <button
            onClick={runCheck}
            disabled={loading}
            className="w-full px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('healthCheck.checking') : t('healthCheck.runCheck')}
          </button>
        </div>

        {result && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={`px-4 py-2 rounded-lg font-semibold border ${
                    riskLevelStyles[result.riskLevel] || riskLevelStyles.safe
                  }`}
                >
                  {riskLabels[result.riskLevel] || result.riskLevel}
                </span>
                <span className="text-2xl font-bold text-gray-900">{result.score}</span>
                <span className="text-gray-500">/ 100</span>
              </div>
              <p className="mt-3 text-gray-600">{result.summary}</p>
              <p className="mt-1 text-xs text-gray-400">
                {t('healthCheck.checkedAt')}: {new Date(result.checkedAt).toLocaleString()}
              </p>
            </div>

            {result.hits.length > 0 && (
              <div className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">{t('healthCheck.detectedRisks')}</h3>
                <div className="space-y-3">
                  {result.hits.map((h, i) => (
                    <div
                      key={`${h.ruleId}-${i}`}
                      className="p-4 rounded-lg border bg-gray-50 border-gray-200"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            riskLevelStyles[h.riskLevel] || 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {riskLabels[h.riskLevel] || h.riskLevel}
                        </span>
                        <span className="text-sm font-medium text-gray-700">{h.description}</span>
                      </div>
                      <pre className="text-xs text-gray-600 mt-2 font-mono whitespace-pre-wrap break-words">
                        {h.snippet}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default function SkillHealthCheckPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="container mx-auto px-6 py-16 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
          </div>
        </MainLayout>
      }
    >
      <HealthCheckContent />
    </Suspense>
  );
}
