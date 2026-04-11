'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL, api, APIError } from '@/lib/api';
import { withReturnTo } from '@/hooks/useHistoryBack';
import { MainLayout } from '@/components/MainLayout';

interface SemanticSearchHit {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  bio: string | null;
  location: string | null;
}

type TabId = 'mine' | 'lookup' | 'outreach';

interface MeBrief {
  username: string;
  githubUsername: string | null;
}

export function CodernetHomeClient() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const here = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    [pathname, searchParams],
  );
  const [tab, setTab] = useState<TabId>('mine');

  const [searchValue, setSearchValue] = useState('');
  const [meBrief, setMeBrief] = useState<MeBrief | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [mineBusy, setMineBusy] = useState(false);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [mineNeedLogin, setMineNeedLogin] = useState(false);
  const [meFetchError, setMeFetchError] = useState(false);

  const [linkQuery, setLinkQuery] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkResults, setLinkResults] = useState<SemanticSearchHit[] | null>(null);

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
    router.push(withReturnTo(`/codernet/github/${encodeURIComponent(val)}`, here));
  };

  const handleSemanticSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = linkQuery.trim();
    if (!q || linkLoading) return;
    setLinkErr(null);
    setLinkLoading(true);
    setLinkResults(null);
    try {
      const data = (await api.codernet.searchDevelopers(q)) as { results?: SemanticSearchHit[] };
      setLinkResults(data.results ?? []);
    } catch (err) {
      if (err instanceof APIError) {
        setLinkErr(err.message || '搜索失败');
      } else {
        setLinkErr('网络异常，请稍后重试');
      }
    } finally {
      setLinkLoading(false);
    }
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
                  <button
                    key={n}
                    onClick={() => router.push(withReturnTo(`/codernet/github/${encodeURIComponent(n)}`, here))}
                    className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition"
                  >
                    @{n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LINK: semantic search → many ranked developers → open portrait */}
          {tab === 'outreach' && (
            <div className="max-w-xl mx-auto w-full text-left">
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-6 sm:p-8 mb-6">
                <p className="text-center text-sm text-slate-400 mb-5 leading-relaxed">
                  用自然语言描述你要找的人（技术栈、地区、经验等）→ AI 解析并在 GitHub 上检索 → 精排后列出<strong className="text-slate-300">多位</strong>
                  合适开发者。
                </p>
                <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-green-400">多选</p>
                    <p className="text-[10px] text-slate-500 leading-tight">一次返回多人</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-violet-400">AI</p>
                    <p className="text-[10px] text-slate-500 leading-tight">解析 + 精排</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-blue-400">画像</p>
                    <p className="text-[10px] text-slate-500 leading-tight">跳转即看</p>
                  </div>
                </div>
                <form onSubmit={(e) => void handleSemanticSearch(e)} className="space-y-3">
                  <textarea
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    placeholder="例如：在上海做 Rust 后端、有开源贡献的开发者"
                    rows={3}
                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 resize-y min-h-[5rem]"
                  />
                  {linkErr && (
                    <p className="text-xs text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">{linkErr}</p>
                  )}
                  <button
                    type="submit"
                    disabled={linkLoading || !linkQuery.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 text-sm font-semibold transition"
                  >
                    {linkLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        搜索中…
                      </>
                    ) : (
                      '搜索'
                    )}
                  </button>
                </form>
                <p className="text-[10px] text-slate-600 text-center mt-3 font-mono">
                  登录用户受月度搜索额度限制；结果来自公开 GitHub 数据。
                </p>
              </div>

              {linkResults && linkResults.length === 0 && !linkLoading && (
                <p className="text-center text-sm text-slate-500 mb-6">未找到足够匹配的开发者，可换个描述再试。</p>
              )}

              {linkResults && linkResults.length > 0 && (
                <div className="space-y-3 mb-8">
                  <p className="text-xs text-slate-500 font-mono text-center mb-2">共 {linkResults.length} 人 · 按匹配度排序</p>
                  {linkResults.map((hit) => (
                    <Link
                      key={hit.githubUsername}
                      href={withReturnTo(`/codernet/github/${encodeURIComponent(hit.githubUsername)}`, here)}
                      className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-violet-500/30 hover:bg-white/[0.05]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hit.avatarUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg border border-white/10"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono font-semibold text-white">@{hit.githubUsername}</span>
                          <span className="text-[10px] text-violet-400 font-mono">
                            匹配 {(hit.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        {hit.oneLiner ? (
                          <p className="text-xs text-violet-200/90 mt-1 line-clamp-2">{hit.oneLiner}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{hit.reason}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {hit.techTags.slice(0, 6).map((t) => (
                            <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-600 mt-2 font-mono">
                          {hit.stats.followers.toLocaleString()} followers · {hit.stats.totalPublicRepos} repos
                          {hit.location ? ` · ${hit.location}` : ''}
                        </p>
                      </div>
                      <span className="self-center text-violet-400 text-sm shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] px-4 py-8 text-center">
        <a
          href="https://t.me/+BFwEnVC6HdE1NDJl"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-violet-300 hover:text-violet-200 transition"
        >
          欢迎进入社区交流
        </a>
        <p className="mt-2 max-w-lg mx-auto break-all text-[11px] font-mono text-slate-500">
          https://t.me/+BFwEnVC6HdE1NDJl
        </p>
      </footer>
    </div>
    </MainLayout>
  );
}
