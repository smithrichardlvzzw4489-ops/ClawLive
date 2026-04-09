/**
 * Codernet 画像分析：基于 GitHub + 多平台数据，调用 LLM 生成技术标签、能力象限、锐评。
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { GitHubCrawlResult } from './github-crawler';
import type { MultiPlatformProfile } from './multiplatform-crawler';
import { calculateAIEngagement, type AIEngagementScore } from './ai-engagement-scorer';
import type { JobSeekingSignal } from './job-seeking-signals';
import { formatPortfolioDepthForPrompt } from './github-portfolio-depth';

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
    hfModelCount?: number;
    hfDatasetCount?: number;
    hfSpaceCount?: number;
    hfTotalDownloads?: number;
    hfTopPipelineTags?: string[];
    gitlabProjects?: number;
    leetcodeSolved?: number;
    leetcodeRating?: number | null;
    kaggleTier?: string;
    kaggleMedals?: number;
    codeforcesRating?: number;
    codeforcesRank?: string;
    dockerPulls?: number;
    cratesCount?: number;
    cratesTotalDownloads?: number;
    communityInfluenceScore?: number;
    knowledgeSharingScore?: number;
    packageImpactScore?: number;
    aiMlImpactScore?: number;
    algorithmScore?: number;
  };
  aiEngagement?: AIEngagementScore;
  /** 基于 GitHub/网站/本站开关/登记链接等依据，由模型归纳的求职状态（与 jobSeeking 证据列表配套） */
  jobSeekingInProfile?: {
    active: boolean;
    summary: string;
    details: string;
  };
  /** 与 portfolioDepth 数据对齐的按年/按仓库深层叙述（可和前端时间线对照） */
  activityDeepDive?: {
    byYear: Array<{ year: number; narrative: string; highlights: string[] }>;
    repoDeepDives: Array<{
      repo: string;
      roleEstimate: string;
      contributionSummary: string;
      techFocus: string;
    }>;
    commitPatterns?: string;
  };
}

const JOB_SEEKING_KIND_PROMPT: Record<string, string> = {
  platform_toggle: '本站开关',
  github_profile_bio: 'GitHub 简介',
  github_profile_readme: 'GitHub Profile README',
  personal_website: '个人网站',
  user_listed_job_board: '登记的求职平台/档案链接',
};

function collectYearsFromCrawl(crawl: GitHubCrawlResult): Set<number> {
  const s = new Set<number>();
  for (const r of crawl.repos) {
    const y = new Date(r.created_at).getUTCFullYear();
    if (Number.isFinite(y) && y >= 1970) s.add(y);
  }
  for (const c of crawl.recentCommits) {
    const y = new Date(c.date).getUTCFullYear();
    if (Number.isFinite(y) && y >= 1970) s.add(y);
  }
  return s;
}

function formatJobSeekingSignalsForPrompt(signals: JobSeekingSignal[]): string {
  if (!signals.length) {
    return '（无条目：表示当前未发现 GitHub 简介、Profile README、个人网站文案、本站「开放机会」或用户登记的求职平台链接中的明确求职依据。）';
  }
  return signals
    .map((s, i) => {
      const kindLabel = JOB_SEEKING_KIND_PROMPT[s.kind] || s.kind;
      return `${i + 1}. [${kindLabel}] ${s.title}\n   摘录/说明：${s.detail}\n   链接：${s.url}`;
    })
    .join('\n\n');
}

