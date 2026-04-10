'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
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
} from '@/components/codernet/CodernetProfileExtras';
import { CapabilityQuadrantPanel } from '@/components/codernet/CapabilityQuadrantPanel';
import { CodernetPortraitShareBar } from '@/components/codernet/CodernetPortraitShareBar';

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
  forks_count?: number;
  topics?: string[];
  html_url: string;
  created_at?: string;
  pushed_at?: string;
}

interface MultiPlatformInsights {
  stackOverflowReputation?: number;
  stackOverflowTopTags?: string[];
  npmPackageCount?: number;
  npmTotalWeeklyDownloads?: number;
  pypiPackageCount?: number;
  devtoArticleCount?: number;
  devtoTotalReactions?: number;
  hfModelCount?: number;
  hfDatasetCount?: number;
  hfSpaceCount?: number;
  hfTotalDownloads?: number;
  hfTopPipelineTags?: string[];
  gitlabProjects?: number;
  leetcodeSolved?: number;
  leetcodeRating?: number | null;
  kaggleTier?: string;
  kaggleMedals?: number;
  codeforcesRating?: number;
  codeforcesRank?: string;
  dockerPulls?: number;
  cratesCount?: number;
  cratesTotalDownloads?: number;
  communityInfluenceScore?: number;
  knowledgeSharingScore?: number;
  packageImpactScore?: number;
  aiMlImpactScore?: number;
  algorithmScore?: number;
}

interface GitLabProject { name: string; description: string | null; stars: number; forks: number; url: string; lastActivity: string }
interface GitLabData { username: string; name: string; publicRepos: number; followers: number; topProjects: GitLabProject[]; profileUrl: string }

interface LeetCodeData { username: string; totalSolved: number; easySolved: number; mediumSolved: number; hardSolved: number; contestRating: number | null; contestGlobalRanking: number | null; contestAttended: number; badges: string[]; profileUrl: string }

interface KaggleData { username: string; displayName: string; tier: string; points: number; goldMedals: number; silverMedals: number; bronzeMedals: number; totalCompetitions: number; totalDatasets: number; totalNotebooks: number; profileUrl: string }

interface CodeforcesData { handle: string; rating: number; maxRating: number; rank: string; maxRank: string; contestCount: number; profileUrl: string }

interface DockerRepo { name: string; pullCount: number; starCount: number; lastUpdated: string }
interface DockerHubData { username: string; repositories: DockerRepo[]; totalPulls: number; totalStars: number; profileUrl: string }

interface CrateInfo { name: string; description: string | null; downloads: number; maxVersion: string }
interface CratesIoData { username: string; crates: CrateInfo[]; totalDownloads: number; totalCrates: number; profileUrl: string }

interface IdentityGraphLink { source: { platform: string }; target: { platform: string; username: string; profileUrl: string }; method: string; confidence: number }
interface IdentityGraph { platforms: string[]; links: IdentityGraphLink[]; overallConfidence: number }

interface SOProfile {
  displayName: string;
  reputation: number;
  goldBadges: number;
  silverBadges: number;
  bronzeBadges: number;
  answerCount: number;
  questionCount: number;
  topTags: Array<{ name: string; answerCount: number; answerScore: number }>;
  profileUrl: string;
}

interface NpmPkg {
  name: string;
  description: string;
  version: string;
  weeklyDownloads: number;
  keywords: string[];
}

interface PyPIPkg {
  name: string;
  summary: string;
  version: string;
  projectUrl: string;
}

interface DevToArticle {
  title: string;
  url: string;
  positiveReactions: number;
  publishedAt: string;
  tags: string[];
}

interface DevToProfileData {
  username: string;
  name: string;
  articlesCount: number;
  totalReactions: number;
  totalComments: number;
  followers: number;
  topArticles: DevToArticle[];
}

interface HFModel {
  modelId: string;
  likes: number;
  downloads: number;
  pipelineTag: string | null;
  tags: string[];
}

interface HFDataset {
  id: string;
  likes: number;
  downloads: number;
}

interface HFSpace {
  id: string;
  likes: number;
  sdk: string | null;
}

