/**
 * 多平台数据爬取：从 GitHub 出发，自动关联并采集 Stack Overflow / npm / PyPI / DEV.to 数据。
 *
 * 1. 身份解析：从 GitHub profile 提取 email / blog / username → 匹配其他平台
 * 2. 各平台公开 API 采集
 * 3. 汇总为 MultiPlatformProfile
 */

const SO_API = 'https://api.stackexchange.com/2.3';
const NPM_REGISTRY = 'https://registry.npmjs.org';
const PYPI_API = 'https://pypi.org';
const DEVTO_API = 'https://dev.to/api';
const HF_API = 'https://huggingface.co/api';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export interface StackOverflowProfile {
  userId: number;
  displayName: string;
  reputation: number;
  goldBadges: number;
  silverBadges: number;
  bronzeBadges: number;
  answerCount: number;
  questionCount: number;
  acceptRate: number | null;
  topTags: Array<{ name: string; answerCount: number; answerScore: number }>;
  profileUrl: string;
}

export interface NpmPackageInfo {
  name: string;
  description: string;
  version: string;
  weeklyDownloads: number;
  dependentsCount?: number;
  keywords: string[];
  homepage: string | null;
  repository: string | null;
}

export interface PyPIPackageInfo {
  name: string;
  summary: string;
  version: string;
  downloadsInfo: string;
  keywords: string[];
  homePage: string | null;
  projectUrl: string;
}

export interface DevToProfile {
  username: string;
  name: string;
  articlesCount: number;
  totalReactions: number;
  totalComments: number;
  followers: number;
  topArticles: Array<{ title: string; url: string; positiveReactions: number; publishedAt: string; tags: string[] }>;
}

export interface HuggingFaceModel {
  id: string;
  modelId: string;
  likes: number;
  downloads: number;
  tags: string[];
  pipelineTag: string | null;
  lastModified: string;
}

export interface HuggingFaceDataset {
  id: string;
  likes: number;
  downloads: number;
  tags: string[];
  lastModified: string;
}

export interface HuggingFaceSpace {
  id: string;
  likes: number;
  sdk: string | null;
  tags: string[];
  lastModified: string;
}

export interface HuggingFaceProfile {
  username: string;
  fullname: string;
  avatarUrl: string | null;
  models: HuggingFaceModel[];
  datasets: HuggingFaceDataset[];
  spaces: HuggingFaceSpace[];
  totalLikes: number;
  totalDownloads: number;
  topPipelineTags: string[];
  profileUrl: string;
}

export interface MultiPlatformProfile {
  githubUsername: string;
  resolvedAt: string;
  identityLinks: {
    stackOverflow: { matched: boolean; method?: string; userId?: number };
    npm: { matched: boolean; method?: string; packageCount?: number };
    pypi: { matched: boolean; method?: string; packageCount?: number };
    devto: { matched: boolean; method?: string };
    huggingface: { matched: boolean; method?: string; modelCount?: number; datasetCount?: number; spaceCount?: number };
  };
  stackOverflow: StackOverflowProfile | null;
  npmPackages: NpmPackageInfo[];
  pypiPackages: PyPIPackageInfo[];
  devto: DevToProfile | null;
  huggingface: HuggingFaceProfile | null;
}

export type PlatformCrawlCallback = (platform: string, detail: string) => void;

/* ══════════════════════════════════════════════════════════════
   Identity Resolution: GitHub → 其他平台
   ══════════════════════════════════════════════════════════════ */

interface GitHubIdentity {
  username: string;
  email: string | null;
  blog: string | null;
  bio: string | null;
  name: string | null;
  twitterUsername: string | null;
}

async function fetchGitHubIdentity(username: string, token?: string): Promise<GitHubIdentity> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/users/${username}`, { headers });
  if (!res.ok) throw new Error(`GitHub user API ${res.status}`);
  const u = await res.json();
  return {
    username: u.login,
    email: u.email,
    blog: u.blog || null,
    bio: u.bio || null,
    name: u.name || null,
    twitterUsername: u.twitter_username || null,
  };
}

/* ══════════════════════════════════════════════════════════════
   Stack Overflow
   ══════════════════════════════════════════════════════════════ */

async function findStackOverflowUser(identity: GitHubIdentity): Promise<{ profile: StackOverflowProfile; method: string } | null> {
  const trySearch = async (query: string, method: string): Promise<{ profile: StackOverflowProfile; method: string } | null> => {
    try {
      const params = new URLSearchParams({
        order: 'desc',
        sort: 'reputation',
        inname: query,
        site: 'stackoverflow',
        filter: '!nNPvSNP4(R',
        pagesize: '5',
      });
      const res = await fetch(`${SO_API}/users?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.items?.length) return null;

      const best = data.items[0];
      const profile = await enrichSOProfile(best.user_id);
      if (profile) return { profile, method };
    } catch {}
    return null;
  };

  if (identity.name) {
    const r = await trySearch(identity.name, 'name_match');
    if (r) return r;
  }

  const r2 = await trySearch(identity.username, 'username_match');
  if (r2) return r2;

  return null;
}

