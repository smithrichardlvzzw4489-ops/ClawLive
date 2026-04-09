'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

type TabId = 'lookup' | 'find' | 'outreach' | 'linkedin';

interface LinkedInResolveResponse {
  linkedinVanity: string | null;
  normalizedLinkedInUrl: string | null;
  fetchStatus: 'ok' | 'blocked' | 'empty' | 'invalid_url' | 'network_error';
  githubUsernames: string[];
  gitlabUsernames: string[];
  portfolioUrls: string[];
  pageTitleHint: string | null;
  guidanceZh: string;
}

interface QuotaDim { used: number; limit: number; remaining: number; ratio: number }
interface QuotaStatus {
  tier: string;
  month: string;
  dimensions: { profile_lookup: QuotaDim; search: QuotaDim; outreach: QuotaDim };
}

interface SearchResult {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  bio: string | null;
  location: string | null;
  stats?: { totalPublicRepos: number; totalStars: number; followers: number };
}

const SEARCH_PHASES = [
  { key: 'parsing', label: '理解你的需求', icon: '🧠' },
  { key: 'searching', label: '搜索 GitHub', icon: '🔍' },
  { key: 'enriching', label: '分析候选人', icon: '📊' },
  { key: 'ranking', label: 'AI 精排', icon: '🏆' },
] as const;