interface HuggingFaceProfileData {
  username: string;
  models: HFModel[];
  datasets: HFDataset[];
  spaces: HFSpace[];
  totalLikes: number;
  totalDownloads: number;
  topPipelineTags: string[];
  profileUrl: string;
}

interface MultiPlatformData {
  stackOverflow: SOProfile | null;
  npmPackages: NpmPkg[];
  pypiPackages: PyPIPkg[];
  devto: DevToProfileData | null;
  huggingface: HuggingFaceProfileData | null;
  gitlab: GitLabData | null;
  leetcode: LeetCodeData | null;
  kaggle: KaggleData | null;
  codeforces: CodeforcesData | null;
  dockerhub: DockerHubData | null;
  cratesio: CratesIoData | null;
  identityGraph?: IdentityGraph | null;
  identityLinks: Record<string, { matched: boolean; [k: string]: any }>;
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
    recentCommits?: Array<{ repo: string; message: string; date: string }>;
    portfolioDepth?: PortfolioDepthShape | null;
  };
  analysis?: {
    techTags: string[];
    languageDistribution: Array<{ language: string; percent: number }>;
    capabilityQuadrant: { frontend: number; backend: number; infra: number; ai_ml: number };
    sharpCommentary: string;
    oneLiner: string;
    generatedAt: string;
    platformsUsed?: string[];
    multiPlatformInsights?: MultiPlatformInsights;
    aiEngagement?: AIEngagement;
    activityDeepDive?: ActivityDeepDiveShape;
  };
  multiPlatform?: MultiPlatformData | null;
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
  crawling_platforms: 'Scanning Stack Overflow, npm, PyPI, DEV.to...',
  analyzing_with_ai: 'AI is generating unified profile...',
  saving_results: 'Finalizing...',
  complete: 'Done!',
  error: 'Something went wrong',
};

const STAGE_ORDER = ['queued', 'fetching_profile', 'fetching_repos', 'fetching_languages', 'fetching_commits', 'crawling_platforms', 'analyzing_with_ai', 'saving_results', 'complete'];

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