async function enrichSOProfile(userId: number): Promise<StackOverflowProfile | null> {
  try {
    const [userRes, tagsRes] = await Promise.all([
      fetch(`${SO_API}/users/${userId}?site=stackoverflow&filter=!nNPvSNP4(R`),
      fetch(`${SO_API}/users/${userId}/top-answer-tags?site=stackoverflow&pagesize=8`),
    ]);

    if (!userRes.ok) return null;
    const userData = await userRes.json();
    const user = userData.items?.[0];
    if (!user) return null;

    let topTags: StackOverflowProfile['topTags'] = [];
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      topTags = (tagsData.items || []).slice(0, 8).map((t: any) => ({
        name: t.tag_name,
        answerCount: t.answer_count || 0,
        answerScore: t.answer_score || 0,
      }));
    }

    return {
      userId: user.user_id,
      displayName: user.display_name || '',
      reputation: user.reputation || 0,
      goldBadges: user.badge_counts?.gold || 0,
      silverBadges: user.badge_counts?.silver || 0,
      bronzeBadges: user.badge_counts?.bronze || 0,
      answerCount: user.answer_count || 0,
      questionCount: user.question_count || 0,
      acceptRate: user.accept_rate ?? null,
      topTags,
      profileUrl: user.link || `https://stackoverflow.com/users/${userId}`,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   npm
   ══════════════════════════════════════════════════════════════ */

async function findNpmPackages(
  identity: GitHubIdentity,
  githubRepos: string[],
): Promise<{ packages: NpmPackageInfo[]; method: string }> {
  const packages: NpmPackageInfo[] = [];
  const seen = new Set<string>();

  const searchByMaintainer = async (username: string) => {
    try {
      const res = await fetch(`${NPM_REGISTRY}/-/v1/search?text=maintainer:${encodeURIComponent(username)}&size=20`);
      if (!res.ok) return;
      const data = await res.json();
      for (const obj of data.objects || []) {
        const pkg = obj.package;
        if (seen.has(pkg.name)) continue;
        seen.add(pkg.name);

        const downloads = await fetchNpmWeeklyDownloads(pkg.name);
        packages.push({
          name: pkg.name,
          description: pkg.description || '',
          version: pkg.version || '',
          weeklyDownloads: downloads,
          keywords: pkg.keywords || [],
          homepage: pkg.links?.homepage || null,
          repository: pkg.links?.repository || null,
        });
      }
    } catch {}
  };

  await searchByMaintainer(identity.username);

  if (identity.email) {
    const emailPrefix = identity.email.split('@')[0];
    if (emailPrefix !== identity.username) {
      await searchByMaintainer(emailPrefix);
    }
  }

  const method = packages.length > 0 ? 'maintainer_search' : 'none';
  return { packages: packages.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads).slice(0, 10), method };
}

async function fetchNpmWeeklyDownloads(packageName: string): Promise<number> {
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.downloads || 0;
  } catch {
    return 0;
  }
}

/* ══════════════════════════════════════════════════════════════
   PyPI
   ══════════════════════════════════════════════════════════════ */

async function findPyPIPackages(
  identity: GitHubIdentity,
  githubRepos: string[],
): Promise<{ packages: PyPIPackageInfo[]; method: string }> {
  const packages: PyPIPackageInfo[] = [];
  const seen = new Set<string>();

  const checkPackage = async (name: string) => {
    if (seen.has(name.toLowerCase())) return;
    try {
      const res = await fetch(`${PYPI_API}/pypi/${encodeURIComponent(name)}/json`);
      if (!res.ok) return;
      const data = await res.json();
      const info = data.info;

      const authorMatch =
        info.author?.toLowerCase().includes(identity.username.toLowerCase()) ||
        info.author_email?.toLowerCase().includes(identity.username.toLowerCase()) ||
        (identity.email && info.author_email?.toLowerCase().includes(identity.email.toLowerCase())) ||
        info.home_page?.includes(`github.com/${identity.username}`);

      if (!authorMatch) return;

      seen.add(name.toLowerCase());
      packages.push({
        name: info.name,
        summary: info.summary || '',
        version: info.version || '',
        downloadsInfo: info.downloads ? `${info.downloads.last_month || 0}/month` : 'N/A',
        keywords: info.keywords?.split(',').map((k: string) => k.trim()).filter(Boolean) || [],
        homePage: info.home_page || null,
        projectUrl: info.project_url || `https://pypi.org/project/${info.name}/`,
      });
    } catch {}
  };

  for (const repo of githubRepos.slice(0, 10)) {
    await checkPackage(repo);
    await checkPackage(repo.replace(/-/g, '_'));
    await checkPackage(repo.replace(/_/g, '-'));
  }

  return { packages: packages.slice(0, 10), method: packages.length > 0 ? 'repo_name_match' : 'none' };
}

