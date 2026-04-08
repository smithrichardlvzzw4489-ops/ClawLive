/**
 * Codernet 画像分析：基于 GitHub + 多平台数据，调用 LLM 生成技术标签、能力象限、锐评。
 */

import { getPublishingLlmClient } from './llm';
import type { GitHubCrawlResult } from './github-crawler';
import type { MultiPlatformProfile } from './multiplatform-crawler';

export interface CodernetAnalysis {
  techTags: string[];
  languageDistribution: Array<{ language: string; percent: number }>;
  capabilityQuadrant: {
    frontend: number;
    backend: number;
    infra: number;
    ai_ml: number;
  };
  sharpCommentary: string;
  oneLiner: string;
  generatedAt: string;
  platformsUsed: string[];
  multiPlatformInsights?: {
    stackOverflowReputation?: number;
    stackOverflowTopTags?: string[];
    npmPackageCount?: number;
    npmTotalWeeklyDownloads?: number;
    pypiPackageCount?: number;
    devtoArticleCount?: number;
    devtoTotalReactions?: number;
    communityInfluenceScore?: number;
    knowledgeSharingScore?: number;
    packageImpactScore?: number;
  };
}

function buildAnalysisPrompt(data: GitHubCrawlResult, multiPlatform?: MultiPlatformProfile | null): string {
  const topRepos = data.repos.slice(0, 15).map((r) => {
    const topics = r.topics.length ? ` [${r.topics.join(', ')}]` : '';
    return `- ${r.name} (${r.language || 'N/A'}, ★${r.stargazers_count})${topics}: ${r.description || 'no description'}`;
  }).join('\n');

  const langEntries = Object.entries(data.languageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const totalBytes = langEntries.reduce((s, [, b]) => s + b, 0);
  const langSummary = langEntries
    .map(([lang, bytes]) => `${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`)
    .join(', ');

  const commitSamples = data.recentCommits.slice(0, 15)
    .map((c) => `[${c.repo}] ${c.message}`)
    .join('\n');

  let multiPlatformSection = '';

  if (multiPlatform) {
    const parts: string[] = [];

    if (multiPlatform.stackOverflow) {
      const so = multiPlatform.stackOverflow;
      const tags = so.topTags.map((t) => `${t.name}(${t.answerScore}分)`).join(', ');
      parts.push(`=== Stack Overflow ===
声望：${so.reputation.toLocaleString()} | 回答数：${so.answerCount} | 金牌：${so.goldBadges} 银牌：${so.silverBadges} 铜牌：${so.bronzeBadges}
擅长标签：${tags || '无'}`);
    }

    if (multiPlatform.npmPackages.length > 0) {
      const totalDl = multiPlatform.npmPackages.reduce((s, p) => s + p.weeklyDownloads, 0);
      const pkgList = multiPlatform.npmPackages.slice(0, 5)
        .map((p) => `- ${p.name} (${p.weeklyDownloads.toLocaleString()}/week): ${p.description || 'no desc'}`)
        .join('\n');
      parts.push(`=== npm 包 ===
发布包数：${multiPlatform.npmPackages.length} | 总周下载量：${totalDl.toLocaleString()}
${pkgList}`);
    }

    if (multiPlatform.pypiPackages.length > 0) {
      const pkgList = multiPlatform.pypiPackages.slice(0, 5)
        .map((p) => `- ${p.name}: ${p.summary || 'no desc'}`)
        .join('\n');
      parts.push(`=== PyPI 包 ===
发布包数：${multiPlatform.pypiPackages.length}
${pkgList}`);
    }

    if (multiPlatform.devto) {
      const d = multiPlatform.devto;
      const articles = d.topArticles.slice(0, 3)
        .map((a) => `- "${a.title}" (❤${a.positiveReactions})`)
        .join('\n');
      parts.push(`=== DEV.to 技术博客 ===
文章数：${d.articlesCount} | 总反应：${d.totalReactions} | 粉丝：${d.followers}
${articles}`);
    }

    if (parts.length > 0) {
      multiPlatformSection = '\n\n' + parts.join('\n\n');
    }
  }

  const platformsAvailable = multiPlatform ? [
    'GitHub',
    multiPlatform.stackOverflow ? 'Stack Overflow' : null,
    multiPlatform.npmPackages.length > 0 ? 'npm' : null,
    multiPlatform.pypiPackages.length > 0 ? 'PyPI' : null,
    multiPlatform.devto ? 'DEV.to' : null,
  ].filter(Boolean).join(' + ') : 'GitHub';

  return `你是一位资深技术猎头兼毒舌代码评论家。根据以下多平台数据（${platformsAvailable}），生成这位开发者的全面技术画像。

开发者：${data.username}
Bio：${data.bio || '无'}
地点：${data.location || '未知'}
公司：${data.company || '未知'}
公开仓库数：${data.totalPublicRepos}
总 Star 数：${data.totalStars}
粉丝：${data.followers} / 关注：${data.following}

=== GitHub 主要仓库 ===
${topRepos || '（无仓库数据）'}

=== 语言分布 ===
${langSummary || '（无语言数据）'}

=== 近期 Commit 消息 ===
${commitSamples || '（无提交数据）'}${multiPlatformSection}

请输出**仅一个 JSON 对象**，格式严格如下（不要额外说明文字）：
{
  "techTags": ["标签1", "标签2", ...],
  "capabilityQuadrant": { "frontend": 0-100, "backend": 0-100, "infra": 0-100, "ai_ml": 0-100 },
  "sharpCommentary": "120字以内锐评，用犀利但不失幽默的口吻综合所有平台数据评价此开发者。如果有 SO 数据要点评答题风格，有 npm 数据要点评包的影响力。中文。",
  "oneLiner": "一句话标语（10字以内），如'全栈暴走族'、'AI工具狂人'、'基建默默铺路人'"
}

规则：
- techTags 最多 10 个，综合所有平台数据（GitHub 仓库 + SO 标签 + npm 包关键词等）
- capabilityQuadrant 四个维度各 0-100，综合所有平台数据客观推断
- sharpCommentary 必须中文，120字以内，要综合多平台数据形成洞察
- oneLiner 必须中文，10字以内`;
}

export async function analyzeGitHubProfile(
  crawlData: GitHubCrawlResult,
  multiPlatform?: MultiPlatformProfile | null,
): Promise<CodernetAnalysis> {
  const { client, model } = getPublishingLlmClient();

  const prompt = buildAnalysisPrompt(crawlData, multiPlatform);

  let response;
  try {
    response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
  } catch {
    response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
    });
  }

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM returned no JSON: ${raw.slice(0, 300)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    techTags?: string[];
    capabilityQuadrant?: Record<string, number>;
    sharpCommentary?: string;
    oneLiner?: string;
  };

  const langEntries = Object.entries(crawlData.languageStats)
    .sort((a, b) => b[1] - a[1]);
  const totalBytes = langEntries.reduce((s, [, b]) => s + b, 0) || 1;
  const languageDistribution = langEntries.slice(0, 10).map(([language, bytes]) => ({
    language,
    percent: Math.round((bytes / totalBytes) * 1000) / 10,
  }));

  const quad = parsed.capabilityQuadrant || {};
  const clamp = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));

  const platformsUsed: string[] = ['GitHub'];
  const multiPlatformInsights: CodernetAnalysis['multiPlatformInsights'] = {};

  if (multiPlatform) {
    if (multiPlatform.stackOverflow) {
      platformsUsed.push('Stack Overflow');
      multiPlatformInsights.stackOverflowReputation = multiPlatform.stackOverflow.reputation;
      multiPlatformInsights.stackOverflowTopTags = multiPlatform.stackOverflow.topTags.map((t) => t.name);
      multiPlatformInsights.knowledgeSharingScore = Math.min(100, Math.round(
        Math.log10(multiPlatform.stackOverflow.reputation + 1) * 20
      ));
    }

    if (multiPlatform.npmPackages.length > 0) {
      platformsUsed.push('npm');
      multiPlatformInsights.npmPackageCount = multiPlatform.npmPackages.length;
      multiPlatformInsights.npmTotalWeeklyDownloads = multiPlatform.npmPackages.reduce((s, p) => s + p.weeklyDownloads, 0);
      multiPlatformInsights.packageImpactScore = Math.min(100, Math.round(
        Math.log10((multiPlatformInsights.npmTotalWeeklyDownloads || 0) + 1) * 15
      ));
    }

    if (multiPlatform.pypiPackages.length > 0) {
      platformsUsed.push('PyPI');
      multiPlatformInsights.pypiPackageCount = multiPlatform.pypiPackages.length;
      if (!multiPlatformInsights.packageImpactScore) {
        multiPlatformInsights.packageImpactScore = Math.min(100, multiPlatform.pypiPackages.length * 15);
      }
    }

    if (multiPlatform.devto) {
      platformsUsed.push('DEV.to');
      multiPlatformInsights.devtoArticleCount = multiPlatform.devto.articlesCount;
      multiPlatformInsights.devtoTotalReactions = multiPlatform.devto.totalReactions;
      const kss = multiPlatformInsights.knowledgeSharingScore || 0;
      multiPlatformInsights.knowledgeSharingScore = Math.min(100, kss + Math.min(50, multiPlatform.devto.articlesCount * 5));
    }

    multiPlatformInsights.communityInfluenceScore = Math.min(100, Math.round(
      (multiPlatformInsights.knowledgeSharingScore || 0) * 0.4 +
      (multiPlatformInsights.packageImpactScore || 0) * 0.4 +
      (platformsUsed.length - 1) * 5
    ));
  }

  return {
    techTags: Array.isArray(parsed.techTags)
      ? parsed.techTags.map(String).filter(Boolean).slice(0, 10)
      : [],
    languageDistribution,
    capabilityQuadrant: {
      frontend: clamp(quad.frontend),
      backend: clamp(quad.backend),
      infra: clamp(quad.infra),
      ai_ml: clamp(quad.ai_ml),
    },
    sharpCommentary: String(parsed.sharpCommentary || '').slice(0, 400),
    oneLiner: String(parsed.oneLiner || '').slice(0, 30),
    generatedAt: new Date().toISOString(),
    platformsUsed,
    multiPlatformInsights: Object.keys(multiPlatformInsights).length > 0 ? multiPlatformInsights : undefined,
  };
}