function StackOverflowCard({ data }: { data: SOProfile }) {
  return (
    <div className="rounded-xl border border-[#f48024]/20 bg-[#f48024]/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-[#f48024] flex items-center justify-center text-[10px] font-bold text-white">SO</div>
        <h4 className="text-xs font-bold text-[#f48024]">Stack Overflow</h4>
        <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-slate-500 hover:text-[#f48024] transition">View Profile →</a>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.reputation.toLocaleString()}</div>
          <div className="text-[9px] text-slate-500 uppercase">Reputation</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.answerCount}</div>
          <div className="text-[9px] text-slate-500 uppercase">Answers</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="text-yellow-400 font-bold text-sm">{data.goldBadges}</span>
            <span className="text-slate-400 text-xs">/</span>
            <span className="text-slate-300 font-bold text-sm">{data.silverBadges}</span>
            <span className="text-slate-400 text-xs">/</span>
            <span className="text-amber-700 font-bold text-sm">{data.bronzeBadges}</span>
          </div>
          <div className="text-[9px] text-slate-500 uppercase">Badges</div>
        </div>
      </div>
      {data.topTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.topTags.slice(0, 6).map((t) => (
            <span key={t.name} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#f48024]/10 text-[#f48024]/80 border border-[#f48024]/20">
              {t.name} <span className="text-[#f48024]/50">({t.answerScore})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NpmPackagesCard({ packages }: { packages: NpmPkg[] }) {
  const totalDl = packages.reduce((s, p) => s + p.weeklyDownloads, 0);
  return (
    <div className="rounded-xl border border-[#cb3837]/20 bg-[#cb3837]/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-[#cb3837] flex items-center justify-center text-[10px] font-bold text-white">n</div>
        <h4 className="text-xs font-bold text-[#cb3837]">npm Packages</h4>
        <span className="ml-auto text-[10px] text-slate-500">{packages.length} pkgs · {totalDl.toLocaleString()}/week</span>
      </div>
      <div className="space-y-2">
        {packages.slice(0, 4).map((pkg) => (
          <div key={pkg.name} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-slate-200 truncate">{pkg.name} <span className="text-slate-600">v{pkg.version}</span></div>
              {pkg.description && <p className="text-[10px] text-slate-500 line-clamp-1">{pkg.description}</p>}
            </div>
            <span className="text-[10px] font-mono text-[#cb3837]/70 shrink-0">{pkg.weeklyDownloads.toLocaleString()}/w</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PyPIPackagesCard({ packages }: { packages: PyPIPkg[] }) {
  return (
    <div className="rounded-xl border border-[#3775a9]/20 bg-[#3775a9]/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-[#3775a9] flex items-center justify-center text-[10px] font-bold text-white">Py</div>
        <h4 className="text-xs font-bold text-[#3775a9]">PyPI Packages</h4>
        <span className="ml-auto text-[10px] text-slate-500">{packages.length} pkgs</span>
      </div>
      <div className="space-y-2">
        {packages.slice(0, 4).map((pkg) => (
          <a key={pkg.name} href={pkg.projectUrl} target="_blank" rel="noopener noreferrer" className="block group">
            <div className="text-xs font-mono text-slate-200 group-hover:text-[#3775a9] transition truncate">{pkg.name} <span className="text-slate-600">v{pkg.version}</span></div>
            {pkg.summary && <p className="text-[10px] text-slate-500 line-clamp-1">{pkg.summary}</p>}
          </a>
        ))}
      </div>
    </div>
  );
}

function DevToCard({ data }: { data: DevToProfileData }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-white flex items-center justify-center text-[10px] font-bold text-black">D</div>
        <h4 className="text-xs font-bold text-white">DEV.to</h4>
        <span className="ml-auto text-[10px] text-slate-500">{data.articlesCount} articles · {data.totalReactions} reactions</span>
      </div>
      <div className="space-y-2">
        {data.topArticles.slice(0, 3).map((a) => (
          <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="block group">
            <div className="text-xs text-slate-200 group-hover:text-violet-300 transition line-clamp-1">{a.title}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-pink-400/70">❤ {a.positiveReactions}</span>
              {a.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[9px] text-slate-600">#{tag}</span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function GitLabCard({ data }: { data: GitLabData }) {
  return (
    <div className="rounded-lg border border-[#fc6d26]/20 bg-[#fc6d26]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#fc6d26' }}>GitLab</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.username} ↗</a>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{data.publicRepos} projects · {data.followers} followers</span>
      </div>
      {data.topProjects.slice(0, 5).map((p) => (
        <div key={p.name} className="flex items-center justify-between py-1 border-t border-white/[0.04]">
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-300 hover:text-white truncate">{p.name}</a>
          <span className="text-[10px] text-slate-500 font-mono">★{p.stars}</span>
        </div>
      ))}
    </div>
  );
}

function LeetCodeCard({ data }: { data: LeetCodeData }) {
  const total = data.easySolved + data.mediumSolved + data.hardSolved;
  return (
    <div className="rounded-lg border border-[#ffa116]/20 bg-[#ffa116]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#ffa116' }}>LeetCode</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.username} ↗</a>
        </div>
        {data.contestRating && <span className="text-xs font-mono text-amber-400">Rating {data.contestRating}</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{total}</div>
          <div className="text-[9px] text-slate-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{data.easySolved}</div>
          <div className="text-[9px] text-slate-500">Easy</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-400">{data.mediumSolved}</div>
          <div className="text-[9px] text-slate-500">Medium</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-400">{data.hardSolved}</div>
          <div className="text-[9px] text-slate-500">Hard</div>
        </div>
      </div>
      {data.contestAttended > 0 && (
        <div className="text-[10px] text-slate-500 mt-1">
          {data.contestAttended} contests · Global #{data.contestGlobalRanking?.toLocaleString() || 'N/A'}
        </div>
      )}
    </div>
  );
}

const KAGGLE_TIER_COLORS: Record<string, string> = {
  Grandmaster: '#d4af37', Master: '#ff6600', Expert: '#20beff', Contributor: '#5bc500', Novice: '#999',
};

function KaggleCard({ data }: { data: KaggleData }) {
  const tierColor = KAGGLE_TIER_COLORS[data.tier] || '#999';
  return (
    <div className="rounded-lg border border-[#20beff]/20 bg-[#20beff]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#20beff' }}>Kaggle</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.username} ↗</a>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: tierColor, backgroundColor: `${tierColor}20`, border: `1px solid ${tierColor}40` }}>
          {data.tier}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span>🥇 {data.goldMedals}</span>
        <span>🥈 {data.silverMedals}</span>
        <span>🥉 {data.bronzeMedals}</span>
        <span className="text-slate-500 font-mono ml-auto">{data.points.toLocaleString()} pts</span>
      </div>
      {(data.totalCompetitions > 0 || data.totalNotebooks > 0) && (
        <div className="text-[10px] text-slate-500 mt-2">
          {data.totalCompetitions} competitions · {data.totalDatasets} datasets · {data.totalNotebooks} notebooks
        </div>
      )}
    </div>
  );
}

const CF_RANK_COLORS: Record<string, string> = {
  legendary_grandmaster: '#ff0000', international_grandmaster: '#ff0000', grandmaster: '#ff0000',
  international_master: '#ff8c00', master: '#ff8c00', candidate_master: '#aa00aa',
  expert: '#0000ff', specialist: '#03a89e', pupil: '#008000', newbie: '#808080',
};

function CodeforcesCard({ data }: { data: CodeforcesData }) {
  const rankColor = CF_RANK_COLORS[data.rank.replace(/\s/g, '_').toLowerCase()] || '#999';
  return (
    <div className="rounded-lg border border-[#1f8acb]/20 bg-[#1f8acb]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#1f8acb' }}>Codeforces</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.handle} ↗</a>
        </div>
        <span className="text-xs font-bold" style={{ color: rankColor }}>{data.rank}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-white font-mono">{data.rating}</div>
          <div className="text-[9px] text-slate-500">Rating</div>
        </div>
        <div>
          <div className="text-lg font-bold text-slate-400 font-mono">{data.maxRating}</div>
          <div className="text-[9px] text-slate-500">Max Rating</div>
        </div>
        <div>
          <div className="text-lg font-bold text-slate-400 font-mono">{data.contestCount}</div>
          <div className="text-[9px] text-slate-500">Contests</div>
        </div>
      </div>
    </div>
  );
}

function DockerHubCard({ data }: { data: DockerHubData }) {
  return (
    <div className="rounded-lg border border-[#2496ed]/20 bg-[#2496ed]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#2496ed' }}>Docker Hub</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.username} ↗</a>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{data.totalPulls.toLocaleString()} pulls</span>
      </div>
      {data.repositories.slice(0, 5).map((r) => (
        <div key={r.name} className="flex items-center justify-between py-1 border-t border-white/[0.04]">
          <span className="text-xs text-slate-300 truncate">{r.name}</span>
          <span className="text-[10px] text-slate-500 font-mono">{r.pullCount.toLocaleString()} pulls</span>
        </div>
      ))}
    </div>
  );
}

function CratesIoCard({ data }: { data: CratesIoData }) {
  return (
    <div className="rounded-lg border border-[#dea584]/20 bg-[#dea584]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#dea584' }}>crates.io</span>
          <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-white">@{data.username} ↗</a>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{data.totalDownloads.toLocaleString()} downloads</span>
      </div>
      {data.crates.slice(0, 5).map((c) => (
        <div key={c.name} className="flex items-center justify-between py-1 border-t border-white/[0.04]">
          <div>
            <span className="text-xs text-slate-300">{c.name}</span>
            <span className="text-[10px] text-slate-600 ml-1">v{c.maxVersion}</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">{c.downloads.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function HuggingFaceCard({ data }: { data: HuggingFaceProfileData }) {
  const PIPELINE_COLORS: Record<string, string> = {
    'text-generation': '#ff6b35',
    'text-classification': '#10b981',
    'image-classification': '#8b5cf6',
    'object-detection': '#f59e0b',
    'text-to-image': '#ec4899',
    'automatic-speech-recognition': '#3b82f6',
    'translation': '#14b8a6',
    'summarization': '#f97316',
    'question-answering': '#6366f1',
    'fill-mask': '#84cc16',
  };

  return (
    <div className="rounded-xl border border-[#ffcc00]/20 bg-[#ffcc00]/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-[#ffcc00] flex items-center justify-center text-[10px] font-bold text-black">HF</div>
        <h4 className="text-xs font-bold text-[#ffcc00]">Hugging Face</h4>
        <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-slate-500 hover:text-[#ffcc00] transition">View Profile →</a>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.models.length}</div>
          <div className="text-[9px] text-slate-500 uppercase">Models</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.datasets.length}</div>
          <div className="text-[9px] text-slate-500 uppercase">Datasets</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.spaces.length}</div>
          <div className="text-[9px] text-slate-500 uppercase">Spaces</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold font-mono text-white">{data.totalDownloads >= 1000000 ? `${(data.totalDownloads / 1000000).toFixed(1)}M` : data.totalDownloads >= 1000 ? `${(data.totalDownloads / 1000).toFixed(1)}K` : data.totalDownloads}</div>
          <div className="text-[9px] text-slate-500 uppercase">Downloads</div>
        </div>
      </div>

      {data.topPipelineTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {data.topPipelineTags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: `${PIPELINE_COLORS[tag] || '#64748b'}15`, color: PIPELINE_COLORS[tag] || '#94a3b8', border: `1px solid ${PIPELINE_COLORS[tag] || '#64748b'}30` }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {data.models.length > 0 && (
        <div className="space-y-1.5">
          {data.models.slice(0, 4).map((m) => (
            <a key={m.modelId} href={`https://huggingface.co/${m.modelId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-slate-200 group-hover:text-[#ffcc00] transition truncate">{m.modelId.split('/').pop()}</div>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">⬇ {m.downloads >= 1000 ? `${(m.downloads / 1000).toFixed(1)}K` : m.downloads}</span>
              <span className="text-[10px] text-pink-400/70 shrink-0">❤ {m.likes}</span>
            </a>
          ))}
        </div>
      )}
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/api/codernet/github/${encodeURIComponent(ghUsername)}`, { method: 'POST', headers });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '本月画像生成额度已用完，下月自动重置');
      return;
    }
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
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center relative">
        <Link
          href="/codernet"
          className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300 transition sm:top-6 sm:left-6"
        >
          <span className="text-lg leading-none" aria-hidden>←</span>
          返回上一级
        </Link>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  if (!result || result.status === 'pending' || (result.status === 'not_found' && triggered)) {
    const hasError = result?.progress?.stage === 'error';
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4 relative">
        <Link
          href="/codernet"
          className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300 transition sm:top-6 sm:left-6"
        >
          <span className="text-lg leading-none" aria-hidden>←</span>
          返回上一级
        </Link>
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
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4 relative">
        <Link
          href="/codernet"
          className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300 transition sm:top-6 sm:left-6"
        >
          <span className="text-lg leading-none" aria-hidden>←</span>
          返回上一级
        </Link>
        <div className="text-center">
          <h1 className="text-xl text-white/80 font-bold mb-2">User not found</h1>
          <p className="text-slate-400 text-sm mb-4">
            @{ghUsername} doesn&apos;t seem to exist on GitHub.
          </p>
          <Link href="/codernet" className="text-violet-400 text-sm hover:underline">Try another username</Link>
        </div>
      </div>
    );
  }

  const { crawl, analysis, multiPlatform, avatarUrl } = result;
  const platforms = analysis?.platformsUsed || ['GitHub'];
  const insights = analysis?.multiPlatformInsights;
  const hasMultiPlatform = multiPlatform && (
    multiPlatform.stackOverflow || multiPlatform.npmPackages?.length || multiPlatform.pypiPackages?.length ||
    multiPlatform.devto || multiPlatform.huggingface || multiPlatform.gitlab || multiPlatform.leetcode ||
    multiPlatform.kaggle || multiPlatform.codeforces || multiPlatform.dockerhub?.repositories?.length ||
    multiPlatform.cratesio?.crates?.length
  );

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/20 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/15 blur-[160px]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10">
        <Link
          href="/codernet"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300 transition mb-4"
        >
          <span className="text-lg leading-none" aria-hidden>←</span>
          返回上一级
        </Link>
        <div className="flex items-center gap-2 mb-8">
          <Link href="/codernet" className="text-xs font-mono text-violet-400 tracking-wider hover:text-violet-300 transition">GITLINK</Link>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">@{ghUsername}</span>
        </div>

        <CodernetPortraitShareBar ghUsername={ghUsername} />

        {/* Profile Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
          <div className="flex items-start gap-4 mb-4">
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

          {platforms.length > 1 && (
            <div className="mb-4">
              <PlatformBadges platforms={platforms} />
            </div>
          )}

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
              <p className="text-[10px] text-slate-500 mt-1 font-mono">— GITLINK AI · {platforms.join(' + ')} Analysis</p>
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

        {/* AI Engagement Score */}
        {analysis?.aiEngagement && (
          <div className="mb-6">
            <AIEngagementCard data={analysis.aiEngagement} />
          </div>
        )}

        {/* Community Influence Scores */}
        {insights && (insights.communityInfluenceScore || insights.knowledgeSharingScore || insights.packageImpactScore || insights.aiMlImpactScore || insights.algorithmScore) && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Cross-Platform Influence</h3>
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

        {/* Multi-Platform Details */}
        {hasMultiPlatform && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">
              Multi-Platform Presence
              {multiPlatform.identityGraph && (
                <span className="ml-2 text-emerald-400/70">
                  ({multiPlatform.identityGraph.platforms.length} platforms linked · {Math.round(multiPlatform.identityGraph.overallConfidence * 100)}% confidence)
                </span>
              )}
            </h3>
            <div className="grid gap-4">
              {multiPlatform.leetcode && <LeetCodeCard data={multiPlatform.leetcode} />}
              {multiPlatform.codeforces && <CodeforcesCard data={multiPlatform.codeforces} />}
              {multiPlatform.kaggle && <KaggleCard data={multiPlatform.kaggle} />}
              {multiPlatform.huggingface && <HuggingFaceCard data={multiPlatform.huggingface} />}
              {multiPlatform.gitlab && <GitLabCard data={multiPlatform.gitlab} />}
              {multiPlatform.stackOverflow && <StackOverflowCard data={multiPlatform.stackOverflow} />}
              {multiPlatform.npmPackages?.length > 0 && <NpmPackagesCard packages={multiPlatform.npmPackages} />}
              {multiPlatform.pypiPackages?.length > 0 && <PyPIPackagesCard packages={multiPlatform.pypiPackages} />}
              {multiPlatform.cratesio && multiPlatform.cratesio.crates?.length > 0 && <CratesIoCard data={multiPlatform.cratesio} />}
              {multiPlatform.dockerhub && multiPlatform.dockerhub.repositories?.length > 0 && <DockerHubCard data={multiPlatform.dockerhub} />}
              {multiPlatform.devto && <DevToCard data={multiPlatform.devto} />}
            </div>
          </div>
        )}

        {crawl?.repos && crawl.repos.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <PortfolioDrillDown
              portfolioDepth={crawl.portfolioDepth ?? null}
              repos={crawl.repos.map((repo) => ({
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                topics: repo.topics,
                url: repo.html_url,
                created_at: repo.created_at,
                pushed_at: repo.pushed_at,
              }))}
              recentCommits={crawl.recentCommits ?? []}
              activityDeepDive={analysis?.activityDeepDive ?? null}
            />
          </div>
        )}

        <div className="text-center py-4">
          <Link href="/codernet" className="text-violet-500 hover:text-violet-400 text-xs font-mono transition">
            ← Search another developer
          </Link>
          <span className="text-slate-700 mx-2">·</span>
          <span className="text-xs text-slate-600 font-mono">GITLINK</span>
        </div>
      </div>
    </div>
  );
}
