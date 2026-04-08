'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

type TabId = 'lookup' | 'find';

interface SearchResult {
  githubUsername: string;
  avatarUrl: string | null;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  stats?: { totalPublicRepos: number; totalStars: number; followers: number };
}

export default function CodernetIndexPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<TabId>('lookup');

  const [searchValue, setSearchValue] = useState('');

  const [findQuery, setFindQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

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

  const handleFind = async (e: FormEvent) => {
    e.preventDefault();
    if (!findQuery.trim() || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: findQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSearchResults(data.results || []);
    } catch (err: any) {
      setSearchError(err.message || 'Search failed');
    } finally {
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
          <div className="flex justify-center gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-md mx-auto">
            <button
              onClick={() => setTab('lookup')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                tab === 'lookup' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              查 GitHub 用户
            </button>
            <button
              onClick={() => setTab('find')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                tab === 'find' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              找开发者
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

          {/* Find Developer Tab */}
          {tab === 'find' && (
            <div className="max-w-lg mx-auto">
              <form onSubmit={handleFind}>
                <textarea
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  placeholder="描述你想找的开发者，例如：&#10;• 我需要一个擅长 Rust 和分布式系统的后端开发者&#10;• 找一个全栈开发合伙人，最好懂 AI/ML&#10;• 想找做开源项目的 Go 开发者交流"
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
                      AI 搜索中...
                    </>
                  ) : (
                    '搜索匹配的开发者'
                  )}
                </button>
              </form>

              {searchError && (
                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{searchError}</div>
              )}

              {searchResults !== null && searchResults.length === 0 && !searching && (
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-sm">没有找到匹配的开发者</p>
                  <p className="text-slate-600 text-xs mt-1">试试先用上方「查 GitHub 用户」生成一些画像，再来搜索</p>
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-xs text-slate-500 font-mono">Found {searchResults.length} developers</p>
                  {searchResults.map((r) => (
                    <SearchResultCard key={r.githubUsername} result={r} onConnect={() => {
                      router.push(`/codernet/github/${r.githubUsername}?connect=1&from_query=${encodeURIComponent(findQuery)}`);
                    }} />
                  ))}
                </div>
              )}
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

          {/* Feature cards */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center max-w-lg mx-auto">
            {[
              { icon: '🔍', label: 'AI Search', desc: '语义匹配开发者' },
              { icon: '🤖', label: 'Agent Chat', desc: 'AI 代先沟通' },
              { icon: '📊', label: 'Profile', desc: '能力雷达图' },
              { icon: '💬', label: 'Connect', desc: '确认后真人对接' },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-xs font-semibold text-slate-200">{f.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResultCard({ result, onConnect }: { result: SearchResult; onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left">
      <div className="flex items-start gap-3">
        {result.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.avatarUrl} alt={result.githubUsername} className="w-10 h-10 rounded-lg border border-white/10" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-violet-600/30 flex items-center justify-center text-lg font-bold">{result.githubUsername[0]?.toUpperCase()}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/codernet/github/${result.githubUsername}`} className="text-sm font-bold text-white hover:text-violet-300 transition truncate">
              @{result.githubUsername}
            </Link>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">{Math.round(result.score * 100)}% match</span>
          </div>
          {result.oneLiner && <p className="text-xs text-violet-300/80 mt-0.5">{result.oneLiner}</p>}
          <p className="text-xs text-slate-400 mt-1">{result.reason}</p>
          {result.techTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.techTags.slice(0, 5).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 font-mono">{t}</span>
              ))}
            </div>
          )}
        </div>
        {result.stats && (
          <div className="text-right shrink-0">
            <div className="text-xs font-mono text-slate-400">&#9733; {result.stats.totalStars}</div>
            <div className="text-[10px] text-slate-600">{result.stats.totalPublicRepos} repos</div>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/codernet/github/${result.githubUsername}`}
          className="flex-1 text-center py-1.5 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] transition"
        >
          View Profile
        </Link>
        <button
          onClick={onConnect}
          className="flex-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition"
        >
          Connect
        </button>
      </div>
    </div>
  );
}
