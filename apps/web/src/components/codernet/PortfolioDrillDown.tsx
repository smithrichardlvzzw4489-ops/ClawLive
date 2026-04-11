'use client';

import { useMemo, useState } from 'react';

export interface PortfolioRepoRow {
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
}

export interface PortfolioCommitRow {
  repo: string;
  message: string;
  date: string;
}

export interface YearBucket {
  year: number;
  reposCreated: PortfolioRepoRow[];
  commitSamples: PortfolioCommitRow[];
  commitTotalInSample: number;
  commitsByRepo: Record<string, number>;
}

export interface PortfolioDepthShape {
  byYear: YearBucket[];
  reposByStars: PortfolioRepoRow[];
  reposByRecentPush: PortfolioRepoRow[];
  repoCount: number;
  commitSampleTotal: number;
}

export interface ActivityDeepDiveShape {
  byYear: Array<{ year: number; narrative: string; highlights: string[] }>;
  repoDeepDives: Array<{
    repo: string;
    roleEstimate: string;
    contributionSummary: string;
    techFocus: string;
    /** 仓库本身的内容与定位（较长解读，可能来自旧缓存为空） */
    repoContentDeepDive?: string;
    /** 该人物在此仓的贡献展开（较长解读） */
    personContributionDeepDive?: string;
  }>;
  commitPatterns?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function yearBucketsFromCommits(repos: PortfolioRepoRow[], commits: PortfolioCommitRow[]): YearBucket[] {
  const map = new Map<number, { repos: PortfolioRepoRow[]; commits: PortfolioCommitRow[] }>();
  for (const r of repos) {
    const y = r.created_at ? new Date(r.created_at).getUTCFullYear() : NaN;
    if (!Number.isFinite(y)) continue;
    if (!map.has(y)) map.set(y, { repos: [], commits: [] });
    map.get(y)!.repos.push(r);
  }
  for (const c of commits) {
    const y = new Date(c.date).getUTCFullYear();
    if (!Number.isFinite(y)) continue;
    if (!map.has(y)) map.set(y, { repos: [], commits: [] });
    const b = map.get(y)!;
    if (b.commits.length < 40) b.commits.push(c);
  }
  return [...map.entries()]
    .map(([year, v]) => ({
      year,
      reposCreated: v.repos,
      commitSamples: v.commits,
      commitTotalInSample: v.commits.length,
      commitsByRepo: v.commits.reduce<Record<string, number>>((acc, c) => {
        acc[c.repo] = (acc[c.repo] || 0) + 1;
        return acc;
      }, {}),
    }))
    .filter((b) => b.reposCreated.length > 0 || b.commitTotalInSample > 0)
    .sort((a, b) => b.year - a.year);
}

export function PortfolioDrillDown({
  portfolioDepth,
  repos,
  recentCommits,
  activityDeepDive,
}: {
  portfolioDepth?: PortfolioDepthShape | null;
  repos: PortfolioRepoRow[];
  recentCommits: PortfolioCommitRow[];
  activityDeepDive?: ActivityDeepDiveShape | null;
}) {
  const [repoSort, setRepoSort] = useState<'stars' | 'pushed'>('stars');
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({});
  const [openRepo, setOpenRepo] = useState<Record<string, boolean>>({});

  const byYear = useMemo(() => {
    if (portfolioDepth?.byYear?.length) return portfolioDepth.byYear;
    if (repos.length || recentCommits.length) return yearBucketsFromCommits(repos, recentCommits);
    return [];
  }, [portfolioDepth, repos, recentCommits]);

  const orderedRepos = useMemo(() => {
    if (portfolioDepth) {
      return repoSort === 'stars' ? portfolioDepth.reposByStars : portfolioDepth.reposByRecentPush;
    }
    const copy = [...repos];
    if (repoSort === 'stars') {
      return copy.sort((a, b) => b.stars - a.stars);
    }
    return copy.sort((a, b) => {
      const ta = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
      const tb = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
      return tb - ta;
    });
  }, [portfolioDepth, repos, repoSort]);

  const aiByYear = useMemo(() => {
    const m = new Map<number, ActivityDeepDiveShape['byYear'][0]>();
    for (const row of activityDeepDive?.byYear || []) m.set(row.year, row);
    return m;
  }, [activityDeepDive]);

  const diveByRepo = useMemo(() => {
    const m = new Map<string, ActivityDeepDiveShape['repoDeepDives'][0]>();
    for (const d of activityDeepDive?.repoDeepDives || []) m.set(d.repo, d);
    return m;
  }, [activityDeepDive]);

  const commitSampleCountByRepo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of recentCommits) {
      m[c.repo] = (m[c.repo] || 0) + 1;
    }
    return m;
  }, [recentCommits]);

  if (!repos.length && !recentCommits.length && !byYear.length) return null;

  const toggleYear = (y: number) => setOpenYears((o) => ({ ...o, [y]: !o[y] }));
  const toggleRepo = (name: string) => setOpenRepo((o) => ({ ...o, [name]: !o[name] }));

  return (
    <div className="space-y-6 mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-500">GitHub 深度 · 仓库与提交时间线</h3>
        {portfolioDepth != null && (
          <span className="text-[10px] text-slate-600 font-mono">
            样本 {portfolioDepth.repoCount} 仓 / {portfolioDepth.commitSampleTotal} 条提交
          </span>
        )}
      </div>

      {activityDeepDive?.commitPatterns ? (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-4">
          <p className="text-[10px] font-mono uppercase text-cyan-400/90 mb-1">提交消息 · AI 归纳</p>
          <p className="text-sm text-slate-300 leading-relaxed">{activityDeepDive.commitPatterns}</p>
        </div>
      ) : null}

      {byYear.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-black/20 overflow-hidden">
          <p className="text-[10px] font-mono text-slate-500 px-4 pt-3 pb-1">按年拆解（可展开原始仓库与提交样本）</p>
          <ul className="divide-y divide-white/[0.06]">
            {byYear.map((bucket) => {
              const ai = aiByYear.get(bucket.year);
              const open = openYears[bucket.year] ?? false;
              return (
                <li key={bucket.year}>
                  <button
                    type="button"
                    onClick={() => toggleYear(bucket.year)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition"
                  >
                    <span className="text-sm font-semibold text-white tabular-nums">{bucket.year}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      新建仓库 {bucket.reposCreated.length} · 提交样本 {bucket.commitTotalInSample}
                    </span>
                    <span className="text-slate-600 text-xs ml-auto">{open ? '▼' : '▶'}</span>
                  </button>
                  {ai && (ai.narrative || (ai.highlights && ai.highlights.length > 0)) && (
                    <div className="px-4 pb-2 border-l-2 border-violet-500/40 ml-4 mr-4 mb-2">
                      {ai.narrative ? <p className="text-xs text-violet-200/90 leading-relaxed">{ai.narrative}</p> : null}
                      {ai.highlights && ai.highlights.length > 0 ? (
                        <ul className="mt-1.5 list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                          {ai.highlights.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  {open && (
                    <div className="px-4 pb-4 space-y-4 bg-white/[0.02]">
                      {bucket.reposCreated.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 font-mono mb-2">该年创建的仓库</p>
                          <ul className="space-y-2">
                            {bucket.reposCreated.map((r) => (
                              <li key={r.name} className="text-xs">
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sky-400 hover:underline font-mono"
                                >
                                  {r.name}
                                </a>
                                <span className="text-slate-500 ml-2">
                                  {r.language || '?'} · ★{r.stars}
                                  {r.description ? ` — ${r.description}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {bucket.commitSamples.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 font-mono mb-2">该年提交样本（节选）</p>
                          <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {bucket.commitSamples.map((c, i) => (
                              <li key={`${c.date}-${i}`} className="text-[11px] text-slate-400 font-mono leading-snug">
                                <span className="text-slate-600">{c.date.slice(0, 10)}</span>{' '}
                                <span className="text-amber-400/90">{c.repo}</span> {c.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <p className="text-[10px] font-mono text-slate-500">仓库全景</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRepoSort('stars')}
              className={`text-[10px] px-2 py-1 rounded font-mono ${
                repoSort === 'stars' ? 'bg-violet-600/40 text-violet-100' : 'bg-white/5 text-slate-500'
              }`}
            >
              按 Star
            </button>
            <button
              type="button"
              onClick={() => setRepoSort('pushed')}
              className={`text-[10px] px-2 py-1 rounded font-mono ${
                repoSort === 'pushed' ? 'bg-violet-600/40 text-violet-100' : 'bg-white/5 text-slate-500'
              }`}
            >
              最近推送
            </button>
          </div>
        </div>
        <ul className="space-y-1">
          {orderedRepos.map((r) => {
            const dive = diveByRepo.get(r.name);
            const expanded = openRepo[r.name] ?? false;
            return (
              <li key={r.name} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleRepo(r.name)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition"
                >
                  <span className="text-slate-600 text-xs mt-0.5 shrink-0">{expanded ? '▼' : '▶'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm text-sky-400 hover:underline font-mono truncate"
                      >
                        {r.name}
                      </a>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ★{r.stars}
                        {r.forks != null ? ` · fork ${r.forks}` : ''} · {r.language || '—'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      创建 {formatDate(r.created_at)} · 推送 {formatDate(r.pushed_at)}
                    </p>
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-white/[0.05] space-y-3">
                    {r.description ? <p className="text-xs text-slate-400 leading-relaxed">{r.description}</p> : null}
                    {r.topics && r.topics.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.topics.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400 font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-white/[0.08] bg-slate-950/40 p-2.5 text-[11px] text-slate-400 space-y-1">
                      <p className="text-[10px] font-mono uppercase text-slate-500">可验证公开指标</p>
                      <p className="leading-relaxed">
                        主语言 {r.language || '—'}；★{r.stars}
                        {r.forks != null ? `；fork ${r.forks}` : ''}；创建于 {formatDate(r.created_at)}；最近推送 {formatDate(r.pushed_at)}。
                        {recentCommits.length > 0 ? (
                          <>
                            {' '}
                            在近期抓取到的提交样本中，此仓库出现{' '}
                            <span className="text-slate-200 tabular-nums">{commitSampleCountByRepo[r.name] ?? 0}</span> 条（全样本共{' '}
                            {recentCommits.length} 条）。
                          </>
                        ) : null}
                      </p>
                    </div>
                    {dive?.repoContentDeepDive ? (
                      <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-2.5">
                        <p className="text-[10px] font-mono uppercase text-sky-400/90 mb-1.5">仓库内容解读</p>
                        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{dive.repoContentDeepDive}</p>
                      </div>
                    ) : null}
                    {dive ? (
                      <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5 text-[11px] space-y-2">
                        <div>
                          <p className="text-[10px] font-mono uppercase text-violet-300/80 mb-1">角色与贡献（摘要）</p>
                          <p className="text-violet-200/90">
                            <span className="text-slate-500">角色推断：</span>
                            {dive.roleEstimate}
                          </p>
                          {dive.contributionSummary ? <p className="text-slate-300 mt-1 leading-relaxed">{dive.contributionSummary}</p> : null}
                          {dive.techFocus ? (
                            <p className="text-slate-500 font-mono text-[10px] mt-1">技术：{dive.techFocus}</p>
                          ) : null}
                        </div>
                        {dive.personContributionDeepDive ? (
                          <div className="border-t border-violet-500/15 pt-2">
                            <p className="text-[10px] font-mono uppercase text-violet-300/80 mb-1.5">本人在此仓的贡献 · 展开解读</p>
                            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{dive.personContributionDeepDive}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-600 font-mono">暂无该仓库的单独 AI 解读（重新生成画像后将包含仓库与贡献的长文解读）</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {recentCommits.length > 0 && (
        <details className="rounded-xl border border-white/[0.08] bg-black/20 p-4 group">
          <summary className="text-xs text-slate-400 cursor-pointer font-mono list-none flex items-center gap-2">
            <span className="text-slate-600 group-open:rotate-90 transition">▶</span>
            完整提交样本列表（{recentCommits.length}）
          </summary>
          <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
            {recentCommits.map((c, i) => (
              <li key={`${c.date}-${i}`} className="text-[11px] text-slate-500 font-mono leading-snug">
                <span className="text-slate-600">{c.date.slice(0, 10)}</span>{' '}
                <span className="text-amber-400/80">{c.repo}</span> {c.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