export default function CodernetIndexPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<TabId>('lookup');

  const [searchValue, setSearchValue] = useState('');

  const [findQuery, setFindQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [linkedinResolving, setLinkedinResolving] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<LinkedInResolveResponse | null>(null);
  const [linkedinError, setLinkedinError] = useState('');
  const [probingSite, setProbingSite] = useState<string | null>(null);
  const [probeHintByUrl, setProbeHintByUrl] = useState<Record<string, { githubUsername: string | null; gitlabUsername: string | null }>>({});

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
      .then((user) => { if (user?.username) router.replace(`/codernet/card/${encodeURIComponent(user.username)}`); else setChecking(false); })
      .catch(() => setChecking(false));
  }, [router]);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const val = searchValue.trim().replace(/^@/, '');
    if (!val) return;
    router.push(`/codernet/github/${encodeURIComponent(val)}`);
  };

  const handleLinkedInResolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!linkedinUrl.trim() || linkedinResolving) return;
    setLinkedinResolving(true);
    setLinkedinError('');
    setLinkedinResult(null);
    setProbeHintByUrl({});
    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/linkedin/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkedinUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLinkedinResult(data as LinkedInResolveResponse);
    } catch (err: unknown) {
      setLinkedinError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setLinkedinResolving(false);
    }
  };

  const probePortfolio = async (siteUrl: string) => {
    setProbingSite(siteUrl);
    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/linkedin/probe-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: siteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'probe failed');
      setProbeHintByUrl((prev) => ({
        ...prev,
        [siteUrl]: { githubUsername: data.githubUsername || null, gitlabUsername: data.gitlabUsername || null },
      }));
    } catch {
      setProbeHintByUrl((prev) => ({ ...prev, [siteUrl]: { githubUsername: null, gitlabUsername: null } }));
    } finally {
      setProbingSite(null);
    }
  };

  const handleFind = async (e: FormEvent) => {
    e.preventDefault();
    if (!findQuery.trim() || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    setSearchPhase('parsing');

    const phases = ['parsing', 'searching', 'enriching', 'ranking'];
    let phaseIdx = 0;
    const phaseTimer = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
      setSearchPhase(phases[phaseIdx]);
    }, 5000);

    try {
      const base = API_BASE_URL || '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/codernet/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: findQuery.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setSearchError(`本月搜索额度已用完（${data.quota?.used}/${data.quota?.limit}），下月自动重置`);
        fetchQuota();
        return;
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSearchResults(data.results || []);
      fetchQuota();
    } catch (err: any) {
      setSearchError(err.message || 'Search failed');
    } finally {
      clearInterval(phaseTimer);
      setSearchPhase('');
      setSearching(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 mb-6">
            <span className="text-xs font-mono text-violet-400 tracking-wider">CODERNET</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
            AI-Powered<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
              Developer Profile
            </span>
          </h1>

          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            查看任意开发者的 AI 画像，或描述你的需求找到匹配的开发者
          </p>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-xl mx-auto">
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
              onClick={() => setTab('linkedin')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'linkedin' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              LinkedIn → 画像
            </button>
            <button
              type="button"
              onClick={() => setTab('find')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'find' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              找开发者
            </button>
            <button
              type="button"
              onClick={() => setTab('outreach')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'outreach' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              批量外联
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

          {/* LinkedIn → Profile (HR) */}
          {tab === 'linkedin' && (
            <div className="max-w-lg mx-auto text-left">
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                粘贴候选人在 LinkedIn 的<strong className="text-slate-400">个人主页链接</strong>。我们会尝试从公开页面提取 GitHub、GitLab 或个人网站；若 LinkedIn 拦截访问，请按下方说明从页面手动复制 GitHub 用户名。
              </p>
              <form onSubmit={handleLinkedInResolve} className="mb-4">
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/candidate-name"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 transition"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!linkedinUrl.trim() || linkedinResolving}
                  className="mt-3 w-full py-3 rounded-xl bg-[#0a66c2]/90 hover:bg-[#0a66c2] disabled:bg-white/10 disabled:cursor-not-allowed text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {linkedinResolving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      正在解析页面…
                    </>
                  ) : (
                    '提取开发者链接并生成画像'
                  )}
                </button>
              </form>
              {linkedinError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 mb-4">{linkedinError}</div>
              )}
              {linkedinResult && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">状态</p>
                    <p className="text-xs text-slate-300">
                      {linkedinResult.fetchStatus === 'ok' && <span className="text-emerald-400">已获取页面</span>}
                      {linkedinResult.fetchStatus === 'blocked' && <span className="text-amber-400">无法读取完整页面（常见：需登录）</span>}
                      {linkedinResult.fetchStatus === 'empty' && <span className="text-amber-400">返回内容过少</span>}
                      {linkedinResult.fetchStatus === 'invalid_url' && <span className="text-red-400">链接无效</span>}
                      {linkedinResult.fetchStatus === 'network_error' && <span className="text-amber-400">网络错误</span>}
                    </p>
                    {linkedinResult.pageTitleHint && (
                      <p className="text-[11px] text-slate-500 mt-1 truncate" title={linkedinResult.pageTitleHint}>
                        页面标题线索：{linkedinResult.pageTitleHint}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{linkedinResult.guidanceZh}</p>
                  {linkedinResult.githubUsernames.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-mono mb-2">GitHub（点击生成画像）</p>
                      <div className="flex flex-wrap gap-2">
                        {linkedinResult.githubUsernames.map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => router.push(`/codernet/github/${encodeURIComponent(u)}`)}
                            className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-xs font-mono"
                          >
                            @{u}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {linkedinResult.gitlabUsernames.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-mono mb-2">GitLab（打开主页）</p>
                      <div className="flex flex-wrap gap-2">
                        {linkedinResult.gitlabUsernames.map((u) => (
                          <a
                            key={u}
                            href={`https://gitlab.com/${u}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg border border-[#fc6d26]/40 text-xs font-mono text-[#fc6d26] hover:bg-[#fc6d26]/10"
                          >
                            @{u} ↗
                          </a>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-2">完整技术画像目前以 GitHub 为主；若有 GitHub 请优先点上方按钮。</p>
                    </div>
                  )}
                  {linkedinResult.portfolioUrls.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-mono mb-2">个人网站 / 作品集</p>
                      <ul className="space-y-2">
                        {linkedinResult.portfolioUrls.map((u) => {
                          const hint = probeHintByUrl[u];
                          return (
                            <li key={u} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <a href={u} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline break-all flex-1 min-w-0">
                                  {u}
                                </a>
                                <button
                                  type="button"
                                  disabled={probingSite === u}
                                  onClick={() => probePortfolio(u)}
                                  className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-white shrink-0"
                                >
                                  {probingSite === u ? '探测中…' : '探测页内 GitHub'}
                                </button>
                              </div>
                              {hint?.githubUsername && (
                                <button
                                  type="button"
                                  onClick={() => router.push(`/codernet/github/${encodeURIComponent(hint.githubUsername!)}`)}
                                  className="mt-2 text-xs text-violet-300 hover:underline"
                                >
                                  使用 @{hint.githubUsername} 生成画像 →
                                </button>
                              )}
                              {hint && !hint.githubUsername && probingSite !== u && (
                                <p className="text-[10px] text-slate-600 mt-1">未在网站首页发现 GitHub 链接</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {linkedinResult.githubUsernames.length === 0 &&
                    (linkedinResult.fetchStatus !== 'ok' ||
                      (linkedinResult.portfolioUrls.length === 0 && linkedinResult.gitlabUsernames.length === 0)) && (
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-xs text-slate-500 space-y-2">
                      <p className="font-medium text-slate-400">手动步骤</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>在 LinkedIn 打开候选人主页 → 查看简介、Featured、联系方式中的网站或 GitHub</li>
                        <li>切换到「GitHub 画像」标签，输入 GitHub 用户名即可生成技术画像</li>
                        <li>若只有个人网站：把网站加入书签后，在下方列表点「探测页内 GitHub」</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Find Developer Tab */}
          {tab === 'find' && (
            <div className="max-w-lg mx-auto">
              <form onSubmit={handleFind}>
                <textarea
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  placeholder="描述你想找的开发者，AI 将实时搜索 GitHub 1.8亿+ 开发者：&#10;• 上海的 Rust 后端开发者，专注分布式系统&#10;• 全栈开发合伙人，懂 AI/ML，粉丝 1000+&#10;• 日本的 Go 开发者，做过开源基础设施项目"
                  rows={4}
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none resize-none focus:border-violet-500/40 transition"
                />
                <button
                  type="submit"
                  disabled={!findQuery.trim() || searching}
                  className="mt-3 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {searching ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      全网搜索中...
                    </>
                  ) : (
                    '全网搜索开发者'
                  )}
                </button>
              </form>

              {/* Phase progress bar during search */}
              {searching && (
                <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {SEARCH_PHASES.map((ph, i) => {
                      const active = searchPhase === ph.key;
                      const done = SEARCH_PHASES.findIndex((p) => p.key === searchPhase) > i;
                      return (
                        <div key={ph.key} className="flex items-center gap-1.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                            active ? 'bg-violet-600 scale-110 ring-2 ring-violet-400/50 shadow-lg shadow-violet-500/20' :
                            done ? 'bg-green-600/80' : 'bg-white/[0.06]'
                          }`}>
                            {done ? '✓' : ph.icon}
                          </div>
                          <span className={`text-[10px] hidden sm:inline ${active ? 'text-violet-300 font-semibold' : done ? 'text-green-400/70' : 'text-slate-600'}`}>
                            {ph.label}
                          </span>
                          {i < SEARCH_PHASES.length - 1 && (
                            <div className={`w-4 h-px ${done ? 'bg-green-600/50' : 'bg-white/[0.06]'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 animate-pulse">
                    {searchPhase === 'parsing' && 'AI 正在理解你的需求，转换为 GitHub 搜索条件...'}
                    {searchPhase === 'searching' && '正在从 GitHub 1.8亿+ 开发者中实时搜索...'}
                    {searchPhase === 'enriching' && '对 top 候选人进行深度分析，生成 AI 画像...'}
                    {searchPhase === 'ranking' && 'AI 精排中，找出最匹配的开发者...'}
                  </p>
                </div>
              )}

              {searchError && (
                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{searchError}</div>
              )}

              {searchResults !== null && searchResults.length === 0 && !searching && (
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-sm">没有找到匹配的开发者</p>
                  <p className="text-slate-600 text-xs mt-1">试试换个描述方式，或指定更具体的技术栈和要求</p>
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500 font-mono">Found {searchResults.length} developers from GitHub</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Live Search</span>
                  </div>
                  {searchResults.map((r) => (
                    <SearchResultCard key={r.githubUsername} result={r} onConnect={() => {
                      router.push(`/codernet/github/${r.githubUsername}?connect=1&from_query=${encodeURIComponent(findQuery)}`);
                    }} />
                  ))}
                </div>
              )}
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

          {/* Divider + login CTA */}
          <div className="flex items-center gap-3 max-w-md mx-auto my-8">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-slate-600 font-mono">OR</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-6 py-2.5 text-sm font-medium transition">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
            Login with GitHub to create your own card
          </Link>

          {/* Quota Usage Bar */}
          {quota && (
            <div className="mt-8 max-w-lg mx-auto w-full">
              <QuotaBar quota={quota} />
            </div>
          )}

          {/* Feature cards */}
          <div className="mt-10 grid grid-cols-3 sm:grid-cols-5 gap-3 text-center max-w-2xl mx-auto">
            {[
              { icon: '🔍', label: 'AI Search', desc: '全网语义搜索', href: '' },
              { icon: '📡', label: 'Outreach', desc: '批量个性化外联', href: '/codernet/outreach' },
              { icon: '📊', label: 'Profile', desc: 'AI 能力画像', href: '' },
              { icon: '🤖', label: 'Agent Chat', desc: 'AI 代先沟通', href: '' },
              { icon: '⚡', label: 'Token Usage', desc: 'AI 成本追踪', href: '/codernet/tokens' },
            ].map((f) => (
              f.href ? (
                <Link key={f.label} href={f.href} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 hover:border-violet-500/20 transition">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="text-xs font-semibold text-slate-200">{f.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
                </Link>
              ) : (
                <div key={f.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="text-xs font-semibold text-slate-200">{f.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResultCard({ result, onConnect }: { result: SearchResult; onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 text-left hover:border-violet-500/20 transition-all group">
      <div className="flex items-start gap-3">
        {result.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.avatarUrl} alt={result.githubUsername} className="w-12 h-12 rounded-xl border border-white/10 group-hover:border-violet-500/30 transition" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-violet-600/30 flex items-center justify-center text-lg font-bold">{result.githubUsername[0]?.toUpperCase()}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/codernet/github/${result.githubUsername}`} className="text-sm font-bold text-white hover:text-violet-300 transition truncate">
              @{result.githubUsername}
            </Link>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 shrink-0">
              {Math.round(result.score * 100)}%
            </span>
            {result.location && (
              <span className="text-[10px] text-slate-500">📍 {result.location}</span>
            )}
          </div>
          {result.bio && <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">{result.bio}</p>}
          {result.oneLiner && <p className="text-xs text-violet-300/80 mt-0.5 italic">&ldquo;{result.oneLiner}&rdquo;</p>}
          <p className="text-xs text-slate-400 mt-1">{result.reason}</p>
          {result.techTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.techTags.slice(0, 6).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 font-mono">{t}</span>
              ))}
            </div>
          )}
        </div>
        {result.stats && (
          <div className="text-right shrink-0 space-y-0.5">
            <div className="text-xs font-mono text-yellow-400/80">&#9733; {result.stats.totalStars.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">{result.stats.followers.toLocaleString()} followers</div>
            <div className="text-[10px] text-slate-600">{result.stats.totalPublicRepos} repos</div>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/codernet/github/${result.githubUsername}`}
          className="flex-1 text-center py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] transition"
        >
          View Profile
        </Link>
        <button
          onClick={onConnect}
          className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition"
        >
          Connect via Agent
        </button>
      </div>
    </div>
  );
}

const QUOTA_DIMS: { key: keyof QuotaStatus['dimensions']; label: string; icon: string; color: string }[] = [
  { key: 'profile_lookup', label: 'Profile 画像', icon: '📊', color: '#8b5cf6' },
  { key: 'search', label: '语义搜索', icon: '🔍', color: '#3b82f6' },
  { key: 'outreach', label: '外联触达', icon: '📡', color: '#10b981' },
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
