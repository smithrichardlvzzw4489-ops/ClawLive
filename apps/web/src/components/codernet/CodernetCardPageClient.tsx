'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import {
  PortfolioDrillDown,
  type PortfolioDepthShape,
  type ActivityDeepDiveShape,
} from '@/components/codernet/PortfolioDrillDown';
import {
  type AIEngagement,
  AIEngagementCard,
  InfluenceBar,
  PlatformBadges,
  type ProfileMultiPlatformInsights,
} from '@/components/codernet/CodernetProfileExtras';
import { CapabilityQuadrantPanel } from '@/components/codernet/CapabilityQuadrantPanel';

export type CodernetCardVariant = 'public' | 'home' | 'mine';

function codernetLoginHref(v: CodernetCardVariant): string {
  if (v === 'mine') return '/login?redirect=/my/profile';
  if (v === 'home') return '/login?redirect=/';
  return '/login';
}

interface TopRepo {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  url: string;
}

interface CrawlProgress {
  stage: string;
  percent: number;
  detail: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

interface CodernetProfile {
  status: 'ready' | 'pending';
  message?: string;
  progress?: CrawlProgress | null;
  user: {
    username: string;
    avatarUrl: string | null;
    bio?: string | null;
    githubUsername: string | null;
    memberSince?: string;
  };
  github?: {
    /** GitHub 登录名（与 lookup 页主标题数据源一致） */
    username?: string;
    bio?: string | null;
    totalPublicRepos: number;
    totalStars: number;
    followers: number;
    topRepos: TopRepo[];
    repos?: Array<{
      name: string;
      full_name?: string;
      description: string | null;
      language: string | null;
      stars: number;
      forks?: number;
      topics?: string[];
      url: string;
      created_at?: string;
      pushed_at?: string;
    }>;
    recentCommits?: Array<{ repo: string; message: string; date: string }>;
    portfolioDepth?: PortfolioDepthShape | null;
    location: string | null;
    company: string | null;
    blog: string | null;
  } | null;
  analysis?: {
    techTags: string[];
    languageDistribution: Array<{ language: string; percent: number }>;
    capabilityQuadrant: {
      frontend: number;
      backend: number;
      infra: number;
      ai_ml: number;
    };
    sharpCommentary: string;
    oneLiner: string;
    generatedAt: string;
    activityDeepDive?: ActivityDeepDiveShape;
    platformsUsed?: string[];
    multiPlatformInsights?: ProfileMultiPlatformInsights;
    aiEngagement?: AIEngagement;
  };
  crawledAt?: string;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Dart: '#00b4ab',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Lua: '#000080',
  Scala: '#c22d40',
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Preparing...',
  decrypting_token: 'Authenticating...',
  fetching_profile: 'Loading GitHub profile...',
  fetching_repos: 'Scanning repositories...',
  fetching_languages: 'Analyzing language stats...',
  fetching_commits: 'Fetching commits from GitHub...',
  analyzing_with_ai: 'AI is generating your profile...',
  saving_results: 'Saving results...',
  complete: 'Done!',
  error: 'Something went wrong',
};

const STAGE_ORDER = [
  'queued',
  'decrypting_token',
  'fetching_profile',
  'fetching_repos',
  'fetching_languages',
  'fetching_commits',
  'analyzing_with_ai',
  'saving_results',
  'complete',
];

function LanguageBar({ langs }: { langs: Array<{ language: string; percent: number }> }) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {langs.map((l) => (
          <div
            key={l.language}
            style={{
              width: `${l.percent}%`,
              backgroundColor: LANG_COLORS[l.language] || '#666',
            }}
            title={`${l.language}: ${l.percent}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {langs.slice(0, 6).map((l) => (
          <span key={l.language} className="flex items-center gap-1 text-xs text-slate-400">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: LANG_COLORS[l.language] || '#666' }}
            />
            {l.language} {l.percent}%
          </span>
        ))}
      </div>
    </div>
  );
}

interface MeUser {
  username: string;
  githubUsername?: string | null;
}

function JobSeekerAssistCard({
  profileShareUrl,
  githubUsername,
  analysis,
  onRecrawl,
  recrawlBusy,
}: {
  profileShareUrl: string;
  githubUsername: string | null | undefined;
  analysis: CodernetProfile['analysis'];
  onRecrawl: () => void;
  recrawlBusy: boolean;
}) {
  const [hint, setHint] = useState('');

  const pitchText = useMemo(() => {
    const lines: string[] = [];
    if (profileShareUrl) lines.push(`技术画像：${profileShareUrl}`);
    if (githubUsername) lines.push(`GitHub：https://github.com/${githubUsername}`);
    if (analysis?.oneLiner) lines.push(`一句话：${analysis.oneLiner}`);
    if (analysis?.sharpCommentary) lines.push(`AI 评价：${analysis.sharpCommentary}`);
    if (analysis?.techTags?.length) lines.push(`技术标签：${analysis.techTags.join('、')}`);
    return lines.join('\n');
  }, [profileShareUrl, githubUsername, analysis]);

  const flash = (msg: string) => {
    setHint(msg);
    setTimeout(() => setHint(''), 2500);
  };

  const copyPitch = async () => {
    if (!pitchText.trim()) {
      flash('暂无可复制内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(pitchText);
      flash('已复制投递用简介');
    } catch {
      flash('复制失败，请手动选择');
    }
  };

  const copyLink = async () => {
    if (!profileShareUrl) return;
    try {
      await navigator.clipboard.writeText(profileShareUrl);
      flash('已复制画像链接');
    } catch {
      flash('复制失败');
    }
  };

  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-950/25 p-4">
      <h3 className="text-sm font-semibold text-teal-200 mb-1">本页使用说明</h3>
      <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
        这是你在 <strong className="text-slate-300">GITLINK</strong> 上的<strong className="text-slate-300">公开技术名片</strong>：招聘方会从这里看栈与项目时间线；你也可以把它当作投递时的统一「对外叙事」草稿。
      </p>
      <ul className="text-[11px] text-slate-500 mb-3 list-disc pl-4 space-y-1 leading-relaxed">
        <li>在邮件/表单里附上画像链接，减少重复自我介绍。</li>
        <li>修改 GitHub 简介或仓库后，可用此处「刷新画像」同步最新公开信息。</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyPitch()}
          className="px-3 py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-xs font-medium text-white transition"
        >
          复制「投递用简介」
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!profileShareUrl}
          className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/10 disabled:opacity-40 text-xs font-medium text-slate-200 transition"
        >
          仅复制画像链接
        </button>
        <button
          type="button"
          onClick={onRecrawl}
          disabled={recrawlBusy}
          className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/10 disabled:opacity-50 text-xs font-medium text-slate-300 transition"
        >
          {recrawlBusy ? '已触发…' : '刷新画像（重扫 GitHub）'}
        </button>
      </div>
      {hint ? <p className="text-[11px] text-teal-400/90 mt-2 font-mono">{hint}</p> : null}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function ProgressTimeline({ progress }: { progress: CrawlProgress | null }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(progress?.startedAt || Date.now());

  useEffect(() => {
    if (progress?.startedAt) startRef.current = progress.startedAt;
  }, [progress?.startedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentStage = progress?.stage || 'queued';
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const percent = progress?.percent ?? 0;
  const isError = currentStage === 'error';

  const visibleStages = STAGE_ORDER.filter((s) => s !== 'queued' && s !== 'decrypting_token' && s !== 'complete');

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress bar */}
      <div className="relative mb-6">
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isError ? 'bg-red-500' : 'bg-gradient-to-r from-violet-500 to-indigo-400'
            }`}
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] font-mono text-slate-500">{percent}%</span>
          <span className="text-[10px] font-mono text-slate-500">{formatElapsed(elapsed)}</span>
        </div>
      </div>

      {/* Stage timeline */}
      <div className="space-y-2.5">
        {visibleStages.map((stage, i) => {
          const stageIdx = STAGE_ORDER.indexOf(stage);
          const isDone = currentIdx > stageIdx;
          const isCurrent = currentStage === stage;
          const isPending = currentIdx < stageIdx;

          return (
            <div key={stage} className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                {isDone ? (
                  <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                    <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  <div className="w-5 h-5 rounded-full border-2 border-violet-400 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-white/10" />
                )}
                {i < visibleStages.length - 1 && (
                  <div
                    className={`absolute left-[9px] top-5 w-0.5 h-2.5 ${
                      isDone ? 'bg-violet-500/30' : 'bg-white/[0.06]'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-xs font-mono transition-colors ${
                  isDone
                    ? 'text-slate-500'
                    : isCurrent
                      ? 'text-violet-300'
                      : 'text-slate-600'
                }`}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current detail text */}
      {progress?.detail && (
        <p className="mt-4 text-xs text-slate-500 font-mono text-center animate-pulse">
          {progress.detail}
        </p>
      )}

      {/* Error display */}
      {isError && progress?.error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-300 font-mono">{progress.error}</p>
        </div>
      )}
    </div>
  );
}

export function CodernetCardPageClient({
  username,
  variant = 'public',
}: {
  username: string;
  variant?: CodernetCardVariant;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CodernetProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [me, setMe] = useState<MeUser | null>(null);
  const [recrawlBusy, setRecrawlBusy] = useState(false);
  const [pageOrigin, setPageOrigin] = useState('');

  const fetchProfile = useCallback(async () => {
    if (!username) return null;
    const base = API_BASE_URL || '';
    const res = await fetch(`${base}/api/codernet/profile/${encodeURIComponent(username)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<CodernetProfile>;
  }, [username]);

  useEffect(() => {
    if (!username) return;
    fetchProfile()
      .then((data) => {
        if (data) setProfile(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username, fetchProfile]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setMe(null);
      return;
    }
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: MeUser | null) => {
        if (u?.username) setMe(u);
        else setMe(null);
      })
      .catch(() => setMe(null));
  }, [username]);

  useEffect(() => {
    if (typeof window !== 'undefined') setPageOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!profile || profile.status !== 'pending') return;

    const doPoll = async () => {
      try {
        const data = await fetchProfile();
        if (data) {
          setProfile(data);
          setPollCount((c) => c + 1);
        }
      } catch {
        // keep polling on fetch errors
      }
    };

    const interval = profile.progress?.stage === 'error' ? 10_000 : 3_000;
    pollRef.current = setTimeout(doPoll, interval);

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [profile, pollCount, fetchProfile]);

  const startCrawl = useCallback(async (): Promise<boolean> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push(codernetLoginHref(variant));
      return false;
    }
    const base = API_BASE_URL || '';
    try {
      const res = await fetch(`${base}/api/codernet/crawl`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              status: 'pending',
              progress: {
                stage: 'queued',
                percent: 0,
                detail: 'Restarting...',
                startedAt: Date.now(),
                updatedAt: Date.now(),
              },
            }
          : prev,
      );
      setPollCount(0);
      return true;
    } catch {
      return false;
    }
  }, [router, variant]);

  const handleRetry = async () => {
    await startCrawl();
  };

  const handleRecrawlFromAssist = () => {
    setRecrawlBusy(true);
    void startCrawl().finally(() => setRecrawlBusy(false));
  };

  const profileShareUrl =
    pageOrigin && username ? `${pageOrigin}/codernet/card/${encodeURIComponent(username)}` : '';

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="text-white/50 text-sm font-mono">Connecting...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f] p-4">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4 opacity-30">&#x1f50d;</div>
          <h1 className="text-xl text-white/80 font-bold mb-2">Profile Not Found</h1>
          <p className="text-slate-400 text-sm mb-6">
            {error || `@${username} hasn't connected their GitHub account yet.`}
          </p>
          <Link href={codernetLoginHref(variant)} className="text-violet-400 text-sm hover:underline">
            Login with GitHub to create your card
          </Link>
        </div>
      </div>
    );
  }

  if (profile.status === 'pending') {
    const hasError = profile.progress?.stage === 'error';
    const stuckThreshold = 120_000;
    const isStuck =
      !hasError &&
      profile.progress?.updatedAt &&
      Date.now() - profile.progress.updatedAt > stuckThreshold;

    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f] p-4">
        <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/10 blur-[160px]" />
        <div className="relative z-10 text-center w-full max-w-lg px-4">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {profile.user.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.user.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-white/10" />
            )}
            <div>
              <h1 className="text-lg text-white/90 font-bold">
                Scanning @{profile.user.githubUsername || username}
              </h1>
              <p className="text-xs text-slate-500 font-mono">Building your developer profile</p>
            </div>
          </div>

          {/* Progress */}
          <ProgressTimeline progress={profile.progress || null} />

          {/* Action buttons */}
          {(hasError || isStuck) && (
            <div className="mt-6 space-y-3">
              {isStuck && !hasError && (
                <p className="text-xs text-amber-400/70 font-mono">
                  This is taking longer than expected...
                </p>
              )}
              <button
                onClick={handleRetry}
                className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition"
              >
                Retry Analysis
              </button>
              <p className="text-[10px] text-slate-600">
                If the problem persists, try{' '}
                <Link href={codernetLoginHref(variant)} className="text-violet-400 hover:underline">
                  re-logging in with GitHub
                </Link>
              </p>
            </div>
          )}

          {!hasError && !isStuck && (
            <p className="mt-6 text-[10px] text-slate-600 font-mono">
              Auto-refreshing every 3 seconds
            </p>
          )}
        </div>
      </div>
    );
  }

  const { analysis, github } = profile;
  const isCardOwner = !!(me?.username && username && me.username === username && profile.user.githubUsername);
  const platforms =
    analysis?.platformsUsed && analysis.platformsUsed.length > 0 ? analysis.platformsUsed : ['GitHub'];
  const insights = analysis?.multiPlatformInsights;
  const showInfluence = !!(
    insights &&
    (insights.communityInfluenceScore != null ||
      insights.knowledgeSharingScore != null ||
      insights.packageImpactScore != null ||
      insights.aiMlImpactScore != null ||
      insights.algorithmScore != null)
  );
  const displayTitle =
    (github?.username && String(github.username).trim()) || profile.user.githubUsername || profile.user.username;
  const displayBio = github?.bio ?? profile.user.bio ?? null;
  const breadcrumbHandle = profile.user.githubUsername || username;
  const portfolioHasRepos = !!(github?.repos && github.repos.length > 0);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/20 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/15 blur-[160px]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="text-xs font-mono text-violet-400 tracking-wider hover:text-violet-300 transition">
            GITLINK
          </Link>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">@{breadcrumbHandle}</span>
        </div>

        {/* Profile card — same block order as /codernet/github/:user */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
          <div className="flex items-start gap-4 mb-4">
            {profile.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.user.avatarUrl}
                alt={profile.user.username}
                className="w-16 h-16 rounded-xl border border-white/10"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-2xl font-bold">
                {profile.user.username[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{displayTitle}</h1>
              {profile.user.githubUsername && (
                <a
                  href={`https://github.com/${profile.user.githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-violet-400 transition font-mono"
                >
                  @{profile.user.githubUsername}
                </a>
              )}
              {analysis?.oneLiner && (
                <p className="mt-1 text-sm font-medium text-violet-300">{analysis.oneLiner}</p>
              )}
              {displayBio ? <p className="mt-1 text-xs text-slate-500">{displayBio}</p> : null}
            </div>
          </div>

          {platforms.length > 1 && (
            <div className="mb-4">
              <PlatformBadges platforms={platforms} />
            </div>
          )}

          {github && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Repos', value: github.totalPublicRepos },
                { label: 'Stars', value: github.totalStars },
                { label: 'Followers', value: github.followers },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-center"
                >
                  <div className="text-lg font-bold font-mono text-white">{s.value.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {analysis?.sharpCommentary && (
            <div className="rounded-lg bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 px-4 py-3 mb-5">
              <p className="text-sm text-slate-200 leading-relaxed italic">
                &ldquo;{analysis.sharpCommentary}&rdquo;
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                — GITLINK AI · {platforms.join(' + ')} Analysis
              </p>
            </div>
          )}

          {analysis?.techTags && analysis.techTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {analysis.techTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs font-mono text-slate-300"
                >
                  {tag}
                </span>
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

        {analysis?.aiEngagement && (
          <div className="mb-6">
            <AIEngagementCard data={analysis.aiEngagement} />
          </div>
        )}

        {showInfluence && insights && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">
              Cross-Platform Influence
            </h3>
            <div className="space-y-3">
              {insights.communityInfluenceScore != null && (
                <InfluenceBar label="Community" score={insights.communityInfluenceScore} color="#8b5cf6" />
              )}
              {insights.aiMlImpactScore != null && (
                <InfluenceBar label="AI/ML" score={insights.aiMlImpactScore} color="#ffcc00" />
              )}
              {insights.algorithmScore != null && (
                <InfluenceBar label="Algorithm" score={insights.algorithmScore} color="#ffa116" />
              )}
              {insights.knowledgeSharingScore != null && (
                <InfluenceBar label="Knowledge" score={insights.knowledgeSharingScore} color="#f48024" />
              )}
              {insights.packageImpactScore != null && (
                <InfluenceBar label="Package" score={insights.packageImpactScore} color="#cb3837" />
              )}
            </div>
          </div>
        )}

        {analysis?.capabilityQuadrant && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <CapabilityQuadrantPanel data={analysis.capabilityQuadrant} />
          </div>
        )}

        {portfolioHasRepos && github?.repos && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <PortfolioDrillDown
              portfolioDepth={github.portfolioDepth ?? null}
              repos={github.repos.map((r) => ({
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                language: r.language,
                stars: r.stars,
                forks: r.forks,
                topics: r.topics,
                url: r.url,
                created_at: r.created_at,
                pushed_at: r.pushed_at,
              }))}
              recentCommits={github.recentCommits ?? []}
              activityDeepDive={analysis?.activityDeepDive ?? null}
            />
          </div>
        )}

        {!portfolioHasRepos && github?.topRepos && github.topRepos.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Top Repositories</h3>
            <div className="grid gap-3">
              {github.topRepos.map((repo) => (
                <a
                  key={repo.name}
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 transition hover:bg-white/[0.06] hover:border-violet-500/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 group-hover:text-violet-300 transition truncate">
                        {repo.name}
                      </span>
                      {repo.language && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: LANG_COLORS[repo.language] || '#666' }}
                          />
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{repo.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 font-mono">&#9733; {repo.stars}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {isCardOwner && profile.status === 'ready' && analysis && (
          <div className="mt-8 mb-4">
            <JobSeekerAssistCard
              profileShareUrl={profileShareUrl}
              githubUsername={profile.user.githubUsername}
              analysis={analysis}
              onRecrawl={handleRecrawlFromAssist}
              recrawlBusy={recrawlBusy}
            />
          </div>
        )}

        <div className="text-center py-4">
          <Link href="/" className="text-violet-500 hover:text-violet-400 text-xs font-mono transition">
            {variant === 'mine' ? '← 查看其他开发者画像' : '← GITLINK 首页'}
          </Link>
          <span className="text-slate-700 mx-2">·</span>
          <span className="text-xs text-slate-600 font-mono">GITLINK</span>
          {profile.crawledAt && (
            <span className="block mt-2 text-[10px] text-slate-600 font-mono">
              last scanned {new Date(profile.crawledAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
