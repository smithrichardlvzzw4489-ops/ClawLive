/**
 * 从 GitHub 爬取结果构造可下钻的「仓库 + 提交」时间线（纯函数，不调用外网）。
 */

import type { GHRepo, GHCommitSample, GitHubCrawlResult } from './github-crawler';

export interface PortfolioRepoSnapshot {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  html_url: string;
  created_at: string;
  pushed_at: string;
}

export interface PortfolioCommitSample {
  repo: string;
  message: string;
  date: string;
}

export interface YearActivityBucket {
  year: number;
  /** 该自然年「首次创建」的仓库（created_at） */
  reposCreated: PortfolioRepoSnapshot[];
  /** 该年发生的 commit（按日期新→旧，与 crawl.recentCommits 中年份一致的全量） */
  commitSamples: PortfolioCommitSample[];
  /** 该年的 commit 条数 */
  commitTotalInSample: number;
  /** 该年各仓库 commit 数 */
  commitsByRepo: Record<string, number>;
}

export interface PortfolioDepth {
  generatedAt: string;
  /** 参与统计的仓库数（与 crawl.repos 一致） */
  repoCount: number;
  /** commit 总数（与 crawl.recentCommits 长度一致） */
  commitSampleTotal: number;
  /** 按年聚合，新年份在前 */
  byYear: YearActivityBucket[];
  /** 按 Star 排序（高→低） */
  reposByStars: PortfolioRepoSnapshot[];
  /** 按最近推送排序（新→旧） */
  reposByRecentPush: PortfolioRepoSnapshot[];
}

function toSnapshot(r: GHRepo): PortfolioRepoSnapshot {
  return {
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    topics: r.topics || [],
    html_url: r.html_url,
    created_at: r.created_at,
    pushed_at: r.pushed_at,
  };
}

function yearFromIso(iso: string): number {
  const y = new Date(iso).getUTCFullYear();
  return Number.isFinite(y) ? y : 1970;
}

/**
 * 由 crawl 结果生成时间线与多视角仓库列表。
 */
export function buildPortfolioDepth(crawl: GitHubCrawlResult): PortfolioDepth {
  const snapshots = crawl.repos.map(toSnapshot);
  const reposByStars = [...snapshots].sort((a, b) => b.stars - a.stars);
  const reposByRecentPush = [...snapshots].sort(
    (a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime(),
  );

  const yearMap = new Map<
    number,
    { reposCreated: PortfolioRepoSnapshot[]; commits: PortfolioCommitSample[]; byRepo: Map<string, number> }
  >();

  function ensureYear(y: number) {
    if (!yearMap.has(y)) {
      yearMap.set(y, { reposCreated: [], commits: [], byRepo: new Map() });
    }
    return yearMap.get(y)!;
  }

  for (const s of snapshots) {
    const y = yearFromIso(s.created_at);
    ensureYear(y).reposCreated.push(s);
  }

  for (const c of crawl.recentCommits) {
    const y = yearFromIso(c.date);
    const bucket = ensureYear(y);
    bucket.commits.push({
      repo: c.repo,
      message: c.message,
      date: c.date,
    });
    bucket.byRepo.set(c.repo, (bucket.byRepo.get(c.repo) || 0) + 1);
  }

  const byYear: YearActivityBucket[] = [...yearMap.entries()]
    .map(([year, v]) => ({
      year,
      reposCreated: v.reposCreated.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
      commitSamples: v.commits.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      commitTotalInSample: v.commits.length,
      commitsByRepo: Object.fromEntries(v.byRepo.entries()),
    }))
    .filter((b) => b.reposCreated.length > 0 || b.commitTotalInSample > 0)
    .sort((a, b) => b.year - a.year);

  return {
    generatedAt: new Date().toISOString(),
    repoCount: snapshots.length,
    commitSampleTotal: crawl.recentCommits.length,
    byYear,
    reposByStars,
    reposByRecentPush,
  };
}

/** 给 LLM 的压缩文本（控制长度） */
export function formatPortfolioDepthForPrompt(depth: PortfolioDepth, maxYears = 10): string {
  const lines: string[] = [];
  lines.push(`repos=${depth.repoCount}，commits=${depth.commitSampleTotal}`);
  const years = depth.byYear.slice(0, maxYears);
  for (const y of years) {
    const rc = y.reposCreated
      .slice(0, 8)
      .map((r) => `${r.name}(★${r.stars},${r.language || '?'})`)
      .join('; ');
    const topCommits = y.commitSamples.slice(0, 12).map((c) => `[${c.repo}] ${c.message.slice(0, 72)}`);
    lines.push(
      `--- ${y.year}: new repos ${y.reposCreated.length} (top 8: ${rc || 'none'}); commits this year ${y.commitTotalInSample} ---`,
    );
    if (topCommits.length) lines.push(topCommits.join('\n'));
  }
  return lines.join('\n');
}
