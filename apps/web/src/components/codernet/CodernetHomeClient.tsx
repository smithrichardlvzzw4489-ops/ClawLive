'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, APIError } from '@/lib/api';
import { withReturnTo } from '@/hooks/useHistoryBack';
import { MainLayout } from '@/components/MainLayout';
import { MathMatchPanel } from '@/components/math/MathMatchPanel';

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

type TabId = 'lookup' | 'outreach' | 'math';

export function CodernetHomeClient() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const here = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    [pathname, searchParams],
  );
  const [tab, setTab] = useState<TabId>('lookup');

  useEffect(() => {
    if (searchParams.get('tab') === 'math') setTab('math');
  }, [searchParams]);

  const selectTab = (next: TabId) => {
    setTab(next);
    if (next === 'math') {
      router.replace('/?tab=math', { scroll: false });
    } else {
      router.replace('/', { scroll: false });
    }
  };

  const [searchValue, setSearchValue] = useState('');

  const [linkQuery, setLinkQuery] = useState('');
  const [linkFiles, setLinkFiles] = useState<File[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkResults, setLinkResults] = useState<SemanticSearchHit[] | null>(null);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const val = searchValue.trim().replace(/^@/, '');
    if (!val) return;
    router.push(withReturnTo(`/codernet/github/${encodeURIComponent(val)}`, here));
  };

  const handleSemanticSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = linkQuery.trim();
    if ((!q && linkFiles.length === 0) || linkLoading) return;
    setLinkErr(null);
    setLinkLoading(true);
    setLinkResults(null);
    try {
      const data = (await api.codernet.searchDevelopers(q, linkFiles.length ? linkFiles : undefined)) as {
        results?: SemanticSearchHit[];
      };
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
        <div
          className={`flex min-h-[calc(100dvh-4rem)] flex-col items-center px-4 py-10 sm:py-16 ${
            tab === 'math' ? 'justify-start' : 'justify-center'
          }`}
        >
        <div className="text-center max-w-2xl w-full mx-auto">
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

          {/* Tab Switcher：GitHub 画像 · LINK · MATH */}
          <div className="grid grid-cols-3 gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-xl mx-auto w-full">
            <button
              type="button"
              onClick={() => selectTab('lookup')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'lookup' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              GitHub 画像
            </button>
            <button
              type="button"
              onClick={() => selectTab('outreach')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'outreach' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              LINK
            </button>
            <button
              type="button"
              onClick={() => selectTab('math')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'math' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              MATH
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
                  <button
                    key={n}
                    onClick={() => router.push(withReturnTo(`/codernet/github/${encodeURIComponent(n)}`, here))}
                    className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition"
                  >
                    @{n}
                  </button>
                ))}
              </div>
              <p className="text-center text-[11px] text-slate-500 mt-5 leading-relaxed px-1">
                要查看我的画像请到
                <Link href="/my/profile" className="text-violet-400/90 hover:text-violet-300 underline-offset-2 hover:underline mx-0.5">
                  个人账号 → My card
                </Link>
              </p>
            </div>
          )}

          {/* LINK: semantic search → many ranked developers → open portrait */}
          {tab === 'outreach' && (
            <div className="max-w-xl mx-auto w-full text-left">
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-6 sm:p-8 mb-6">
                <p className="text-center text-sm text-slate-400 mb-5 leading-relaxed">
                  用自然语言描述，和/或上传 JD、职位说明等附件（与 MATH 标签相同：.txt / .md / .pdf / .docx / 常见图片）→ AI
                  综合解析并在 GitHub 上检索 → 精排后列出<strong className="text-slate-300">多位</strong>
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
                    placeholder="例如：在上海做 Rust 后端、有开源贡献的开发者（可与下方附件同时使用）"
                    rows={3}
                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 resize-y min-h-[5rem]"
                  />
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-mono">JD / 其他材料（可选，最多 8 个）</span>
                      {/* 勿用 display:none 隐藏 file input：部分浏览器选文件后 change 中 files 仍为空 */}
                      <label className="relative inline-flex min-h-[1.75rem] cursor-pointer items-center rounded-md px-1 text-xs font-mono text-violet-400 hover:text-violet-300">
                        <input
                          type="file"
                          multiple
                          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          onChange={(e) => {
                            const picked = e.target.files;
                            const list = picked?.length ? Array.from(picked) : [];
                            e.target.value = '';
                            if (!list.length) return;
                            setLinkFiles((prev) => [...prev, ...list].slice(0, 8));
                          }}
                        />
                        <span className="pointer-events-none select-none">选择文件</span>
                      </label>
                    </div>
                    {linkFiles.length > 0 ? (
                      <ul className="text-[11px] text-slate-500 font-mono space-y-1">
                        {linkFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setLinkFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="shrink-0 text-slate-600 hover:text-red-300"
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
                        未选文件时仅按上方自然语言搜索；仅上传附件时也会按附件正文检索。
                      </p>
                    )}
                  </div>
                  {linkErr && (
                    <p className="text-xs text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">{linkErr}</p>
                  )}
                  <button
                    type="submit"
                    disabled={linkLoading || (!linkQuery.trim() && linkFiles.length === 0)}
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
                  <p className="text-xs text-slate-500 font-mono text-center mb-2">
                    共 {linkResults.length} 人 · 按匹配度排序 · 点击卡片查看画像
                  </p>
                  {linkResults.map((hit) => (
                    <Link
                      key={hit.githubUsername}
                      href={withReturnTo(`/codernet/github/${encodeURIComponent(hit.githubUsername)}`, here)}
                      className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4 transition hover:border-violet-500/20 hover:bg-white/[0.04]"
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

        {tab === 'math' && (
          <div className="w-full max-w-6xl mx-auto mt-2 px-0 sm:px-2">
            <MathMatchPanel />
          </div>
        )}
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