function buildAnalysisPrompt(
  data: GitHubCrawlResult,
  multiPlatform?: MultiPlatformProfile | null,
  jobSeekingSignals?: JobSeekingSignal[],
): string {
  const topRepos = data.repos.slice(0, 28).map((r) => {
    const topics = r.topics.length ? ` [${r.topics.join(', ')}]` : '';
    const created = r.created_at ? r.created_at.slice(0, 10) : '';
    const pushed = r.pushed_at ? r.pushed_at.slice(0, 10) : '';
    return `- ${r.name} (${r.language || 'N/A'}, ★${r.stargazers_count}, 创建于${created}, 最近推送${pushed})${topics}: ${r.description || 'no description'}`;
  }).join('\n');

  const langEntries = Object.entries(data.languageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const totalBytes = langEntries.reduce((s, [, b]) => s + b, 0);
  const langSummary = langEntries
    .map(([lang, bytes]) => `${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`)
    .join(', ');

  const commitSamples = data.recentCommits
    .slice(0, 45)
    .map((c) => `${c.date.slice(0, 10)} [${c.repo}] ${c.message}`)
    .join('\n');

  const timelineBlock = data.portfolioDepth
    ? formatPortfolioDepthForPrompt(data.portfolioDepth, 12)
    : '（无派生时间线：请仅根据仓库创建日与提交日期推断）';

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

    if (multiPlatform.huggingface) {
      const hf = multiPlatform.huggingface;
      const modelList = hf.models.slice(0, 5)
        .map((m) => `- ${m.modelId} (⬇${m.downloads.toLocaleString()}, ❤${m.likes})${m.pipelineTag ? ` [${m.pipelineTag}]` : ''}`)
        .join('\n');
      const datasetList = hf.datasets.slice(0, 3)
        .map((d) => `- ${d.id} (⬇${d.downloads.toLocaleString()}, ❤${d.likes})`)
        .join('\n');
      const spaceList = hf.spaces.slice(0, 3)
        .map((s) => `- ${s.id} (❤${s.likes})${s.sdk ? ` [${s.sdk}]` : ''}`)
        .join('\n');
      parts.push(`=== Hugging Face ===
模型数：${hf.models.length} | 数据集：${hf.datasets.length} | Spaces：${hf.spaces.length}
总下载量：${hf.totalDownloads.toLocaleString()} | 总 Likes：${hf.totalLikes}
Pipeline 类型：${hf.topPipelineTags.join(', ') || '无'}
${modelList ? `模型：\n${modelList}` : ''}${datasetList ? `\n数据集：\n${datasetList}` : ''}${spaceList ? `\nSpaces：\n${spaceList}` : ''}`);
    }

    if (multiPlatform.gitlab) {
      const gl = multiPlatform.gitlab;
      const projList = gl.topProjects.slice(0, 5)
        .map((p) => `- ${p.name} (★${p.stars}): ${p.description || 'no desc'}`)
        .join('\n');
      parts.push(`=== GitLab ===
项目数：${gl.publicRepos} | 粉丝：${gl.followers}
${projList}`);
    }

    if (multiPlatform.leetcode) {
      const lc = multiPlatform.leetcode;
      parts.push(`=== LeetCode ===
已解题数：${lc.totalSolved} (Easy ${lc.easySolved} / Medium ${lc.mediumSolved} / Hard ${lc.hardSolved})
竞赛 Rating：${lc.contestRating || 'N/A'} | 竞赛排名：${lc.contestGlobalRanking?.toLocaleString() || 'N/A'} | 参赛次数：${lc.contestAttended}`);
    }

    if (multiPlatform.kaggle) {
      const kg = multiPlatform.kaggle;
      parts.push(`=== Kaggle ===
等级：${kg.tier} | 积分：${kg.points} | 金🥇${kg.goldMedals} 银🥈${kg.silverMedals} 铜🥉${kg.bronzeMedals}
竞赛数：${kg.totalCompetitions} | 数据集：${kg.totalDatasets} | Notebook：${kg.totalNotebooks}`);
    }

    if (multiPlatform.codeforces) {
      const cf = multiPlatform.codeforces;
      parts.push(`=== Codeforces ===
Rating：${cf.rating} (最高 ${cf.maxRating}) | 段位：${cf.rank} (最高 ${cf.maxRank})
参赛次数：${cf.contestCount} | 贡献值：${cf.contribution}`);
    }

    if (multiPlatform.dockerhub && multiPlatform.dockerhub.repositories.length > 0) {
      const dh = multiPlatform.dockerhub;
      const repoList = dh.repositories.slice(0, 5)
        .map((r) => `- ${r.name} (${r.pullCount.toLocaleString()} pulls)`)
        .join('\n');
      parts.push(`=== Docker Hub ===
镜像数：${dh.repositories.length} | 总 Pull 数：${dh.totalPulls.toLocaleString()}
${repoList}`);
    }

    if (multiPlatform.cratesio && multiPlatform.cratesio.crates.length > 0) {
      const cr = multiPlatform.cratesio;
      const crateList = cr.crates.slice(0, 5)
        .map((c) => `- ${c.name} v${c.maxVersion} (${c.downloads.toLocaleString()} downloads)`)
        .join('\n');
      parts.push(`=== crates.io (Rust) ===
Crate 数：${cr.totalCrates} | 总下载量：${cr.totalDownloads.toLocaleString()}
${crateList}`);
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
    multiPlatform.huggingface ? 'Hugging Face' : null,
    multiPlatform.gitlab ? 'GitLab' : null,
    multiPlatform.leetcode ? 'LeetCode' : null,
    multiPlatform.kaggle ? 'Kaggle' : null,
    multiPlatform.codeforces ? 'Codeforces' : null,
    multiPlatform.dockerhub?.repositories?.length ? 'Docker Hub' : null,
    multiPlatform.cratesio?.crates?.length ? 'crates.io' : null,
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

=== 近期 Commit 消息（含日期，供归纳工作节奏与提交风格） ===
${commitSamples || '（无提交数据）'}

=== 按年的时间线摘要（由系统从仓库创建日 + 提交样本聚合，须与叙述一致） ===
${timelineBlock}${multiPlatformSection}

=== 求职相关公开依据（自动摘录，仅供本画像使用；请勿编造未出现的来源） ===
${formatJobSeekingSignalsForPrompt(jobSeekingSignals || [])}

请输出**仅一个 JSON 对象**，格式严格如下（不要额外说明文字）：
{
  "techTags": ["标签1", "标签2", ...],
  "capabilityQuadrant": { "frontend": 0-100, "backend": 0-100, "infra": 0-100, "ai_ml": 0-100 },
  "sharpCommentary": "120字以内锐评，用犀利但不失幽默的口吻综合所有平台数据评价此开发者。如果有 SO 数据要点评答题风格，有 npm 数据要点评包的影响力。中文。",
  "oneLiner": "一句话标语（10字以内），如'全栈暴走族'、'AI工具狂人'、'基建默默铺路人'",
  "jobSeekingSummary": "求职状态一句话。若上一节依据无任何有效条目，则必须严格为：未在公开渠道检测到明确求职声明",
  "jobSeekingDetails": "根据上一节依据归纳的可展示求职信息：意向角色、技术栈、地点/远程、全职兼职等；若无具体细节可简短说明在看机会。若依据为空则必须为空字符串",
  "activityByYear": [ { "year": 2024, "narrative": "该年在公开样本中的技术主线（60字内）", "highlights": ["可验证亮点1", "亮点2"] } ],
  "repoDeepDives": [ { "repo": "仓库名（与列表一致）", "roleEstimate": "推断：主导/核心贡献/探索/归档 等", "contributionSummary": "基于描述与 stars 的公开贡献叙事（80字内）", "techFocus": "技术关键词，逗号分隔" } ],
  "commitPatterns": "根据提交消息样本归纳：提交粒度、语言风格、是否偏功能/修 bug/文档等（100字内）"
}

规则：
- techTags 最多 10 个，综合所有平台数据（GitHub 仓库 + SO 标签 + npm 包关键词等）
- capabilityQuadrant 四个维度各 0-100，综合所有平台数据客观推断
- sharpCommentary 必须中文，120字以内，要综合多平台数据形成洞察
- oneLiner 必须中文，10字以内
- 求职字段：仅根据「求职相关公开依据」一节作答。若该节标明无条目或列表为空，则 jobSeekingSummary 必须为「未在公开渠道检测到明确求职声明」，jobSeekingDetails 必须为 ""。若有条目，则 summary 80 字以内点明是否在求职及主要依据来源；details 200 字以内，可分段，不得添加依据中不存在的事实
- activityByYear：仅包含「按年的时间线摘要」中出现的年份或仓库创建/提交样本中出现的年份；每年 narrative 60 字内，highlights 每条 40 字内、最多 4 条；无则返回空数组
- repoDeepDives：覆盖最有代表性的公开仓库，最多 12 条，repo 字段必须与上文仓库列表中的名称一致；不得编造未出现的仓库名
- commitPatterns：严格根据 Commit 消息样本归纳，禁止臆测私有或未列出仓库`;
}

export async function analyzeGitHubProfile(
  crawlData: GitHubCrawlResult,
  multiPlatform?: MultiPlatformProfile | null,
  jobSeekingSignals?: JobSeekingSignal[],
): Promise<CodernetAnalysis> {
  const { model } = getPublishingLlmClient();

  const prompt = buildAnalysisPrompt(crawlData, multiPlatform, jobSeekingSignals);
  const meta = { username: crawlData.username };
  const hasJobSeekingEvidence = (jobSeekingSignals?.length ?? 0) > 0;

  let response;
  try {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 4500, temperature: 0.65, response_format: { type: 'json_object' } },
      'profile_analysis',
      meta,
    );
  } catch {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 4500, temperature: 0.65 },
      'profile_analysis',
      meta,
    );
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
    jobSeekingSummary?: string;
    jobSeekingDetails?: string;
    activityByYear?: Array<{ year?: number; narrative?: string; highlights?: string[] }>;
    repoDeepDives?: Array<{
      repo?: string;
      roleEstimate?: string;
      contributionSummary?: string;
      techFocus?: string;
    }>;
    commitPatterns?: string;
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

    if (multiPlatform.huggingface) {
      platformsUsed.push('Hugging Face');
      const hf = multiPlatform.huggingface;
      multiPlatformInsights.hfModelCount = hf.models.length;
      multiPlatformInsights.hfDatasetCount = hf.datasets.length;
      multiPlatformInsights.hfSpaceCount = hf.spaces.length;
      multiPlatformInsights.hfTotalDownloads = hf.totalDownloads;
      multiPlatformInsights.hfTopPipelineTags = hf.topPipelineTags;
      multiPlatformInsights.aiMlImpactScore = Math.min(100, Math.round(
        Math.min(40, hf.models.length * 8) +
        Math.min(30, Math.log10(hf.totalDownloads + 1) * 8) +
        Math.min(15, hf.datasets.length * 5) +
        Math.min(15, hf.spaces.length * 5)
      ));
    }

    if (multiPlatform.gitlab) {
      platformsUsed.push('GitLab');
      multiPlatformInsights.gitlabProjects = multiPlatform.gitlab.topProjects.length;
    }

    if (multiPlatform.leetcode) {
      platformsUsed.push('LeetCode');
      multiPlatformInsights.leetcodeSolved = multiPlatform.leetcode.totalSolved;
      multiPlatformInsights.leetcodeRating = multiPlatform.leetcode.contestRating;
      multiPlatformInsights.algorithmScore = Math.min(100, Math.round(
        Math.min(40, multiPlatform.leetcode.totalSolved * 0.15) +
        Math.min(30, multiPlatform.leetcode.hardSolved * 1.5) +
        Math.min(30, ((multiPlatform.leetcode.contestRating || 0) / 3000) * 30)
      ));
    }

    if (multiPlatform.kaggle) {
      platformsUsed.push('Kaggle');
      multiPlatformInsights.kaggleTier = multiPlatform.kaggle.tier;
      multiPlatformInsights.kaggleMedals = multiPlatform.kaggle.goldMedals + multiPlatform.kaggle.silverMedals + multiPlatform.kaggle.bronzeMedals;
      const kaggleBoost = Math.min(30, multiPlatform.kaggle.goldMedals * 10 + multiPlatform.kaggle.silverMedals * 5 + multiPlatform.kaggle.bronzeMedals * 2);
      multiPlatformInsights.aiMlImpactScore = Math.min(100, (multiPlatformInsights.aiMlImpactScore || 0) + kaggleBoost);
    }

    if (multiPlatform.codeforces) {
      platformsUsed.push('Codeforces');
      multiPlatformInsights.codeforcesRating = multiPlatform.codeforces.rating;
      multiPlatformInsights.codeforcesRank = multiPlatform.codeforces.rank;
      const cfScore = Math.min(50, Math.round((multiPlatform.codeforces.rating / 3500) * 50));
      multiPlatformInsights.algorithmScore = Math.min(100, (multiPlatformInsights.algorithmScore || 0) + cfScore);
    }

    if (multiPlatform.dockerhub?.repositories?.length) {
      platformsUsed.push('Docker Hub');
      multiPlatformInsights.dockerPulls = multiPlatform.dockerhub.totalPulls;
    }

    if (multiPlatform.cratesio?.crates?.length) {
      platformsUsed.push('crates.io');
      multiPlatformInsights.cratesCount = multiPlatform.cratesio.totalCrates;
      multiPlatformInsights.cratesTotalDownloads = multiPlatform.cratesio.totalDownloads;
      const crateBoost = Math.min(30, Math.log10(multiPlatform.cratesio.totalDownloads + 1) * 8);
      multiPlatformInsights.packageImpactScore = Math.min(100, (multiPlatformInsights.packageImpactScore || 0) + crateBoost);
    }

    multiPlatformInsights.communityInfluenceScore = Math.min(100, Math.round(
      (multiPlatformInsights.knowledgeSharingScore || 0) * 0.25 +
      (multiPlatformInsights.packageImpactScore || 0) * 0.25 +
      (multiPlatformInsights.aiMlImpactScore || 0) * 0.2 +
      (multiPlatformInsights.algorithmScore || 0) * 0.15 +
      (platformsUsed.length - 1) * 2.5
    ));
  }

  const aiEngagement = calculateAIEngagement(crawlData, multiPlatform);

  const NO_SIGNAL_PHRASE = '未在公开渠道检测到明确求职声明';
  let jobSummary = String(parsed.jobSeekingSummary || '').trim().slice(0, 120);
  let jobDetails = String(parsed.jobSeekingDetails || '').trim().slice(0, 500);
  if (!hasJobSeekingEvidence) {
    jobSummary = NO_SIGNAL_PHRASE;
    jobDetails = '';
  } else if (!jobSummary) {
    jobSummary = '公开渠道显示该开发者可能正在关注职业机会，详见下方依据链接。';
  }

  const validRepoNames = new Set(crawlData.repos.map((r) => r.name));
  const yearsWithEvidence = collectYearsFromCrawl(crawlData);
  const byYearRaw = Array.isArray(parsed.activityByYear) ? parsed.activityByYear : [];
  const byYear = byYearRaw
    .map((row) => ({
      year: Math.min(2100, Math.max(1970, Math.floor(Number(row.year) || 0))),
      narrative: String(row.narrative || '').trim().slice(0, 120),
      highlights: Array.isArray(row.highlights)
        ? row.highlights.map((h) => String(h).trim().slice(0, 80)).filter(Boolean).slice(0, 4)
        : [],
    }))
    .filter(
      (row) =>
        row.year > 1970 &&
        yearsWithEvidence.has(row.year) &&
        (row.narrative || row.highlights.length > 0),
    )
    .slice(0, 15);

  const divesRaw = Array.isArray(parsed.repoDeepDives) ? parsed.repoDeepDives : [];
  const repoDeepDives = divesRaw
    .map((d) => ({
      repo: String(d.repo || '').trim().slice(0, 120),
      roleEstimate: String(d.roleEstimate || '').trim().slice(0, 60),
      contributionSummary: String(d.contributionSummary || '').trim().slice(0, 200),
      techFocus: String(d.techFocus || '').trim().slice(0, 120),
    }))
    .filter((d) => d.repo && validRepoNames.has(d.repo))
    .slice(0, 12);

  const commitPatterns = String(parsed.commitPatterns || '').trim().slice(0, 200);
  const activityDeepDive =
    byYear.length > 0 || repoDeepDives.length > 0 || commitPatterns
      ? {
          byYear,
          repoDeepDives,
          ...(commitPatterns ? { commitPatterns } : {}),
        }
      : undefined;

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
    aiEngagement: aiEngagement.overall > 0 ? aiEngagement : undefined,
    jobSeekingInProfile: {
      active: hasJobSeekingEvidence,
      summary: jobSummary,
      details: jobDetails,
    },
    activityDeepDive,
  };
}
