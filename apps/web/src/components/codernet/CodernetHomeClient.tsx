'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { MainLayout } from '@/components/MainLayout';

type TabId = 'mine' | 'lookup' | 'outreach';

interface MeBrief {
  username: string;
  githubUsername: string | null;
}

interface QuotaDim { used: number; limit: number; remaining: number; ratio: number }
interface QuotaStatus {
  tier: string;
  month: string;
  dimensions: { profile_lookup: QuotaDim; search: QuotaDim; outreach: QuotaDim };
}

export function CodernetHomeClient() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('mine');

  const [searchValue, setSearchValue] = useState('');
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [meBrief, setMeBrief] = useState<MeBrief | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [mineBusy, setMineBusy] = useState(false);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [mineNeedLogin, setMineNeedLogin] = useState(false);
  const [meFetchError, setMeFetchError] = useState(false);

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
    if (tab !== 'mine') return;
    setMineErr(null);
    setMeFetchError(false);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setMeBrief(null);
      setMineNeedLogin(true);
      setMeLoading(false);
      return;
    }
    setMineNeedLogin(false);
    setMeLoading(true);
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) {
          setMeFetchError(true);
          setMeBrief(null);
          return;
        }
        const u = (await r.json()) as { username?: string; githubUsername?: string | null };
        if (u?.username) setMeBrief({ username: u.username, githubUsername: u.githubUsername ?? null });
        else {
          setMeFetchError(true);
          setMeBrief(null);
        }
      })
      .catch(() => {
        setMeFetchError(true);
        setMeBrief(null);
      })
      .finally(() => setMeLoading(false));
  }, [tab]);

  const handleGenerateMinePortrait = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login?redirect=/codernet');
      return;
    }
    setMineErr(null);
    setMineBusy(true);
    const base = API_BASE_URL || '';
    try {
      const res = await fetch(`${base}/api/codernet/crawl`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status === 401) {
        router.push('/login?redirect=/codernet');
        return;
      }
      if (res.status === 400 && data.error === 'NO_GITHUB') {
        setMineErr(data.message || '请先使用 GitHub 登录并关联账号。');
        return;
      }
      if (res.status === 429) {
        setMineErr(data.message || '请等待数分钟后再重新生成。');
        router.push('/my/profile');
        return;
      }
      if (!res.ok) {
        setMineErr(data.message || data.error || '生成失败，请稍后重试。');
        return;
      }
      router.push('/my/profile');
    } catch {
      setMineErr('网络异常，请稍后重试。');
    } finally {
      setMineBusy(false);
    }
  };

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const val = searchValue.trim().replace(/^@/, '');
    if (!val) return;
    router.push(`/codernet/github/${encodeURIComponent(val)}`);
  };

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
          <div className="grid grid-cols-3 gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'mine' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              我的画像
            </button>
            <button
              type="button"
              onClick={() => setTab('lookup')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'lookup' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              GitHub 画像
            </button>
            <button
              type="button"
              onClick={() => setTab('outreach')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'outreach' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              LINK
            </button>
          </div>

          {/* My portrait tab */}
          {tab === 'mine' && (
            <div className="max-w-md mx-auto text-center">
              {meLoading ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                  <p className="text-xs text-slate-500 font-mono">加载账号信息…</p>
                </div>
              ) : mineNeedLogin ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-6">
                  <p className="text-sm text-slate-400 mb-4">登录后可基于已关联的 GitHub 账号生成你的开发者画像。</p>
                  <Link
                    href="/login?redirect=/codernet"
                    className="inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold transition"
                  >
                    去登录
                  </Link>
                </div>
              ) : meFetchError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-6">
                  <p className="text-sm text-red-200/90 mb-4">无法获取当前账号信息，请重新登录后再试。</p>
                  <Link
                    href="/login?redirect=/codernet"
                    className="inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold transition"
                  >
                    去登录
                  </Link>
                </div>
              ) : !meBrief?.githubUsername ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-6">
                  <p className="text-sm text-amber-200/90 mb-4">
                    当前账号尚未关联 GitHub。请使用 GitHub 登录以启用画像生成。
                  </p>
                  <Link
                    href="/login?redirect=/codernet"
                    className="inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold transition"
                  >
                    使用 GitHub 登录
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-6">
                  <p className="text-sm text-slate-300 mb-1">
                    平台用户 <span className="font-mono text-violet-300">@{meBrief.username}</span>
                  </p>
                  <p className="text-xs text-slate-500 mb-5 font-mono">
                    GitHub · @{meBrief.githubUsername}
                  </p>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    点击下方按钮将拉取仓库与公开活动并由 AI 生成画像，完成后可在「我的」画像页查看进度与结果。
                  </p>
                  {mineErr && (
                    <p className="text-xs text-red-300 mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                      {mineErr}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={mineBusy}
                    onClick={() => void handleGenerateMinePortrait()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-sm font-semibold transition"
                  >
                    {mineBusy ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        正在启动…
                      </>
                    ) : (
                      '生成我的画像'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

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
