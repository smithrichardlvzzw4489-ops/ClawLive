/**
 * 扩展平台爬虫 — GitLab / LeetCode / Kaggle / Codeforces / Docker Hub / crates.io
 *
 * 每个平台函数返回 null 表示未找到，返回数据表示匹配成功。
 * 所有 API 调用都有超时保护，不会阻塞整个 pipeline。
 */

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export interface GitLabProfile {
  id: number;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  topProjects: Array<{
    name: string;
    description: string | null;
    stars: number;
    forks: number;
    language: string | null;
    url: string;
    lastActivity: string;
  }>;
  profileUrl: string;
}

export interface LeetCodeProfile {
  username: string;
  realName: string | null;
  ranking: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  acceptanceRate: number;
  contestRating: number | null;
  contestGlobalRanking: number | null;
  contestAttended: number;
  badges: string[];
  profileUrl: string;
}

export interface KaggleProfile {
  username: string;
  displayName: string;
  tier: string;
  points: number;
  goldMedals: number;
  silverMedals: number;
  bronzeMedals: number;
  totalCompetitions: number;
  totalDatasets: number;
  totalNotebooks: number;
  followers: number;
  bio: string | null;
  profileUrl: string;
}

export interface CodeforcesProfile {
  handle: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
  contribution: number;
  friendOfCount: number;
  titlePhoto: string | null;
  organization: string | null;
  city: string | null;
  country: string | null;
  contestCount: number;
  profileUrl: string;
}

export interface DockerHubProfile {
  username: string;
  fullName: string;
  location: string;
  company: string;
  dateJoined: string;
  repositories: Array<{
    name: string;
    description: string | null;
    pullCount: number;
    starCount: number;
    isOfficial: boolean;
    lastUpdated: string;
  }>;
  totalPulls: number;
  totalStars: number;
  profileUrl: string;
}

export interface CratesIoProfile {
  username: string;
  name: string | null;
  avatarUrl: string | null;
  crates: Array<{
    name: string;
    description: string | null;
    downloads: number;
    recentDownloads: number;
    maxVersion: string;
    repository: string | null;
  }>;
  totalDownloads: number;
  totalCrates: number;
  profileUrl: string;
}

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */

async function safeFetch(url: string, options?: RequestInit & { timeoutMs?: number }): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 8000);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'ClawLab-Codernet/1.0',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   GitLab
   ══════════════════════════════════════════════════════════════ */

export async function findGitLabProfile(username: string): Promise<GitLabProfile | null> {
  const userRes = await safeFetch(
    `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`,
  );
  if (!userRes?.ok) return null;
  const users = await userRes.json();
  if (!Array.isArray(users) || users.length === 0) return null;

  const user = users[0];
  const userId = user.id;

  const projRes = await safeFetch(
    `https://gitlab.com/api/v4/users/${userId}/projects?order_by=star_count&sort=desc&per_page=10&visibility=public`,
  );
  const projects = projRes?.ok ? await projRes.json() : [];

  return {
    id: userId,
    username: user.username,
    name: user.name || user.username,
    avatarUrl: user.avatar_url || null,
    bio: user.bio || null,
    location: user.location || null,
    publicRepos: user.public_repos || projects.length,
    followers: user.followers || 0,
    following: user.following || 0,
    websiteUrl: user.website_url || null,
    linkedinUrl: user.linkedin || null,
    twitterUrl: user.twitter || null,
    topProjects: (projects as any[]).slice(0, 8).map((p: any) => ({
      name: p.name,
      description: p.description || null,
      stars: p.star_count || 0,
      forks: p.forks_count || 0,
      language: null,
      url: p.web_url,
      lastActivity: p.last_activity_at || '',
    })),
    profileUrl: user.web_url || `https://gitlab.com/${username}`,
  };
}

/* ══════════════════════════════════════════════════════════════
   LeetCode (public GraphQL API)
   ══════════════════════════════════════════════════════════════ */