/* ══════════════════════════════════════════════════════════════
   DEV.to
   ══════════════════════════════════════════════════════════════ */

async function findDevToProfile(identity: GitHubIdentity): Promise<{ profile: DevToProfile; method: string } | null> {
  const tryUsername = async (username: string): Promise<DevToProfile | null> => {
    try {
      const res = await fetch(`${DEVTO_API}/users/by_username?url=${encodeURIComponent(username)}`);
      if (!res.ok) return null;
      const user = await res.json();
      if (!user.id) return null;

      const articlesRes = await fetch(`${DEVTO_API}/articles?username=${encodeURIComponent(username)}&per_page=10`);
      let topArticles: DevToProfile['topArticles'] = [];
      let totalReactions = 0;
      let totalComments = 0;
      if (articlesRes.ok) {
        const articles = await articlesRes.json();
        topArticles = (articles || []).slice(0, 5).map((a: any) => ({
          title: a.title,
          url: a.url,
          positiveReactions: a.positive_reactions_count || 0,
          publishedAt: a.published_at,
          tags: a.tag_list || [],
        }));
        for (const a of articles || []) {
          totalReactions += a.positive_reactions_count || 0;
          totalComments += a.comments_count || 0;
        }
      }

      return {
        username: user.username,
        name: user.name || user.username,
        articlesCount: user.articles_count || topArticles.length,
        totalReactions,
        totalComments,
        followers: user.followers_count || 0,
        topArticles,
      };
    } catch {
      return null;
    }
  };

  const profile = await tryUsername(identity.username);
  if (profile) return { profile, method: 'username_match' };

  return null;
}

/* ══════════════════════════════════════════════════════════════
   Hugging Face
   ══════════════════════════════════════════════════════════════ */

