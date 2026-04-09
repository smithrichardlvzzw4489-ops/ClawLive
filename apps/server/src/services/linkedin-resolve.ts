/**
 * LinkedIn 公开页链接解析 — 供 HR 从候选人 LinkedIn 页尝试提取 GitHub / 个人网站等外链，
 * 再跳转现有 GitHub 画像管线。不保证能抓取成功（LinkedIn 常拦截服务端请求）。
 */

import { extractWebsiteLinks } from './identity-graph';

const GITHUB_RESERVED = new Set([
  'topics', 'features', 'marketplace', 'sponsors', 'explore', 'settings', 'login', 'signup',
  'search', 'notifications', 'pull', 'issues', 'orgs', 'organizations', 'enterprise',
  'team', 'readme', 'sitemap', 'about', 'pricing', 'security', 'customer-stories',
]);

const SKIP_HOST_SUBSTR = [
  'linkedin.com', 'licdn.com', 'linkedin.cn', 'doubleclick', 'google-analytics',
  'googletagmanager', 'facebook.com', 'fbcdn', 'twitter.com', 'x.com', 'instagram.com',
  'youtube.com', 'youtu.be', 'microsoft.com', 'office.com', 'adobe.com', 'schema.org',
  'w3.org', 'google.com', 'gstatic.com', 'cloudflare', 'fontawesome',
];

export type LinkedInFetchStatus = 'ok' | 'blocked' | 'empty' | 'invalid_url' | 'network_error';

export interface LinkedInResolveResult {
  linkedinVanity: string | null;
  normalizedLinkedInUrl: string | null;
  fetchStatus: LinkedInFetchStatus;
  githubUsernames: string[];
  gitlabUsernames: string[];
  portfolioUrls: string[];
  /** og:title / <title> snippet when HTML was readable */
  pageTitleHint: string | null;
  guidanceZh: string;
}

function normalizeLinkedInInput(input: string): { vanity: string | null; canonical: string | null } {
  const raw = input.trim();
  if (!raw) return { vanity: null, canonical: null };

  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { vanity: null, canonical: null };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('linkedin.com') && !host.endsWith('linkedin.cn')) {
    return { vanity: null, canonical: null };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  const inMatch = path.match(/^\/in\/([^/]+)/i);
  const pubMatch = path.match(/^\/pub\/([^/]+)/i);
  const vanity = (inMatch?.[1] || pubMatch?.[1] || '').split('?')[0];
  if (!vanity || vanity.length > 200) return { vanity: null, canonical: null };

  const canonical = `https://www.linkedin.com/in/${encodeURIComponent(vanity)}`;
  return { vanity: decodeURIComponent(vanity), canonical };
}

function extractGithubUsernames(html: string): string[] {
  const set = new Set<string>();
  const re = /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]))(?:\/|\?|"|'|#|>|\s|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (!GITHUB_RESERVED.has(u.toLowerCase())) set.add(u);
  }
  return [...set];
}

function extractGitlabUsernames(html: string): string[] {
  const set = new Set<string>();
  const re = /https?:\/\/(?:www\.)?gitlab\.com\/([a-zA-Z0-9_.-]+)(?:\/|\?|"|'|#|>|\s|$)/gi;
  let m: RegExpExecArray | null;
  const reserved = new Set(['explore', 'users', 'groups', '-', 'public', 'help']);
  while ((m = re.exec(html)) !== null) {
    const u = m[1].split('/')[0];
    if (u && !reserved.has(u.toLowerCase())) set.add(u);
  }
  return [...set];
}

function extractPortfolioUrls(html: string, max = 12): string[] {
  const found = new Set<string>();
  const hrefRe = /href=["'](https?:\/\/[^"'<>]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    let u = m[1];
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      if (SKIP_HOST_SUBSTR.some((s) => host.includes(s))) continue;
      if (host.endsWith('github.com') || host.endsWith('gitlab.com')) continue;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      u = `${parsed.protocol}//${host}${parsed.pathname}`.replace(/\/$/, '');
      if (u.length > 200) continue;
      found.add(u);
      if (found.size >= max) break;
    } catch {
      /* skip */
    }
  }
  return [...found];
}

function extractTitleHint(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og?.[1]) return og[1].slice(0, 120);
  const title = html.match(/<title[^>]*>([^<]{1,120})/i);
  if (title?.[1]) return title[1].replace(/\s+/g, ' ').trim();
  return null;
}

