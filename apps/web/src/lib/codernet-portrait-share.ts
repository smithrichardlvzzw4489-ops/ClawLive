/**
 * Fetch public Codernet GitHub portrait for OG / share PNG generation (server/edge).
 */

export type CodernetPortraitSharePayload = {
  ghUsername: string;
  displayName: string;
  avatarUrl: string;
  oneLiner: string | null;
  bio: string | null;
  repos: number;
  stars: number;
  followers: number;
  sharpCommentary: string | null;
  techTags: string[];
  langs: { language: string; percent: number }[];
  quadrant: { frontend: number; backend: number; infra: number; ai_ml: number } | null;
  platforms: string[];
};

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function fetchCodernetPortraitForShare(
  ghUsername: string,
): Promise<CodernetPortraitSharePayload | null> {
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const u = decodeURIComponent(ghUsername).trim().toLowerCase();
  if (!u) return null;

  const res = await fetch(`${api}/api/codernet/github/${encodeURIComponent(u)}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    status?: string;
    crawl?: {
      username?: string;
      bio?: string | null;
      totalPublicRepos?: number;
      totalStars?: number;
      followers?: number;
    };
    analysis?: {
      oneLiner?: string;
      sharpCommentary?: string;
      techTags?: string[];
      languageDistribution?: { language: string; percent: number }[];
      capabilityQuadrant?: { frontend: number; backend: number; infra: number; ai_ml: number };
      platformsUsed?: string[];
    };
    avatarUrl?: string;
  };

  if (json.status !== 'ready' || !json.crawl) return null;

  const crawl = json.crawl;
  const analysis = json.analysis;
  const avatarUrl =
    json.avatarUrl?.trim() || `https://github.com/${encodeURIComponent(u)}.png`;

  return {
    ghUsername: u,
    displayName: crawl.username || u,
    avatarUrl,
    oneLiner: analysis?.oneLiner ?? null,
    bio: crawl.bio ?? null,
    repos: crawl.totalPublicRepos ?? 0,
    stars: crawl.totalStars ?? 0,
    followers: crawl.followers ?? 0,
    sharpCommentary: analysis?.sharpCommentary ?? null,
    techTags: Array.isArray(analysis?.techTags) ? analysis!.techTags!.slice(0, 24) : [],
    langs: Array.isArray(analysis?.languageDistribution)
      ? analysis!.languageDistribution!.slice(0, 8)
      : [],
    quadrant: analysis?.capabilityQuadrant ?? null,
    platforms: Array.isArray(analysis?.platformsUsed) && analysis!.platformsUsed!.length
      ? analysis!.platformsUsed!
      : ['GitHub'],
  };
}

export function truncateForOg(text: string | null | undefined, max: number): string {
  return truncate(text, max);
}
