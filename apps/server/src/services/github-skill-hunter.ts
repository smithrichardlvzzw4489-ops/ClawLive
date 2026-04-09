/**
 * GitHub 上检索符合 Agent Skills 惯例的 SKILL.md 技能包（服务端实现）。
 * 使用 Code Search 优先定位 filename:SKILL.md，不足时回退到仓库搜索。
 * 配置 GITHUB_TOKEN 或 GH_TOKEN 可显著提高额度与成功率。
 *
 * 不在服务器上执行 git clone / 写入 OpenClaw 目录；仅返回可审计的链接与元数据。
 */
const UA = 'ClawLive-GitHubSkillHunter/1.0';

export type GitHubSkillRepoHit = {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  skillPath?: string;
  skillFileUrl?: string;
  stars?: number;
  pushedAt?: string;
  searchSource: 'code_skill_md' | 'repo_search';
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

function sanitizeKeywordFragment(s: string): string {
  return s
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** 从进化器改进项拼出用于 GitHub 的检索串（多段合并） */
export function buildKeywordsFromImprovements(improvements: string[]): string {
  const parts = improvements
    .slice(0, 4)
    .map((line) => line.replace(/[，,、;；]/g, ' ').trim())
    .filter(Boolean);
  const merged = parts.join(' ');
  const cleaned = sanitizeKeywordFragment(merged);
  return cleaned || 'agent skill automation';
}

async function fetchRepoMeta(
  fullName: string,
): Promise<{ stars: number; pushedAt: string | null; description: string | null } | null> {
  const url = `https://api.github.com/repos/${fullName}`;
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      stargazers_count?: number;
      pushed_at?: string;
      description?: string | null;
    };
    return {
      stars: j.stargazers_count ?? 0,
      pushedAt: j.pushed_at ?? null,
      description: j.description ?? null,
    };
  } catch {
    return null;
  }
}

type CodeSearchItem = {
  path: string;
  html_url: string;
  repository: { full_name: string; html_url: string };
};

export type GitHubSkillSearchResult = {
  hits: GitHubSkillRepoHit[];
  warnings: string[];
};

/**
 * 在 GitHub 上搜索可能包含 SKILL.md 的仓库（去重、按 star 排序）。
 */
export async function searchGitHubSkillPackages(options: {
  keywordsLine: string;
  perPage?: number;
}): Promise<GitHubSkillSearchResult> {
  const warnings: string[] = [];
  const perPage = Math.min(options.perPage ?? 10, 30);
  const keyword = sanitizeKeywordFragment(options.keywordsLine);
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    warnings.push(
      '未设置 GITHUB_TOKEN / GH_TOKEN：匿名请求易被限流或返回空结果，建议在部署环境配置 Token。',
    );
  }

  const seen = new Set<string>();
  const hits: GitHubSkillRepoHit[] = [];

  const codeQuery = `filename:SKILL.md ${keyword}`.trim().slice(0, 240);
  const codeUrl = `https://api.github.com/search/code?q=${encodeURIComponent(codeQuery)}&per_page=${Math.min(perPage + 10, 100)}`;
  try {
    const res = await fetch(codeUrl, { headers: authHeaders(), signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (!res.ok) {
      warnings.push(`Code Search HTTP ${res.status}：${text.slice(0, 200)}`);
    } else {
      const data = JSON.parse(text) as { items?: CodeSearchItem[]; message?: string };
      if (data.message) warnings.push(`Code Search：${data.message}`);
      for (const it of data.items ?? []) {
        const fullName = it.repository?.full_name;
        if (!fullName || seen.has(fullName)) continue;
        seen.add(fullName);
        hits.push({
          fullName,
          htmlUrl: it.repository.html_url,
          description: null,
          skillPath: it.path,
          skillFileUrl: it.html_url,
          searchSource: 'code_skill_md',
        });
        if (hits.length >= perPage) break;
      }
    }
  } catch (e) {
    warnings.push(`Code Search 请求失败：${e instanceof Error ? e.message : String(e)}`);
  }

  if (hits.length < 3) {
    const repoQuery = `${keyword} (skill OR agent OR mcp OR openclaw) stars:>2`.slice(0, 220);
    const repoUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(repoQuery)}&sort=stars&per_page=10`;
    try {
      const res = await fetch(repoUrl, { headers: authHeaders(), signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      if (!res.ok) {
        warnings.push(`仓库搜索 HTTP ${res.status}：${text.slice(0, 160)}`);
      } else {
        const data = JSON.parse(text) as {
          items?: Array<{ full_name: string; html_url: string; description: string | null }>;
          message?: string;
        };
        if (data.message) warnings.push(`仓库搜索：${data.message}`);
        for (const it of data.items ?? []) {
          if (!it.full_name || seen.has(it.full_name)) continue;
          seen.add(it.full_name);
          hits.push({
            fullName: it.full_name,
            htmlUrl: it.html_url,
            description: it.description,
            searchSource: 'repo_search',
          });
          if (hits.length >= perPage) break;
        }
      }
    } catch (e) {
      warnings.push(`仓库搜索失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const toEnrich = hits.slice(0, 8);
  await Promise.all(
    toEnrich.map(async (h) => {
      const meta = await fetchRepoMeta(h.fullName);
      if (meta) {
        h.stars = meta.stars;
        h.pushedAt = meta.pushedAt ?? undefined;
        if (!h.description && meta.description) h.description = meta.description;
      }
    }),
  );

  hits.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  return { hits, warnings };
}

/** GITLINK 进化器专用：从改进项列表检索 */
export async function searchGitHubSkillPackagesForEvolver(
  improvements: string[],
): Promise<GitHubSkillSearchResult> {
  const keywordsLine = buildKeywordsFromImprovements(improvements);
  return searchGitHubSkillPackages({ keywordsLine, perPage: 8 });
}

export function formatSkillHitsForLobster(hits: GitHubSkillRepoHit[], warnings: string[]): string {
  const lines: string[] = [];
  if (hits.length === 0) {
    lines.push('未找到匹配的公开仓库（可换英文关键词重试，或为部署环境配置 GITHUB_TOKEN）。');
  } else {
    hits.forEach((h, i) => {
      const star = h.stars != null ? ` ⭐${h.stars}` : '';
      const src = h.searchSource === 'code_skill_md' ? ' [含 SKILL.md 路径]' : ' [仓库搜索]';
      const pathLine = h.skillPath ? `\n  文件：${h.skillPath}` : '';
      const fileLine = h.skillFileUrl ? `\n  文件链接：${h.skillFileUrl}` : '';
      lines.push(
        `[${i + 1}] ${h.fullName}${star}${src}\n  仓库：${h.htmlUrl}${pathLine}${fileLine}\n  简介：${h.description ?? '（无）'}`,
      );
    });
  }
  lines.push('');
  lines.push(
    '安全提示：安装前请人工阅读仓库中的 SKILL.md，勿执行未声明的 curl|bash；本服务不会自动 clone 到服务器。',
  );
  if (warnings.length) {
    lines.push('');
    lines.push('诊断：' + warnings.join(' '));
  }
  return lines.join('\n');
}
