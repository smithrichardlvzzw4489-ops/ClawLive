/**
 * Optional helper for hosts that can run TypeScript.
 * Agents typically follow SKILL.md only; this is not required for the skill to work.
 */

export type GitHubPortraitPollOptions = {
  /** e.g. https://clawlab.live */
  baseUrl: string;
  /** GitHub login, without @ */
  githubUsername: string;
  /** Agent API Key: `clw_...` (the key owner is charged profile_lookup quota on new crawls) */
  agentApiKey: string;
  /** ms between GET polls */
  pollIntervalMs?: number;
  /** max wait ms */
  maxWaitMs?: number;
};

export type GitHubPortraitReady = {
  status: 'ready';
  crawl: unknown;
  analysis: Record<string, unknown>;
  multiPlatform: unknown | null;
  avatarUrl?: string;
  cachedAt?: number;
};

export type GitHubPortraitPending = {
  status: 'pending';
  progress: { stage: string; percent: number; detail: string; error?: string };
};

export type GitHubPortraitPollResult =
  | GitHubPortraitReady
  | GitHubPortraitPending
  | { status: 'error'; message: string; httpStatus?: number; body?: unknown };

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeUser(u: string): string {
  return u.trim().replace(/^@/, '').toLowerCase();
}

function authHeaders(agentApiKey: string): Record<string, string> {
  const key = agentApiKey.trim();
  if (!key.startsWith('clw_')) {
    throw new Error('agentApiKey must start with clw_');
  }
  return { Authorization: `Bearer ${key}` };
}

/**
 * POST to start (or noop if cached / running), then GET until ready or timeout.
 * Uses /api/open/codernet/github/ — requires Agent Key on every request.
 */
export async function pollGitHubPortrait(options: GitHubPortraitPollOptions): Promise<GitHubPortraitPollResult> {
  const base = normalizeBase(options.baseUrl);
  const user = normalizeUser(options.githubUsername);
  const pollIntervalMs = options.pollIntervalMs ?? 3000;
  const maxWaitMs = options.maxWaitMs ?? 300_000;
  const path = `${base}/api/open/codernet/github/${encodeURIComponent(user)}`;
  const headers = authHeaders(options.agentApiKey);

  const postRes = await fetch(path, { method: 'POST', headers });
  if (postRes.status === 429) {
    const getOnce = await fetch(path, { method: 'GET', headers });
    if (getOnce.ok) {
      const data = (await getOnce.json()) as Record<string, unknown>;
      if (data.status === 'ready') return data as unknown as GitHubPortraitReady;
    }
    let body: unknown;
    try {
      body = await postRes.json();
    } catch {
      body = await postRes.text();
    }
    return { status: 'error', message: 'Quota or rate limit on POST', httpStatus: 429, body };
  }
  if (!postRes.ok) {
    let body: unknown;
    try {
      body = await postRes.json();
    } catch {
      body = await postRes.text();
    }
    return { status: 'error', message: `POST failed: ${postRes.status}`, httpStatus: postRes.status, body };
  }

  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const getRes = await fetch(path, { method: 'GET', headers });
    if (!getRes.ok) {
      if (getRes.status === 401) {
        let body: unknown;
        try {
          body = await getRes.json();
        } catch {
          body = await getRes.text();
        }
        return { status: 'error', message: 'Invalid or missing Agent API key', httpStatus: 401, body };
      }
      if (getRes.status === 404) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }
      let body: unknown;
      try {
        body = await getRes.json();
      } catch {
        body = await getRes.text();
      }
      return { status: 'error', message: `GET failed: ${getRes.status}`, httpStatus: getRes.status, body };
    }

    const data = (await getRes.json()) as Record<string, unknown>;
    const status = data.status as string;

    if (status === 'ready') {
      return data as unknown as GitHubPortraitReady;
    }

    if (status === 'pending') {
      const progress = data.progress as GitHubPortraitPending['progress'];
      if (progress?.stage === 'error') {
        return { status: 'error', message: progress.error || 'Crawl error', body: data };
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return { status: 'error', message: 'Timed out waiting for portrait' };
}

export default pollGitHubPortrait;
