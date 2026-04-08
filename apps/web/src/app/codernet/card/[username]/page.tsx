'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

interface TopRepo {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  url: string;
}

interface CodernetProfile {
  status: 'ready' | 'pending';
  message?: string;
  user: {
    username: string;
    avatarUrl: string | null;
    bio?: string | null;
    githubUsername: string | null;
    memberSince?: string;
  };
  github?: {
    totalPublicRepos: number;
    totalStars: number;
    followers: number;
    topRepos: TopRepo[];
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

function QuadrantChart({ data }: { data: CodernetProfile['analysis'] extends undefined ? never : NonNullable<CodernetProfile['analysis']>['capabilityQuadrant'] }) {
  const dims = [
    { key: 'frontend', label: 'Frontend', angle: -90 },
    { key: 'backend', label: 'Backend', angle: 0 },
    { key: 'infra', label: 'Infra/DevOps', angle: 90 },
    { key: 'ai_ml', label: 'AI/ML', angle: 180 },
  ] as const;

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 80;

  const points = dims.map((d) => {
    const val = data[d.key] / 100;
    const rad = (d.angle * Math.PI) / 180;
    return {
      ...d,
      x: cx + Math.cos(rad) * maxR * val,
      y: cy + Math.sin(rad) * maxR * val,
      lx: cx + Math.cos(rad) * (maxR + 18),
      ly: cy + Math.sin(rad) * (maxR + 18),
      val: data[d.key],
    };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <circle key={s} cx={cx} cy={cy} r={maxR * s} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
      ))}
      {dims.map((d) => {
        const rad = (d.angle * Math.PI) / 180;
        return (
          <line
            key={d.key}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(rad) * maxR}
            y2={cy + Math.sin(rad) * maxR}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
          />
        );
      })}
      <polygon points={polyPoints} fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.7)" strokeWidth={1.5} />
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={p.x} cy={p.y} r={3} fill="#8b5cf6" />
          <text
            x={p.lx}
            y={p.ly}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-400"
            fontSize={8}
            fontFamily="monospace"
          >
            {p.label}
          </text>
          <text
            x={p.lx}
            y={p.ly + 10}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-violet-400"
            fontSize={7}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {p.val}
          </text>
        </g>
      ))}
    </svg>
  );
}

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

export default function CodernetCardPage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const [profile, setProfile] = useState<CodernetProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    const base = API_BASE_URL || '';
    fetch(`${base}/api/codernet/profile/${encodeURIComponent(username)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="text-white/50 text-sm font-mono">Scanning GitHub data...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4 opacity-30">&#x1f50d;</div>
          <h1 className="text-xl text-white/80 font-bold mb-2">Profile Not Found</h1>
          <p className="text-slate-400 text-sm mb-6">
            {error || `@${username} hasn't connected their GitHub account yet.`}
          </p>
          <Link href="/login" className="text-violet-400 text-sm hover:underline">
            Login with GitHub to create your card
          </Link>
        </div>
      </div>
    );
  }

  if (profile.status === 'pending') {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-violet-500/30" />
          <h1 className="text-lg text-white/80 font-bold mb-2">Analyzing @{profile.user.githubUsername}...</h1>
          <p className="text-slate-400 text-sm">
            We're crawling GitHub data and generating your developer profile. This usually takes 30-60 seconds. Refresh in a moment.
          </p>
        </div>
      </div>
    );
  }

  const { analysis, github } = profile;

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      {/* Background effects */}
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/20 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/15 blur-[160px]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <span className="text-xs font-mono text-violet-400 tracking-wider">CODERNET</span>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">developer profile</span>
        </div>

        {/* Profile Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
          <div className="flex items-start gap-4 mb-5">
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
              <h1 className="text-2xl font-bold truncate">{profile.user.username}</h1>
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
            </div>
          </div>

          {/* Stats Row */}
          {github && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Repos', value: github.totalPublicRepos },
                { label: 'Stars', value: github.totalStars },
                { label: 'Followers', value: github.followers },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-center">
                  <div className="text-lg font-bold font-mono text-white">{s.value.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sharp Commentary */}
          {analysis?.sharpCommentary && (
            <div className="rounded-lg bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 px-4 py-3 mb-5">
              <p className="text-sm text-slate-200 leading-relaxed italic">
                &ldquo;{analysis.sharpCommentary}&rdquo;
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">— Codernet AI Analysis</p>
            </div>
          )}

          {/* Tech Tags */}
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

          {/* Language Distribution */}
          {analysis?.languageDistribution && analysis.languageDistribution.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono">Languages</h3>
              <LanguageBar langs={analysis.languageDistribution} />
            </div>
          )}
        </div>

        {/* Capability Quadrant */}
        {analysis?.capabilityQuadrant && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Capability Quadrant</h3>
            <QuadrantChart data={analysis.capabilityQuadrant} />
          </div>
        )}

        {/* Top Repos */}
        {github?.topRepos && github.topRepos.length > 0 && (
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
                  <span className="text-xs text-slate-500 shrink-0 font-mono">
                    &#9733; {repo.stars}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 font-mono py-4">
          <span>codernet by </span>
          <Link href="/" className="text-violet-500 hover:text-violet-400 transition">clawlab.live</Link>
          {profile.crawledAt && (
            <span className="ml-2">
              · last scanned {new Date(profile.crawledAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