export async function findLeetCodeProfile(username: string): Promise<LeetCodeProfile | null> {
  // LeetCode has a public GraphQL endpoint
  const query = `
    query userProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile { realName ranking }
        submitStats: submitStatsGlobal {
          acSubmissionNum { difficulty count }
        }
        badges { displayName }
      }
      userContestRanking(username: $username) {
        rating
        globalRanking
        attendedContestsCount
      }
    }
  `;

  const res = await safeFetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { username } }),
    timeoutMs: 10000,
  });

  if (!res?.ok) return null;

  try {
    const data = await res.json();
    const user = data?.data?.matchedUser;
    if (!user) return null;

    const acStats = user.submitStats?.acSubmissionNum || [];
    const easy = acStats.find((s: any) => s.difficulty === 'Easy')?.count || 0;
    const medium = acStats.find((s: any) => s.difficulty === 'Medium')?.count || 0;
    const hard = acStats.find((s: any) => s.difficulty === 'Hard')?.count || 0;
    const total = acStats.find((s: any) => s.difficulty === 'All')?.count || (easy + medium + hard);

    const contest = data?.data?.userContestRanking;

    return {
      username: user.username,
      realName: user.profile?.realName || null,
      ranking: user.profile?.ranking || 0,
      totalSolved: total,
      easySolved: easy,
      mediumSolved: medium,
      hardSolved: hard,
      acceptanceRate: 0,
      contestRating: contest?.rating ? Math.round(contest.rating) : null,
      contestGlobalRanking: contest?.globalRanking || null,
      contestAttended: contest?.attendedContestsCount || 0,
      badges: (user.badges || []).map((b: any) => b.displayName),
      profileUrl: `https://leetcode.com/u/${username}`,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Kaggle
   ══════════════════════════════════════════════════════════════ */

export async function findKaggleProfile(username: string): Promise<KaggleProfile | null> {
  // Kaggle doesn't have a fully public API without auth, but the profile page
  // exposes JSON data. We attempt to fetch the public user profile page and parse
  // metadata from the page source.
  const res = await safeFetch(`https://www.kaggle.com/api/v1/users/${username}`, {
    timeoutMs: 8000,
  });

  if (!res) return null;

  // Kaggle API returns 403 without credentials, try scraping the public profile page
  if (!res.ok) {
    const pageRes = await safeFetch(`https://www.kaggle.com/${username}`, {
      headers: { Accept: 'text/html' },
      timeoutMs: 8000,
    });
    if (!pageRes?.ok) return null;

    try {
      const html = await pageRes.text();
      // Try to extract from window.__INITIAL_STATE__ or similar
      const stateMatch = html.match(/"tier"\s*:\s*"([^"]+)"/);
      const pointsMatch = html.match(/"points"\s*:\s*(\d+)/);
      const displayMatch = html.match(/"displayName"\s*:\s*"([^"]+)"/);

      return {
        username,
        displayName: displayMatch?.[1] || username,
        tier: stateMatch?.[1] || 'Unknown',
        points: pointsMatch ? parseInt(pointsMatch[1], 10) : 0,
        goldMedals: 0,
        silverMedals: 0,
        bronzeMedals: 0,
        totalCompetitions: 0,
        totalDatasets: 0,
        totalNotebooks: 0,
        followers: 0,
        bio: null,
        profileUrl: `https://www.kaggle.com/${username}`,
      };
    } catch {
      return null;
    }
  }

  try {
    const data = await res.json();
    return {
      username: data.userName || username,
      displayName: data.displayName || username,
      tier: data.tier || 'Unknown',
      points: data.points || 0,
      goldMedals: data.goldMedals || 0,
      silverMedals: data.silverMedals || 0,
      bronzeMedals: data.bronzeMedals || 0,
      totalCompetitions: data.totalCompetitions || 0,
      totalDatasets: data.totalDatasets || 0,
      totalNotebooks: data.totalNotebooks || 0,
      followers: data.followers || 0,
      bio: data.bio || null,
      profileUrl: `https://www.kaggle.com/${data.userName || username}`,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Codeforces
   ══════════════════════════════════════════════════════════════ */

export async function findCodeforcesProfile(username: string): Promise<CodeforcesProfile | null> {
  const res = await safeFetch(
    `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`,
  );
  if (!res?.ok) return null;

  try {
    const data = await res.json();
    if (data.status !== 'OK' || !data.result?.length) return null;

    const user = data.result[0];

    // Get contest history count
    const ratingRes = await safeFetch(
      `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(username)}`,
    );
    let contestCount = 0;
    if (ratingRes?.ok) {
      const ratingData = await ratingRes.json();
      contestCount = ratingData.result?.length || 0;
    }

    return {
      handle: user.handle,
      rating: user.rating || 0,
      maxRating: user.maxRating || 0,
      rank: user.rank || 'unrated',
      maxRank: user.maxRank || 'unrated',
      contribution: user.contribution || 0,
      friendOfCount: user.friendOfCount || 0,
      titlePhoto: user.titlePhoto || null,
      organization: user.organization || null,
      city: user.city || null,
      country: user.country || null,
      contestCount,
      profileUrl: `https://codeforces.com/profile/${user.handle}`,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Docker Hub
   ══════════════════════════════════════════════════════════════ */

export async function findDockerHubProfile(username: string): Promise<DockerHubProfile | null> {
  const userRes = await safeFetch(`https://hub.docker.com/v2/users/${encodeURIComponent(username)}`);
  if (!userRes?.ok) return null;

  try {
    const user = await userRes.json();

    const repoRes = await safeFetch(
      `https://hub.docker.com/v2/repositories/${encodeURIComponent(username)}/?page_size=15&ordering=-pull_count`,
    );
    let repos: any[] = [];
    if (repoRes?.ok) {
      const repoData = await repoRes.json();
      repos = repoData.results || [];
    }

    const repositories = repos.map((r: any) => ({
      name: r.name,
      description: r.description || null,
      pullCount: r.pull_count || 0,
      starCount: r.star_count || 0,
      isOfficial: r.is_official || false,
      lastUpdated: r.last_updated || '',
    }));

    return {
      username: user.username || username,
      fullName: user.full_name || '',
      location: user.location || '',
      company: user.company || '',
      dateJoined: user.date_joined || '',
      repositories,
      totalPulls: repositories.reduce((s, r) => s + r.pullCount, 0),
      totalStars: repositories.reduce((s, r) => s + r.starCount, 0),
      profileUrl: `https://hub.docker.com/u/${username}`,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   crates.io (Rust)
   ══════════════════════════════════════════════════════════════ */

export async function findCratesIoProfile(username: string): Promise<CratesIoProfile | null> {
  // crates.io uses GitHub user IDs for user lookup, but we can search by username
  const userRes = await safeFetch(
    `https://crates.io/api/v1/users/${encodeURIComponent(username)}`,
  );

  if (!userRes?.ok) return null;

  try {
    const userData = await userRes.json();
    const user = userData.user;
    if (!user) return null;

    const cratesRes = await safeFetch(
      `https://crates.io/api/v1/crates?user_id=${user.id}&per_page=15&sort=downloads`,
    );
    let crates: any[] = [];
    if (cratesRes?.ok) {
      const cratesData = await cratesRes.json();
      crates = cratesData.crates || [];
    }

    const crateList = crates.map((c: any) => ({
      name: c.name,
      description: c.description || null,
      downloads: c.downloads || 0,
      recentDownloads: c.recent_downloads || 0,
      maxVersion: c.max_version || '',
      repository: c.repository || null,
    }));

    return {
      username: user.login || username,
      name: user.name || null,
      avatarUrl: user.avatar || null,
      crates: crateList,
      totalDownloads: crateList.reduce((s, c) => s + c.downloads, 0),
      totalCrates: crateList.length,
      profileUrl: `https://crates.io/users/${user.login || username}`,
    };
  } catch {
    return null;
  }
}
