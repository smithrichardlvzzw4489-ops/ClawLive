'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

interface CrawlProgress {
  stage: string;
  percent: number;
  detail: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

interface TopRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
}

interface LookupResult {
  status: 'ready' | 'pending' | 'not_found';
  progress?: CrawlProgress | null;
  crawl?: {
    username: string;
    totalPublicRepos: number;
    totalStars: number;
    followers: number;
    following: number;
    bio: string | null;
    location: string | null;
    company: string | null;
    blog: string | null;
    repos: TopRepo[];
    languageStats: Record<string, number>;
  };
  analysis?: {
    techTags: string[];
    languageDistribution: Array<{ language: string; percent: number }>;
    capabilityQuadrant: { frontend: number; backend: number; infra: number; ai_ml: number };
    sharpCommentary: string;
    oneLiner: string;
    generatedAt: string;
  };
  avatarUrl?: string;
  cachedAt?: number;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Rust: '#dea584',
  Go: '#00add8', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', Swift: '#f05138',
  Kotlin: '#a97bff', Ruby: '#701516', PHP: '#4f5d95', Dart: '#00b4ab', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00', Lua: '#000080', Scala: '#c22d40',
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Preparing...',
  fetching_profile: 'Loading GitHub profile...',
  fetching_repos: 'Scanning repositories...',
  fetching_languages: 'Analyzing language stats...',
  fetching_commits: 'Reading commit history...',
  analyzing_with_ai: 'AI is generating profile...',
  saving_results: 'Finalizing...',
  complete: 'Done!',
  error: 'Something went wrong',
};

