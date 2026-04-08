/**
 * Identity Graph — 跨平台开发者身份统一
 *
 * 核心概念：
 *   PlatformIdentity   每个平台上的单独身份
 *   IdentityLink        两个身份之间的关联（带置信度和来源方法）
 *   UnifiedDeveloper    通过图谱聚合后的统一开发者实体
 *
 * 匹配方法优先级（置信度）：
 *   user_verified   100%   用户自己 OAuth 认领
 *   same_email       95%   相同邮箱
 *   explicit_link    90%   平台间显式互链
 *   oauth_chain      90%   共享 OAuth 身份
 *   same_username    75%   同用户名 + 同展示名
 *   website_link     85%   个人网站上的社交链接
 *   graph_transitive 70%   图谱传递推导
 *   name_location    65%   全名 + 位置组合
 *   avatar_match     60%   头像指纹相似
 *   repo_match       55%   相同项目名
 */

import fs from 'fs';
import path from 'path';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export type Platform =
  | 'github' | 'gitlab' | 'stackoverflow' | 'npm' | 'pypi'
  | 'devto' | 'huggingface' | 'leetcode' | 'kaggle'
  | 'codeforces' | 'dockerhub' | 'cratesio'
  | 'twitter' | 'linkedin' | 'website' | 'hashnode' | 'medium';

export type MatchMethod =
  | 'user_verified' | 'same_email' | 'explicit_link' | 'oauth_chain'
  | 'same_username' | 'website_link' | 'graph_transitive'
  | 'name_location' | 'avatar_match' | 'repo_match';

export const MATCH_CONFIDENCE: Record<MatchMethod, number> = {
  user_verified: 1.0,
  same_email: 0.95,
  explicit_link: 0.90,
  oauth_chain: 0.90,
  website_link: 0.85,
  same_username: 0.75,
  graph_transitive: 0.70,
  name_location: 0.65,
  avatar_match: 0.60,
  repo_match: 0.55,
};

export interface PlatformIdentity {
  platform: Platform;
  platformId: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  profileUrl: string;
  bio?: string;
  location?: string;
}

export interface IdentityLink {
  source: PlatformIdentity;
  target: PlatformIdentity;
  method: MatchMethod;
  confidence: number;
  evidence?: string;
  createdAt: string;
}

export interface UnifiedDeveloper {
  id: string;
  primaryIdentity: PlatformIdentity;
  identities: PlatformIdentity[];
  links: IdentityLink[];
  overallConfidence: number;
  platforms: Platform[];
  resolvedAt: string;
}

/** Signals extracted from a GitHub profile to seed the identity graph. */
export interface IdentitySeed {
  username: string;
  email: string | null;
  name: string | null;
  blog: string | null;
  bio: string | null;
  twitterUsername: string | null;
  location: string | null;
  avatarUrl: string | null;
}

/** Links extracted from a personal website/blog. */
export interface WebsiteLinks {
  url: string;
  github?: string;
  gitlab?: string;
  twitter?: string;
  linkedin?: string;
  stackoverflow?: string;
  leetcode?: string;
  kaggle?: string;
  codeforces?: string;
  devto?: string;
  medium?: string;
  hashnode?: string;
  huggingface?: string;
  dockerhub?: string;
  npm?: string;
  email?: string;
}

/* ══════════════════════════════════════════════════════════════
   Website Link Extractor
   ══════════════════════════════════════════════════════════════ */

const PLATFORM_PATTERNS: { platform: Platform; patterns: RegExp[] }[] = [
  { platform: 'github', patterns: [/github\.com\/([a-zA-Z0-9_-]+)/i] },
  { platform: 'gitlab', patterns: [/gitlab\.com\/([a-zA-Z0-9_.-]+)/i] },
  { platform: 'twitter', patterns: [/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i] },
  { platform: 'linkedin', patterns: [/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i] },
  { platform: 'stackoverflow', patterns: [/stackoverflow\.com\/users\/(\d+)/i] },
  { platform: 'leetcode', patterns: [/leetcode\.com\/(?:u\/)?([a-zA-Z0-9_-]+)/i] },
  { platform: 'kaggle', patterns: [/kaggle\.com\/([a-zA-Z0-9_-]+)/i] },
  { platform: 'codeforces', patterns: [/codeforces\.com\/profile\/([a-zA-Z0-9_.-]+)/i] },
  { platform: 'devto', patterns: [/dev\.to\/([a-zA-Z0-9_]+)/i] },
  { platform: 'medium', patterns: [/medium\.com\/@?([a-zA-Z0-9_.-]+)/i] },
  { platform: 'hashnode', patterns: [/hashnode\.dev\/@?([a-zA-Z0-9_-]+)/i, /([a-zA-Z0-9_-]+)\.hashnode\.dev/i] },
  { platform: 'huggingface', patterns: [/huggingface\.co\/([a-zA-Z0-9_-]+)/i] },
  { platform: 'dockerhub', patterns: [/hub\.docker\.com\/u\/([a-zA-Z0-9_-]+)/i] },
  { platform: 'npm', patterns: [/npmjs\.com\/~([a-zA-Z0-9_.-]+)/i] },
];