async function findHuggingFaceProfile(identity: GitHubIdentity): Promise<{ profile: HuggingFaceProfile; method: string } | null> {
  const tryUser = async (username: string): Promise<HuggingFaceProfile | null> => {
    try {
      const [modelsRes, datasetsRes, spacesRes] = await Promise.all([
        fetch(`${HF_API}/models?author=${encodeURIComponent(username)}&sort=downloads&direction=-1&limit=20`),
        fetch(`${HF_API}/datasets?author=${encodeURIComponent(username)}&sort=downloads&direction=-1&limit=10`),
        fetch(`${HF_API}/spaces?author=${encodeURIComponent(username)}&sort=likes&direction=-1&limit=10`),
      ]);

      const models: HuggingFaceModel[] = [];
      const datasets: HuggingFaceDataset[] = [];
      const spaces: HuggingFaceSpace[] = [];

      if (modelsRes.ok) {
        const raw = await modelsRes.json();
        for (const m of (raw as any[]) || []) {
          models.push({
            id: m._id || m.id || '',
            modelId: m.modelId || m.id || '',
            likes: m.likes || 0,
            downloads: m.downloads || 0,
            tags: m.tags || [],
            pipelineTag: m.pipeline_tag || null,
            lastModified: m.lastModified || '',
          });
        }
      }

      if (datasetsRes.ok) {
        const raw = await datasetsRes.json();
        for (const d of (raw as any[]) || []) {
          datasets.push({
            id: d._id || d.id || '',
            likes: d.likes || 0,
            downloads: d.downloads || 0,
            tags: d.tags || [],
            lastModified: d.lastModified || '',
          });
        }
      }

      if (spacesRes.ok) {
        const raw = await spacesRes.json();
        for (const s of (raw as any[]) || []) {
          spaces.push({
            id: s._id || s.id || '',
            likes: s.likes || 0,
            sdk: s.sdk || null,
            tags: s.tags || [],
            lastModified: s.lastModified || '',
          });
        }
      }

      if (models.length === 0 && datasets.length === 0 && spaces.length === 0) {
        return null;
      }

      const totalLikes = models.reduce((s, m) => s + m.likes, 0) +
        datasets.reduce((s, d) => s + d.likes, 0) +
        spaces.reduce((s, sp) => s + sp.likes, 0);
      const totalDownloads = models.reduce((s, m) => s + m.downloads, 0) +
        datasets.reduce((s, d) => s + d.downloads, 0);

      const pipelineTags = new Map<string, number>();
      for (const m of models) {
        if (m.pipelineTag) {
          pipelineTags.set(m.pipelineTag, (pipelineTags.get(m.pipelineTag) || 0) + 1);
        }
      }
      const topPipelineTags = [...pipelineTags.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      return {
        username,
        fullname: username,
        avatarUrl: `https://huggingface.co/avatars/${username}`,
        models: models.slice(0, 10),
        datasets: datasets.slice(0, 5),
        spaces: spaces.slice(0, 5),
        totalLikes,
        totalDownloads,
        topPipelineTags,
        profileUrl: `https://huggingface.co/${username}`,
      };
    } catch {
      return null;
    }
  };

  const profile = await tryUser(identity.username);
  if (profile) return { profile, method: 'username_match' };

  return null;
}

/* ══════════════════════════════════════════════════════════════
   Main: 完整多平台爬取
   ══════════════════════════════════════════════════════════════ */

export async function crawlMultiPlatform(
  githubUsername: string,
  githubRepos: string[],
  token?: string,
  onProgress?: PlatformCrawlCallback,
): Promise<MultiPlatformProfile> {
  onProgress?.('identity', 'Resolving cross-platform identity...');
  const identity = await fetchGitHubIdentity(githubUsername, token);

  const result: MultiPlatformProfile = {
    githubUsername,
    resolvedAt: new Date().toISOString(),
    identityLinks: {
      stackOverflow: { matched: false },
      npm: { matched: false },
      pypi: { matched: false },
      devto: { matched: false },
      huggingface: { matched: false },
    },
    stackOverflow: null,
    npmPackages: [],
    pypiPackages: [],
    devto: null,
    huggingface: null,
  };

  const tasks = [
    (async () => {
      onProgress?.('stackoverflow', 'Searching Stack Overflow...');
      const so = await findStackOverflowUser(identity);
      if (so) {
        result.stackOverflow = so.profile;
        result.identityLinks.stackOverflow = {
          matched: true,
          method: so.method,
          userId: so.profile.userId,
        };
        onProgress?.('stackoverflow', `Found: ${so.profile.displayName} (${so.profile.reputation.toLocaleString()} rep)`);
      } else {
        onProgress?.('stackoverflow', 'No Stack Overflow profile found');
      }
    })(),

    (async () => {
      onProgress?.('npm', 'Searching npm packages...');
      const npm = await findNpmPackages(identity, githubRepos);
      result.npmPackages = npm.packages;
      result.identityLinks.npm = {
        matched: npm.packages.length > 0,
        method: npm.method,
        packageCount: npm.packages.length,
      };
      if (npm.packages.length > 0) {
        const totalDl = npm.packages.reduce((s, p) => s + p.weeklyDownloads, 0);
        onProgress?.('npm', `Found ${npm.packages.length} packages (${totalDl.toLocaleString()} weekly downloads)`);
      } else {
        onProgress?.('npm', 'No npm packages found');
      }
    })(),

    (async () => {
      onProgress?.('pypi', 'Searching PyPI packages...');
      const pypi = await findPyPIPackages(identity, githubRepos);
      result.pypiPackages = pypi.packages;
      result.identityLinks.pypi = {
        matched: pypi.packages.length > 0,
        method: pypi.method,
        packageCount: pypi.packages.length,
      };
      onProgress?.('pypi', pypi.packages.length > 0 ? `Found ${pypi.packages.length} packages` : 'No PyPI packages found');
    })(),

    (async () => {
      onProgress?.('devto', 'Searching DEV.to...');
      const devto = await findDevToProfile(identity);
      if (devto) {
        result.devto = devto.profile;
        result.identityLinks.devto = { matched: true, method: devto.method };
        onProgress?.('devto', `Found: ${devto.profile.articlesCount} articles, ${devto.profile.totalReactions} reactions`);
      } else {
        onProgress?.('devto', 'No DEV.to profile found');
      }
    })(),

    (async () => {
      onProgress?.('huggingface', 'Searching Hugging Face models, datasets & spaces...');
      const hf = await findHuggingFaceProfile(identity);
      if (hf) {
        result.huggingface = hf.profile;
        result.identityLinks.huggingface = {
          matched: true,
          method: hf.method,
          modelCount: hf.profile.models.length,
          datasetCount: hf.profile.datasets.length,
          spaceCount: hf.profile.spaces.length,
        };
        onProgress?.('huggingface', `Found: ${hf.profile.models.length} models, ${hf.profile.datasets.length} datasets, ${hf.profile.spaces.length} spaces (${hf.profile.totalDownloads.toLocaleString()} downloads)`);
      } else {
        onProgress?.('huggingface', 'No Hugging Face profile found');
      }
    })(),
  ];

  await Promise.allSettled(tasks);

  return result;
}
