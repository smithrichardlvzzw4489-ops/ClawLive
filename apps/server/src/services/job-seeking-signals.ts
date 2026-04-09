/**
 * 求职意向依据：从 GitHub 简介 / profile README / 个人网站文案中匹配公开表述，
 * 并与站内开关、用户登记的求职平台链接合并展示。
 */

import type { GitHubCrawlResult } from './github-crawler';

const GH_API = 'https://api.github.com';

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** 英文 + 中文常见「在找工作」表述（保守匹配，避免误判） */
const JOB_SEEKING_PATTERNS: RegExp[] = [
  /\bopen\s+to\s+(work|opportunities|roles?|positions?|new\s+opportunities)\b/i,
  /\bactively\s+looking\b/i,
  /\bseeking\s+(a\s+)?(new\s+)?(role|position|opportunity|job)\b/i,
  /\bavailable\s+for\s+(hire|work|opportunities)\b/i,
  /\b#opentowork\b/i,
  /\bfor\s+hire\b/i,
  /\bhiring\s*[:：]?\s*open\b/i,
  /正在求职|看机会|找工作|在找工作|可跳槽|看新机会|寻求.*职位|接受内推|开放.*机会|待业|离职\s*中/i,
];

export type JobSeekingSignalKind =
  | 'platform_toggle'
  | 'github_profile_bio'
  | 'github_profile_readme'
  | 'personal_website'
  | 'user_listed_job_board';

export interface JobSeekingSignal {
  kind: JobSeekingSignalKind;
  title: string;
  detail: string;
  url: string;
  recordedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function findFirstMatchSnippet(text: string, maxLen = 160): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const re of JOB_SEEKING_PATTERNS) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      const start = Math.max(0, m.index - 40);
      const slice = t.slice(start, start + maxLen);
      return (start > 0 ? '…' : '') + slice + (start + maxLen < t.length ? '…' : '');
    }
  }
  return null;
}

function textLooksJobSeeking(text: string): boolean {
  if (!text || text.length < 8) return false;
  return JOB_SEEKING_PATTERNS.some((re) => re.test(text));
}

async function fetchProfileReadmeMarkdown(username: string, token?: string): Promise<string | null> {
  try {
    const res = await fetch(`${GH_API}/repos/${username}/${username}/readme`, {
      headers: {
        ...ghHeaders(token),
        Accept: 'application/vnd.github.raw',
      },
    });
    if (!res.ok) return null;
    const raw = await res.text();
    return raw.slice(0, 80_000);
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100_000);
}

async function fetchBlogTextForSignals(blogUrl: string): Promise<string | null> {
  let url = blogUrl.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ClawLab-Codernet/1.0 (Job signals)', Accept: 'text/html' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtmlToText(html);
  } catch {
    return null;
  }
}

/**
 * 仅基于爬取结果与可选 token，收集「公开文案中的求职表述」依据（不含站内开关与用户登记链接）。
 */
export async function collectJobSeekingSignals(
  crawl: GitHubCrawlResult,
  token?: string,
): Promise<JobSeekingSignal[]> {
  const signals: JobSeekingSignal[] = [];
  const ghUser = crawl.username;
  const profileUrl = `https://github.com/${ghUser}`;

  if (crawl.bio && textLooksJobSeeking(crawl.bio)) {
    const snip = findFirstMatchSnippet(crawl.bio) || crawl.bio.slice(0, 120);
    signals.push({
      kind: 'github_profile_bio',
      title: 'GitHub 个人简介',
      detail: `匹配到求职相关表述：「${snip}」`,
      url: profileUrl,
      recordedAt: nowIso(),
    });
  }

  const readme = await fetchProfileReadmeMarkdown(ghUser, token);
  if (readme && textLooksJobSeeking(readme)) {
    const snip = findFirstMatchSnippet(readme) || readme.slice(0, 120);
    signals.push({
      kind: 'github_profile_readme',
      title: 'GitHub Profile README',
      detail: `仓库 ${ghUser}/${ghUser} 的 README 中含求职相关表述：「${snip}」`,
      url: `https://github.com/${ghUser}/${ghUser}`,
      recordedAt: nowIso(),
    });
  }

  if (crawl.blog) {
    const blogText = await fetchBlogTextForSignals(crawl.blog);
    if (blogText && textLooksJobSeeking(blogText)) {
      const snip = findFirstMatchSnippet(blogText) || blogText.slice(0, 120);
      let blogPage = crawl.blog.trim();
      if (!/^https?:\/\//i.test(blogPage)) blogPage = `https://${blogPage}`;
      signals.push({
        kind: 'personal_website',
        title: '个人网站 / 博客',
        detail: `页面文案中含求职相关表述：「${snip}」`,
        url: blogPage,
        recordedAt: nowIso(),
      });
    }
  }

  return signals;
}

export interface PlatformJobSeekingRow {
  openToOpportunities: boolean;
  openToOpportunitiesUpdatedAt: Date | null;
  jobSeekingExternalProfiles: unknown;
  username: string;
}

/**
 * 合并：自动检测依据 + 站内「开放机会」+ 用户登记的求职平台链接。
 */
export function mergeJobSeekingSignalsForDisplay(
  detected: JobSeekingSignal[],
  platformUser: PlatformJobSeekingRow | null,
  siteBaseUrl: string,
): { active: boolean; signals: JobSeekingSignal[] } {
  const signals: JobSeekingSignal[] = [];

  if (platformUser?.openToOpportunities) {
    const base = siteBaseUrl.replace(/\/$/, '');
    signals.push({
      kind: 'platform_toggle',
      title: '本站已开启「开放机会」',
      detail: '候选人已在 ClawLive / Codernet 声明愿意接收合适机会（站内开关）。',
      url: `${base}/codernet/card/${encodeURIComponent(platformUser.username)}`,
      recordedAt: platformUser.openToOpportunitiesUpdatedAt?.toISOString() || nowIso(),
    });
  }

  const ext = platformUser?.jobSeekingExternalProfiles;
  if (Array.isArray(ext)) {
    for (const row of ext) {
      if (row && typeof row.url === 'string' && typeof row.label === 'string' && row.url.startsWith('http')) {
        signals.push({
          kind: 'user_listed_job_board',
          title: row.label.trim().slice(0, 80) || '求职平台 / 链接',
          detail: '候选人在资料中登记的对外求职主页或招聘平台档案。',
          url: row.url.trim(),
          recordedAt: typeof row.addedAt === 'string' ? row.addedAt : nowIso(),
        });
      }
    }
  }

  signals.push(...detected);

  const active = signals.length > 0;
  return { active, signals };
}