const STAGE_ORDER = ['queued', 'fetching_profile', 'fetching_repos', 'fetching_languages', 'fetching_commits', 'analyzing_with_ai', 'saving_results', 'complete'];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ProgressTimeline({ progress, ghUsername }: { progress: CrawlProgress | null; ghUsername: string }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(progress?.startedAt || Date.now());
  useEffect(() => { if (progress?.startedAt) startRef.current = progress.startedAt; }, [progress?.startedAt]);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(t);
  }, []);

  const currentStage = progress?.stage || 'queued';
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const percent = progress?.percent ?? 0;
  const isError = currentStage === 'error';
  const visibleStages = STAGE_ORDER.filter((s) => s !== 'queued' && s !== 'complete');

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-center gap-3 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://github.com/${ghUsername}.png?size=80`} alt="" className="w-10 h-10 rounded-full border border-white/10" />
        <div>
          <h1 className="text-lg text-white/90 font-bold">Scanning @{ghUsername}</h1>
          <p className="text-xs text-slate-500 font-mono">Building developer profile</p>
        </div>
      </div>

      <div className="relative mb-6">
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${isError ? 'bg-red-500' : 'bg-gradient-to-r from-violet-500 to-indigo-400'}`}
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] font-mono text-slate-500">{percent}%</span>
          <span className="text-[10px] font-mono text-slate-500">{formatElapsed(elapsed)}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleStages.map((stage, i) => {
          const stageIdx = STAGE_ORDER.indexOf(stage);
          const isDone = currentIdx > stageIdx;
          const isCurrent = currentStage === stage;
          return (
            <div key={stage} className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                {isDone ? (
                  <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                    <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                ) : isCurrent ? (
                  <div className="w-5 h-5 rounded-full border-2 border-violet-400 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" /></div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-white/10" />
                )}
                {i < visibleStages.length - 1 && <div className={`absolute left-[9px] top-5 w-0.5 h-2.5 ${isDone ? 'bg-violet-500/30' : 'bg-white/[0.06]'}`} />}
              </div>
              <span className={`text-xs font-mono transition-colors ${isDone ? 'text-slate-500' : isCurrent ? 'text-violet-300' : 'text-slate-600'}`}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {progress?.detail && <p className="mt-4 text-xs text-slate-500 font-mono text-center animate-pulse">{progress.detail}</p>}
      {isError && progress?.error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-300 font-mono">{progress.error}</p>
        </div>
      )}
    </div>
  );
}

function QuadrantChart({ data }: { data: { frontend: number; backend: number; infra: number; ai_ml: number } }) {
  const dims = [
    { key: 'frontend' as const, label: 'Frontend', angle: -90 },
    { key: 'backend' as const, label: 'Backend', angle: 0 },
    { key: 'infra' as const, label: 'Infra/DevOps', angle: 90 },
    { key: 'ai_ml' as const, label: 'AI/ML', angle: 180 },
  ];
  const size = 200, cx = 100, cy = 100, maxR = 80;
  const points = dims.map((d) => {
    const val = data[d.key] / 100;
    const rad = (d.angle * Math.PI) / 180;
    return { ...d, x: cx + Math.cos(rad) * maxR * val, y: cy + Math.sin(rad) * maxR * val, lx: cx + Math.cos(rad) * (maxR + 18), ly: cy + Math.sin(rad) * (maxR + 18), val: data[d.key] };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map((s) => <circle key={s} cx={cx} cy={cy} r={maxR * s} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />)}
      {dims.map((d) => { const rad = (d.angle * Math.PI) / 180; return <line key={d.key} x1={cx} y1={cy} x2={cx + Math.cos(rad) * maxR} y2={cy + Math.sin(rad) * maxR} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />; })}
      <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.7)" strokeWidth={1.5} />
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={p.x} cy={p.y} r={3} fill="#8b5cf6" />
          <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="central" className="fill-slate-400" fontSize={8} fontFamily="monospace">{p.label}</text>
          <text x={p.lx} y={p.ly + 10} textAnchor="middle" dominantBaseline="central" className="fill-violet-400" fontSize={7} fontWeight="bold" fontFamily="monospace">{p.val}</text>
        </g>
      ))}
    </svg>
  );
}

function LanguageBar({ langs }: { langs: Array<{ language: string; percent: number }> }) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {langs.map((l) => <div key={l.language} style={{ width: `${l.percent}%`, backgroundColor: LANG_COLORS[l.language] || '#666' }} title={`${l.language}: ${l.percent}%`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {langs.slice(0, 6).map((l) => (
          <span key={l.language} className="flex items-center gap-1 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: LANG_COLORS[l.language] || '#666' }} />
            {l.language} {l.percent}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function GitHubLookupCardPage() {
  const params = useParams<{ username: string }>();
  const ghUsername = params.username;
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggered, setTriggered] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = API_BASE_URL || '';

  const fetchStatus = useCallback(async (): Promise<LookupResult | null> => {
    const res = await fetch(`${base}/api/codernet/github/${encodeURIComponent(ghUsername)}`);
    return res.json() as Promise<LookupResult>;
  }, [base, ghUsername]);

  const triggerCrawl = useCallback(async () => {
    await fetch(`${base}/api/codernet/github/${encodeURIComponent(ghUsername)}`, { method: 'POST' });
    setTriggered(true);
    setResult({ status: 'pending', progress: { stage: 'queued', percent: 0, detail: 'Starting...', startedAt: Date.now(), updatedAt: Date.now() } });
  }, [base, ghUsername]);

  useEffect(() => {
    if (!ghUsername) return;
    fetchStatus()
      .then((data) => {
        if (data?.status === 'not_found') {
          triggerCrawl();
        } else {
          setResult(data);
        }
      })
      .catch(() => triggerCrawl())
      .finally(() => setLoading(false));
  }, [ghUsername, fetchStatus, triggerCrawl]);

  useEffect(() => {
    if (!result || result.status === 'ready') return;
    if (result.status === 'not_found' && !triggered) return;

    const interval = result.progress?.stage === 'error' ? 10_000 : 3_000;
    pollRef.current = setTimeout(async () => {
      try {
        const data = await fetchStatus();
        if (data) {
          setResult(data);
          setPollCount((c) => c + 1);
        }
      } catch { /* keep polling */ }
    }, interval);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [result, pollCount, triggered, fetchStatus]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  if (!result || result.status === 'pending' || (result.status === 'not_found' && triggered)) {
    const hasError = result?.progress?.stage === 'error';
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4">
        <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/10 blur-[160px]" />
        <div className="relative z-10 text-center w-full max-w-lg">
          <ProgressTimeline progress={result?.progress || null} ghUsername={ghUsername} />
          {hasError && (
            <button onClick={triggerCrawl} className="mt-6 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition">
              Retry
            </button>
          )}
          {!hasError && <p className="mt-6 text-[10px] text-slate-600 font-mono">Auto-refreshing every 3s</p>}
        </div>
      </div>
    );
  }

  if (result.status === 'not_found') {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl text-white/80 font-bold mb-2">User not found</h1>
          <p className="text-slate-400 text-sm mb-4">@{ghUsername} doesn't seem to exist on GitHub.</p>
          <Link href="/codernet" className="text-violet-400 text-sm hover:underline">Try another username</Link>
        </div>
      </div>
    );
  }

  const { crawl, analysis, avatarUrl } = result;

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/20 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/15 blur-[160px]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/codernet" className="text-xs font-mono text-violet-400 tracking-wider hover:text-violet-300 transition">CODERNET</Link>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">@{ghUsername}</span>
        </div>

        {/* Profile Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
          <div className="flex items-start gap-4 mb-5">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={ghUsername} className="w-16 h-16 rounded-xl border border-white/10" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-2xl font-bold">
                {ghUsername[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{crawl?.username || ghUsername}</h1>
              <a href={`https://github.com/${ghUsername}`} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-violet-400 transition font-mono">
                @{ghUsername}
              </a>
              {analysis?.oneLiner && <p className="mt-1 text-sm font-medium text-violet-300">{analysis.oneLiner}</p>}
              {crawl?.bio && <p className="mt-1 text-xs text-slate-500">{crawl.bio}</p>}
            </div>
          </div>

          {crawl && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Repos', value: crawl.totalPublicRepos },
                { label: 'Stars', value: crawl.totalStars },
                { label: 'Followers', value: crawl.followers },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-center">
                  <div className="text-lg font-bold font-mono text-white">{s.value.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {analysis?.sharpCommentary && (
            <div className="rounded-lg bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 px-4 py-3 mb-5">
              <p className="text-sm text-slate-200 leading-relaxed italic">&ldquo;{analysis.sharpCommentary}&rdquo;</p>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">— Codernet AI Analysis</p>
            </div>
          )}

          {analysis?.techTags && analysis.techTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {analysis.techTags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs font-mono text-slate-300">{tag}</span>
              ))}
            </div>
          )}

          {analysis?.languageDistribution && analysis.languageDistribution.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono">Languages</h3>
              <LanguageBar langs={analysis.languageDistribution} />
            </div>
          )}
        </div>

        {analysis?.capabilityQuadrant && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Capability Quadrant</h3>
            <QuadrantChart data={analysis.capabilityQuadrant} />
          </div>
        )}

        {crawl?.repos && crawl.repos.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Top Repositories</h3>
            <div className="grid gap-3">
              {crawl.repos.slice(0, 6).map((repo) => (
                <a key={repo.name} href={repo.html_url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 transition hover:bg-white/[0.06] hover:border-violet-500/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 group-hover:text-violet-300 transition truncate">{repo.name}</span>
                      {repo.language && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || '#666' }} />
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{repo.description}</p>}
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 font-mono">&#9733; {repo.stargazers_count}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="text-center py-4">
          <Link href="/codernet" className="text-violet-500 hover:text-violet-400 text-xs font-mono transition">
            ← Search another developer
          </Link>
          <span className="text-slate-700 mx-2">·</span>
          <span className="text-xs text-slate-600 font-mono">codernet by <Link href="/" className="text-violet-500 hover:text-violet-400 transition">clawlab.live</Link></span>
        </div>
      </div>
    </div>
  );
}
