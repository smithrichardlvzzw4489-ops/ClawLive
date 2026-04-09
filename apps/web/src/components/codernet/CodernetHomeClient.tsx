'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { MainLayout } from '@/components/MainLayout';

type TabId = 'lookup' | 'outreach';

interface QuotaDim { used: number; limit: number; remaining: number; ratio: number }
interface QuotaStatus {
  tier: string;
  month: string;
  dimensions: { profile_lookup: QuotaDim; search: QuotaDim; outreach: QuotaDim };
}

export function CodernetHomeClient() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<TabId>('lookup');

  const [searchValue, setSearchValue] = useState('');
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  const fetchQuota = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const base = API_BASE_URL || '';
    fetch(`${base}/api/platform/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.tier) setQuota(data); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { setChecking(false); return; }
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => { if (user?.username) router.replace('/my/profile'); else setChecking(false); })
      .catch(() => setChecking(false));
  }, [router]);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const val = searchValue.trim().replace(/^@/, '');
    if (!val) return;
    router.push(`/codernet/github/${encodeURIComponent(val)}`);
  };

  if (checking) {
    return (
      <MainLayout>
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="relative min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />

      <div className="relative z-10 min-h-[calc(100dvh-4rem)]">
        <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="text-center max-w-2xl w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 mb-6">
            <span className="text-xs font-mono text-violet-400 tracking-wider">GITLINK</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
            AI-Powered<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
              Developer Profile
            </span>
          </h1>

          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            输入 GitHub 用户名，查看任意开发者的 AI 画像
          </p>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setTab('lookup')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'lookup' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              GitHub 画像
            </button>
            <button
              type="button"
              onClick={() => setTab('outreach')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'outreach' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              LINK
            </button>
          </div>

          {/* Lookup Tab */}
          {tab === 'lookup' && (
            <div className="max-w-md mx-auto">
              <form onSubmit={handleLookup} className="relative mb-4">
                <div className="flex rounded-xl border border-white/[0.1] bg-white/[0.04] overflow-hidden focus-within:border-violet-500/40 transition">
                  <span className="flex items-center pl-4 text-slate-500 font-mono text-sm select-none">@</span>
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="github-username"
                    className="flex-1 bg-transparent px-2 py-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" disabled={!searchValue.trim()} className="px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-sm font-semibold transition">
                    Generate
                  </button>
                </div>
              </form>
              <div className="flex flex-wrap justify-center gap-2">
                <span className="text-[10px] text-slate-600 self-center mr-1">Try:</span>
                {['torvalds', 'yyx990803', 'tj', 'sindresorhus', 'antirez'].map((n) => (
                  <button key={n} onClick={() => router.push(`/codernet/github/${n}`)} className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition">
                    @{n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Outreach Tab */}
          {tab === 'outreach' && (
            <div className="max-w-lg mx-auto">
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-8 text-center">
                <div className="text-4xl mb-4">📡</div>
                <h3 className="text-lg font-bold mb-2">Developer Outreach</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  从 GitHub 1.8亿+ 开发者中搜索 → 自动提取联系方式 → AI 为每人生成个性化消息 → 一键发送
                </p>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-xl font-bold text-green-400">~80%</p>
                    <p className="text-[10px] text-slate-500">Email 提取率</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-xl font-bold text-violet-400">1000</p>
                    <p className="text-[10px] text-slate-500">最大外联人数</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-xl font-bold text-blue-400">AI</p>
                    <p className="text-[10px] text-slate-500">个性化消息</p>
                  </div>
                </div>
                <Link
                  href="/codernet/outreach"
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold transition"
                >
                  Launch Outreach Campaign →
                </Link>
              </div>
            </div>
          )}

          <div className="flex justify-center my-8">
            <Link
              href="/login?redirect=/my/profile"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-6 py-2.5 text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Login with GitHub to create your own card
            </Link>
          </div>

          {/* Quota Usage Bar */}
          {quota && (
            <div className="mt-8 max-w-lg mx-auto w-full">
              <QuotaBar quota={quota} />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
    </MainLayout>
  );
}

const QUOTA_DIMS: { key: keyof QuotaStatus['dimensions']; label: string; icon: string; color: string }[] = [
  { key: 'profile_lookup', label: 'Profile 画像', icon: '📊', color: '#8b5cf6' },
  { key: 'outreach', label: 'LINK', icon: '📡', color: '#10b981' },
];

function QuotaBar({ quota }: { quota: QuotaStatus }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Monthly Usage</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">
            {quota.tier}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{quota.month}</span>
      </div>
      <div className="space-y-2.5">
        {QUOTA_DIMS.map(({ key, label, icon, color }) => {
          const dim = quota.dimensions[key];
          const pct = dim.limit > 0 ? Math.min(100, (dim.used / dim.limit) * 100) : 0;
          const isWarning = dim.ratio >= 0.8;
          const isExceeded = dim.ratio >= 1;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span>{icon}</span>
                  {label}
                </span>
                <span className={`text-[11px] font-mono ${isExceeded ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-slate-500'}`}>
                  {dim.used}/{dim.limit}
                  {isExceeded && ' — 已用完'}
                  {isWarning && !isExceeded && ' — 即将用完'}
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isExceeded ? '#ef4444' : isWarning ? '#f59e0b' : color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
