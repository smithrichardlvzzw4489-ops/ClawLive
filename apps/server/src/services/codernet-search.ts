/**
 * Codernet 语义搜索：用户输入自然语言描述，LLM 从已有画像中匹配最相关的开发者。
 */

import { getPublishingLlmClient } from './llm';
import { prisma } from '../lib/prisma';
import type { CodernetAnalysis } from './codernet-profile-analyzer';

export interface DeveloperSearchResult {
  githubUsername: string;
  avatarUrl: string | null;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  source: 'platform' | 'cache';
  platformUsername?: string;
  stats?: {
    totalPublicRepos: number;
    totalStars: number;
    followers: number;
  };
  capabilityQuadrant?: CodernetAnalysis['capabilityQuadrant'];
}

interface ProfileSummary {
  key: string;
  ghUsername: string;
  avatarUrl: string | null;
  tags: string[];
  oneLiner: string;
  commentary: string;
  source: 'platform' | 'cache';
  platformUsername?: string;
  stats?: { totalPublicRepos: number; totalStars: number; followers: number };
  quadrant?: CodernetAnalysis['capabilityQuadrant'];
}

/**
 * Collect all available Codernet profiles from DB + in-memory cache.
 */
async function collectProfiles(
  lookupCache: Map<string, { crawl: any; analysis: any; avatarUrl?: string }>,
): Promise<ProfileSummary[]> {
  const profiles: ProfileSummary[] = [];

  const dbUsers = await prisma.user.findMany({
    where: { codernetAnalysis: { not: null } },
    select: {
      username: true,
      githubUsername: true,
      avatarUrl: true,
      codernetAnalysis: true,
      githubProfileJson: true,
    },
  });

  for (const u of dbUsers) {
    const a = u.codernetAnalysis as CodernetAnalysis | null;
    const crawl = u.githubProfileJson as Record<string, any> | null;
    if (!a || !u.githubUsername) continue;
    profiles.push({
      key: `db:${u.githubUsername}`,
      ghUsername: u.githubUsername,
      avatarUrl: u.avatarUrl,
      tags: a.techTags || [],
      oneLiner: a.oneLiner || '',
      commentary: a.sharpCommentary || '',
      source: 'platform',
      platformUsername: u.username,
      stats: crawl ? {
        totalPublicRepos: crawl.totalPublicRepos ?? 0,
        totalStars: crawl.totalStars ?? 0,
        followers: crawl.followers ?? 0,
      } : undefined,
      quadrant: a.capabilityQuadrant,
    });
  }

  for (const [ghUser, entry] of lookupCache.entries()) {
    if (profiles.some((p) => p.ghUsername.toLowerCase() === ghUser.toLowerCase())) continue;
    const a = entry.analysis as CodernetAnalysis | null;
    if (!a) continue;
    profiles.push({
      key: `cache:${ghUser}`,
      ghUsername: ghUser,
      avatarUrl: entry.avatarUrl || null,
      tags: a.techTags || [],
      oneLiner: a.oneLiner || '',
      commentary: a.sharpCommentary || '',
      source: 'cache',
      stats: entry.crawl ? {
        totalPublicRepos: entry.crawl.totalPublicRepos ?? 0,
        totalStars: entry.crawl.totalStars ?? 0,
        followers: entry.crawl.followers ?? 0,
      } : undefined,
      quadrant: a.capabilityQuadrant,
    });
  }

  return profiles;
}

function buildSearchPrompt(query: string, profiles: ProfileSummary[]): string {
  const profileList = profiles.map((p, i) =>
    `[${i}] @${p.ghUsername} | Tags: ${p.tags.join(', ')} | "${p.oneLiner}" | Stars: ${p.stats?.totalStars ?? '?'} | Repos: ${p.stats?.totalPublicRepos ?? '?'}`
  ).join('\n');

  return `你是 Codernet 开发者匹配引擎。根据用户需求描述，从候选开发者列表中选出最匹配的（最多 5 个）。

用户需求：
${query}

候选开发者：
${profileList}

请输出**仅一个 JSON 数组**，格式如下（不要额外说明文字）：
[
  { "index": 0, "score": 0.95, "reason": "匹配理由（1句话中文）" },
  ...
]

规则：
- score 范围 0-1，越高越匹配
- 最多返回 5 个结果，按 score 降序
- 只返回 score >= 0.3 的
- reason 必须中文，说明为什么匹配
- 如果没有任何匹配，返回空数组 []`;
}

export async function searchDevelopers(
  query: string,
  lookupCache: Map<string, any>,
): Promise<DeveloperSearchResult[]> {
  const profiles = await collectProfiles(lookupCache);

  if (profiles.length === 0) return [];

  const { client, model } = getPublishingLlmClient();
  const prompt = buildSearchPrompt(query, profiles);

  let response;
  try {
    response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
  } catch {
    response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    });
  }

  const raw = response.choices[0]?.message?.content?.trim() || '[]';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let ranked: Array<{ index: number; score: number; reason: string }>;
  try {
    ranked = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  if (!Array.isArray(ranked)) return [];

  return ranked
    .filter((r) => r.score >= 0.3 && r.index >= 0 && r.index < profiles.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => {
      const p = profiles[r.index];
      return {
        githubUsername: p.ghUsername,
        avatarUrl: p.avatarUrl,
        oneLiner: p.oneLiner,
        techTags: p.tags,
        sharpCommentary: p.commentary,
        score: r.score,
        reason: r.reason,
        source: p.source,
        platformUsername: p.platformUsername,
        stats: p.stats,
        capabilityQuadrant: p.quadrant,
      };
    });
}