function looksLikeLoginWall(html: string): boolean {
  const lower = html.slice(0, 8000).toLowerCase();
  if (html.length < 5000 && /sign in|join now|authwall|checkpoint/i.test(lower)) return true;
  if (/linkedin\.com\/authwall/i.test(html)) return true;
  return false;
}

/**
 * Resolve a pasted LinkedIn profile URL to candidate GitHub / GitLab / portfolio links.
 */
export async function resolveLinkedInProfileUrl(input: string): Promise<LinkedInResolveResult> {
  const { vanity, canonical } = normalizeLinkedInInput(input);

  if (!vanity || !canonical) {
    return {
      linkedinVanity: null,
      normalizedLinkedInUrl: null,
      fetchStatus: 'invalid_url',
      githubUsernames: [],
      gitlabUsernames: [],
      portfolioUrls: [],
      pageTitleHint: null,
      guidanceZh: '请输入有效的 LinkedIn 个人主页链接，例如 https://www.linkedin.com/in/someone',
    };
  }

  let html = '';
  let fetchStatus: LinkedInFetchStatus = 'network_error';

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(canonical, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      fetchStatus = res.status === 403 || res.status === 401 || res.status === 999 ? 'blocked' : 'blocked';
      return buildResult(vanity, canonical, fetchStatus, '', null);
    }
    html = await res.text();
    if (!html || html.length < 500) {
      fetchStatus = 'empty';
      return buildResult(vanity, canonical, fetchStatus, html, null);
    }
    if (looksLikeLoginWall(html)) {
      fetchStatus = 'blocked';
      return buildResult(vanity, canonical, fetchStatus, html, null);
    }
    fetchStatus = 'ok';
    const title = extractTitleHint(html);
    return buildResult(vanity, canonical, fetchStatus, html, title);
  } catch {
    fetchStatus = 'network_error';
    return buildResult(vanity, canonical, fetchStatus, '', null);
  }
}

function buildResult(
  vanity: string,
  canonical: string,
  status: LinkedInFetchStatus,
  html: string,
  title: string | null,
): LinkedInResolveResult {
  const githubUsernames = html ? extractGithubUsernames(html) : [];
  const gitlabUsernames = html ? extractGitlabUsernames(html) : [];
  const portfolioUrls = html ? extractPortfolioUrls(html) : [];

  let guidanceZh = '';
  if (status === 'invalid_url') {
    guidanceZh = '链接格式无效。请使用 linkedin.com/in/用户名 形式的个人主页。';
  } else if (status === 'blocked' || status === 'network_error' || status === 'empty') {
    guidanceZh =
      'LinkedIn 未返回可解析的公开页面（常见于需要登录或地区限制）。请在候选人 LinkedIn 的「联系方式」或简介中复制 GitHub / 个人网站链接，粘贴到上方「查 GitHub 用户」或下方输入框。';
  } else if (githubUsernames.length === 0 && gitlabUsernames.length === 0 && portfolioUrls.length === 0) {
    guidanceZh =
      '页面已获取，但未发现 GitHub / GitLab / 明显的外链。请手动从 LinkedIn 复制候选人的 GitHub 用户名或网站地址。';
  } else {
    guidanceZh = '已从页面中提取到以下开发者身份线索，请选择一项生成技术画像。';
  }

  return {
    linkedinVanity: vanity,
    normalizedLinkedInUrl: canonical,
    fetchStatus: status,
    githubUsernames,
    gitlabUsernames,
    portfolioUrls,
    pageTitleHint: title,
    guidanceZh,
  };
}

/** 对个人网站再爬一层，提取页内常见的 GitHub / GitLab 等链接（与多平台 identity 逻辑一致）。 */
export async function probeWebsiteForDeveloperIdentities(portfolioUrl: string): Promise<{
  githubUsername: string | null;
  gitlabUsername: string | null;
  leetcodeUsername: string | null;
  twitterUsername: string | null;
}> {
  const raw = portfolioUrl.trim();
  if (!raw) {
    return { githubUsername: null, gitlabUsername: null, leetcodeUsername: null, twitterUsername: null };
  }
  const w = await extractWebsiteLinks(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  return {
    githubUsername: w.github || null,
    gitlabUsername: w.gitlab || null,
    leetcodeUsername: w.leetcode || null,
    twitterUsername: w.twitter || null,
  };
}