const IGNORED_USERNAMES = new Set(['in', 'about', 'search', 'explore', 'settings', 'login', 'signup', 'trending', 'topics', 'api', 'docs', 'help', 'status']);

export async function extractWebsiteLinks(url: string): Promise<WebsiteLinks> {
  const result: WebsiteLinks = { url };
  if (!url) return result;

  let normalized = url.trim();
  if (!normalized.startsWith('http')) normalized = `https://${normalized}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ClawLab-Codernet/1.0 (Identity Resolution)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return result;
    const html = await res.text();

    const allUrls: string[] = [];
    // href="..." and href='...'
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      allUrls.push(match[1]);
    }
    // Also grab plain URLs in text
    const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
    while ((match = urlRegex.exec(html)) !== null) {
      allUrls.push(match[0]);
    }

    for (const foundUrl of allUrls) {
      for (const { platform, patterns } of PLATFORM_PATTERNS) {
        for (const pat of patterns) {
          const m = foundUrl.match(pat);
          if (m && m[1] && !IGNORED_USERNAMES.has(m[1].toLowerCase())) {
            (result as any)[platform] = m[1];
            break;
          }
        }
      }
    }

    // Extract email from mailto: or text
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    while ((match = emailRegex.exec(html)) !== null) {
      if (!match[1].includes('example') && !match[1].includes('noreply')) {
        result.email = match[1];
        break;
      }
    }
  } catch {
    // Timeout or network error — not critical
  }

  return result;
}

/* ══════════════════════════════════════════════════════════════
   Identity Graph Builder
   ══════════════════════════════════════════════════════════════ */

export class IdentityGraphBuilder {
  private identities: PlatformIdentity[] = [];
  private links: IdentityLink[] = [];
  private seed: IdentitySeed;

  constructor(seed: IdentitySeed) {
    this.seed = seed;
    this.addIdentity({
      platform: 'github',
      platformId: seed.username,
      username: seed.username,
      displayName: seed.name || undefined,
      email: seed.email || undefined,
      avatarUrl: seed.avatarUrl || undefined,
      profileUrl: `https://github.com/${seed.username}`,
      bio: seed.bio || undefined,
      location: seed.location || undefined,
    });
  }

  addIdentity(identity: PlatformIdentity): void {
    const exists = this.identities.find(
      (i) => i.platform === identity.platform && i.platformId === identity.platformId,
    );
    if (!exists) this.identities.push(identity);
  }

  addLink(
    sourcePlatform: Platform,
    targetPlatform: Platform,
    targetUsername: string,
    method: MatchMethod,
    evidence?: string,
  ): void {
    const source = this.identities.find((i) => i.platform === sourcePlatform);
    const target = this.identities.find(
      (i) => i.platform === targetPlatform && i.username === targetUsername,
    );
    if (!source || !target) return;

    const exists = this.links.find(
      (l) => l.source.platform === sourcePlatform && l.target.platform === targetPlatform,
    );
    if (exists) return;

    this.links.push({
      source,
      target,
      method,
      confidence: MATCH_CONFIDENCE[method],
      evidence,
      createdAt: new Date().toISOString(),
    });
  }

  /** Process website links and add identities + links */
  processWebsiteLinks(websiteLinks: WebsiteLinks): void {
    for (const { platform, patterns } of PLATFORM_PATTERNS) {
      const username = (websiteLinks as any)[platform] as string | undefined;
      if (!username) continue;
      if (platform === 'github' && username.toLowerCase() === this.seed.username.toLowerCase()) continue;

      this.addIdentity({
        platform,
        platformId: username,
        username,
        profileUrl: this.buildProfileUrl(platform, username),
      });

      this.addLink('github', platform, username, 'website_link', `Found on ${websiteLinks.url}`);
    }
  }

  /** Register a platform identity discovered by username match */
  registerUsernameMatch(
    platform: Platform,
    username: string,
    extra?: Partial<PlatformIdentity>,
  ): void {
    this.addIdentity({
      platform,
      platformId: username,
      username,
      profileUrl: this.buildProfileUrl(platform, username),
      ...extra,
    });

    const ghIdentity = this.identities.find((i) => i.platform === 'github');
    const newIdentity = this.identities.find(
      (i) => i.platform === platform && i.username === username,
    );
    if (!ghIdentity || !newIdentity) return;

    // Determine the best match method
    let method: MatchMethod = 'same_username';
    if (this.seed.email && extra?.email && this.seed.email.toLowerCase() === extra.email.toLowerCase()) {
      method = 'same_email';
    }

    this.links.push({
      source: ghIdentity,
      target: newIdentity,
      method,
      confidence: MATCH_CONFIDENCE[method],
      createdAt: new Date().toISOString(),
    });
  }

  /** Register an explicit link found on a platform profile */
  registerExplicitLink(
    fromPlatform: Platform,
    toPlatform: Platform,
    toUsername: string,
    extra?: Partial<PlatformIdentity>,
  ): void {
    this.addIdentity({
      platform: toPlatform,
      platformId: toUsername,
      username: toUsername,
      profileUrl: this.buildProfileUrl(toPlatform, toUsername),
      ...extra,
    });

    const source = this.identities.find((i) => i.platform === fromPlatform);
    const target = this.identities.find(
      (i) => i.platform === toPlatform && i.username === toUsername,
    );
    if (source && target) {
      this.links.push({
        source,
        target,
        method: 'explicit_link',
        confidence: MATCH_CONFIDENCE.explicit_link,
        evidence: `${fromPlatform} profile links to ${toPlatform}`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  build(): UnifiedDeveloper {
    const ghIdentity = this.identities.find((i) => i.platform === 'github')!;
    const platforms = [...new Set(this.identities.map((i) => i.platform))];

    const avgConfidence =
      this.links.length > 0
        ? this.links.reduce((s, l) => s + l.confidence, 0) / this.links.length
        : 1.0;

    return {
      id: `dev:${this.seed.username}`,
      primaryIdentity: ghIdentity,
      identities: this.identities,
      links: this.links,
      overallConfidence: Math.round(avgConfidence * 100) / 100,
      platforms,
      resolvedAt: new Date().toISOString(),
    };
  }

  getSeed(): IdentitySeed { return this.seed; }
  getIdentities(): PlatformIdentity[] { return this.identities; }

  private buildProfileUrl(platform: Platform, username: string): string {
    const urls: Partial<Record<Platform, string>> = {
      github: `https://github.com/${username}`,
      gitlab: `https://gitlab.com/${username}`,
      stackoverflow: `https://stackoverflow.com/users/${username}`,
      leetcode: `https://leetcode.com/u/${username}`,
      kaggle: `https://www.kaggle.com/${username}`,
      codeforces: `https://codeforces.com/profile/${username}`,
      devto: `https://dev.to/${username}`,
      huggingface: `https://huggingface.co/${username}`,
      dockerhub: `https://hub.docker.com/u/${username}`,
      cratesio: `https://crates.io/users/${username}`,
      twitter: `https://x.com/${username}`,
      linkedin: `https://linkedin.com/in/${username}`,
      medium: `https://medium.com/@${username}`,
      hashnode: `https://${username}.hashnode.dev`,
      npm: `https://www.npmjs.com/~${username}`,
    };
    return urls[platform] || `https://${platform}.com/${username}`;
  }
}

/* ══════════════════════════════════════════════════════════════
   Persistence (same pattern as token-tracker)
   ══════════════════════════════════════════════════════════════ */

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'identity-graph.json');

const graphCache = new Map<string, UnifiedDeveloper>();

function loadFromDisk(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const dev of raw) graphCache.set(dev.id, dev);
      }
    }
  } catch { /* start fresh */ }
}

function saveToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(graphCache.values()), null, 2));
  } catch { /* non-critical */ }
}

loadFromDisk();
setInterval(saveToDisk, 60_000);

export function saveUnifiedDeveloper(dev: UnifiedDeveloper): void {
  graphCache.set(dev.id, dev);
}

export function getUnifiedDeveloper(githubUsername: string): UnifiedDeveloper | null {
  return graphCache.get(`dev:${githubUsername}`) || null;
}
