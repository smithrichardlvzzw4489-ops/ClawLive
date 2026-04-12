/**
 * GITLINK 画像分析：基于 GitHub + 多平台数据，调用 LLM 生成技术标签、能力象限、锐评。
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { GitHubCrawlResult } from './github-crawler';
import type { MultiPlatformProfile } from './multiplatform-crawler';
import { calculateAIEngagement, type AIEngagementScore } from './ai-engagement-scorer';
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
  /** 与 portfolioDepth 数据对齐的按年/按仓库深层叙述（可和前端时间线对照） */
  activityDeepDive?: {
    byYear: Array<{ year: number; narrative: string; highlights: string[] }>;
    repoDeepDives: Array<{
      repo: string;
      roleEstimate: string;
      contributionSummary: string;
      techFocus: string;
      /** 基于描述、语言、topics、stars、日期的仓库定位与技术叙事（较长） */
      repoContentDeepDive: string;
      /** 结合 commit 与时间线，对该人物在此仓的贡献与角色的展开叙述 */
      personContributionDeepDive: string;
    }>;
    commitPatterns?: string;
  };
}

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

/** LLM 常只写最近一年；对仍有仓库/commit 证据却未返回 narrative 的年份用 crawl 自动补一条，避免 UI 缺块 */
function buildYearActivityFallback(
  year: number,
  crawl: GitHubCrawlResult,
): { year: number; narrative: string; highlights: string[] } | null {
  const repos = crawl.repos.filter((r) => r.created_at && new Date(r.created_at).getUTCFullYear() === year);
  const commits = crawl.recentCommits.filter((c) => new Date(c.date).getUTCFullYear() === year);
  if (repos.length === 0 && commits.length === 0) return null;

  const highlights: string[] = [];
  const topByStars = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3);
  for (const r of topByStars) {
    highlights.push(`${r.name}（${r.language || '—'}，★${r.stargazers_count.toLocaleString()}）`.slice(0, 80));
  }

  const commitRepoCounts = new Map<string, number>();
  for (const c of commits) {
    commitRepoCounts.set(c.repo, (commitRepoCounts.get(c.repo) || 0) + 1);
  }
  const topReposByCommits = [...commitRepoCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [repoName, n] of topReposByCommits) {
    if (highlights.length >= 4) break;
    if (topByStars.some((r) => r.name === repoName)) continue;
    highlights.push(`${repoName}：该年提交样本约 ${n} 条`.slice(0, 80));
  }

  const head = `${year}：新建公开仓库 ${repos.length} 个，commit 样本 ${commits.length} 条`;
  const tail = topByStars[0] ? `；亮点含 ${topByStars.map((r) => r.name).join('、')}。` : '。';
  const narrative = (head + tail).slice(0, 120);

  return { year, narrative, highlights: highlights.slice(0, 4) };
}

function buildAnalysisPrompt(data: GitHubCrawlResult, multiPlatform?: MultiPlatformProfile | null): string {
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

  const commitLinesForPrompt = data.recentCommits
    .slice(0, 400)
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

=== 近期 commits（含日期，供归纳工作节奏与提交风格；至多 400 条写入本提示） ===
${commitLinesForPrompt || '（无 commit 数据）'}

=== 按年的时间线摘要（由系统从仓库创建日与 commits 聚合，须与叙述一致） ===
${timelineBlock}${multiPlatformSection}

请输出**仅一个 JSON 对象**，格式严格如下（不要额外说明文字）：
{
  "techTags": ["标签1", "标签2", ...],
  "capabilityQuadrant": { "frontend": 0-100, "backend": 0-100, "infra": 0-100, "ai_ml": 0-100 },
  "sharpCommentary": "120字以内锐评，用犀利但不失幽默的口吻综合所有平台数据评价此开发者。如果有 SO 数据要点评答题风格，有 npm 数据要点评包的影响力。中文。",
  "oneLiner": "一句话标语（10字以内），如'全栈暴走族'、'AI工具狂人'、'基建默默铺路人'",
  "activityByYear": [ { "year": 2024, "narrative": "该年在公开样本中的技术主线（60字内）", "highlights": ["可验证亮点1", "亮点2"] } ],
  "repoDeepDives": [ { "repo": "仓库名（与列表一致）", "roleEstimate": "推断：主导/核心贡献/探索/归档 等", "contributionSummary": "一句话总括此人在该仓的公开贡献印象（40字内）", "techFocus": "技术关键词，逗号分隔", "repoContentDeepDive": "仅依据上文该仓的公开字段：分 2–4 句写清仓库可能解决什么问题、技术栈信号（语言/topics）、star/fork 量级暗示的社区关注度、从创建日/最近推送推断的维护节奏；禁止编造未出现的仓库名或私有信息", "personContributionDeepDive": "结合该仓库在「近期 commits」与按年摘要中的出现：分 2–5 句写此人在该仓的推断角色、可能的贡献类型（功能/修复/文档/发布等）、提交风格是否一致；须明确区分「commits 中可见事实」与「合理推断」，禁止捏造具体 issue/PR 编号" } ],
  "commitPatterns": "根据上文 commits 归纳：提交粒度、语言风格、是否偏功能/修 bug/文档等（100字内）"
}

规则：
- techTags 最多 10 个，综合所有平台数据（GitHub 仓库 + SO 标签 + npm 包关键词等）
- capabilityQuadrant 四个维度各 0-100，综合所有平台数据客观推断
- sharpCommentary 必须中文，120字以内，要综合多平台数据形成洞察
- oneLiner 必须中文，10字以内
- activityByYear：**须覆盖下方「按年的时间线摘要」中出现的每一个年份**（每年一条，按年份降序亦可）；每年 narrative 60 字内，highlights 每条 40 字内、最多 4 条；漏掉的年份系统会用数据统计自动补一条（质量较差），请尽量避免遗漏
- repoDeepDives：覆盖最有代表性的公开仓库，最多 12 条，repo 字段必须与上文仓库列表中的名称一致；不得编造未出现的仓库名；每条必须含 repoContentDeepDive 与 personContributionDeepDive，各 180–420 个汉字（约 3–6 句），信息密度高、避免空话套话
- commitPatterns：严格根据上文 commits 归纳，禁止臆测私有或未列出仓库`;
}

const HEX = /^[0-9a-fA-F]$/;

/** 去掉 BOM、可选 markdown 围栏，避免 JSON.parse 与截取错位。 */
function normalizeLlmJsonEnvelope(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '').trim();
  if (s.startsWith('```')) {
    const firstNl = s.indexOf('\n');
    if (firstNl !== -1) s = s.slice(firstNl + 1);
    if (s.endsWith('```')) s = s.slice(0, -3).trimEnd();
  }
  return s.trim();
}

/**
 * 从首个 `{` 起按括号平衡截取顶层对象。贪婪正则 `/\{[\s\S]*\}/` 会吃到正文里未转义的 `}` 或尾部说明，导致解析失败或错位。
 */
function extractFirstBalancedJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** LLM 常在 JSON 字符串值内输出真实换行，违反 JSON 规范（Bad control character in string literal）。仅在引号对内修复。 */
function repairUnescapedControlCharsInJsonStrings(raw: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < raw.length) {
    const c = raw[i];
    if (!inString) {
      if (c === '"') {
        inString = true;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '\\') {
      out += c;
      i++;
      if (i >= raw.length) break;
      const n = raw[i];
      if (n === 'u' && i + 4 < raw.length && HEX.test(raw[i + 1]) && HEX.test(raw[i + 2]) && HEX.test(raw[i + 3]) && HEX.test(raw[i + 4])) {
        out += raw.slice(i, i + 5);
        i += 5;
      } else {
        out += raw[i];
        i++;
      }
      continue;
    }
    if (c === '"') {
      inString = false;
      out += c;
      i++;
      continue;
    }
    const code = c.charCodeAt(0);
    if (code < 32) {
      if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += c;
    }
    i++;
  }
  return out;
}

function parseLlmJsonObject(blob: string): unknown {
  try {
    return JSON.parse(blob);
  } catch (first) {
    try {
      return JSON.parse(repairUnescapedControlCharsInJsonStrings(blob));
    } catch {
      const msg = first instanceof Error ? first.message : String(first);
      throw new Error(`LLM JSON parse failed: ${msg}; snippet: ${blob.slice(0, 400)}`);
    }
  }
}

export async function analyzeGitHubProfile(
  crawlData: GitHubCrawlResult,
  multiPlatform?: MultiPlatformProfile | null,
): Promise<CodernetAnalysis> {
  const { model } = getPublishingLlmClient();

  const prompt = buildAnalysisPrompt(crawlData, multiPlatform);
  const meta = { username: crawlData.username };

  let response;
  try {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 7200, temperature: 0.65, response_format: { type: 'json_object' } },
      'profile_analysis',
      meta,
    );
  } catch {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 7200, temperature: 0.65 },
      'profile_analysis',
      meta,
    );
  }

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const normalized = normalizeLlmJsonEnvelope(raw);
  const jsonBlob =
    extractFirstBalancedJsonObject(normalized) ?? normalized.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonBlob) {
    throw new Error(`LLM returned no JSON: ${raw.slice(0, 300)}`);
  }

  const parsed = parseLlmJsonObject(jsonBlob) as {
    techTags?: string[];
    capabilityQuadrant?: Record<string, number>;
    sharpCommentary?: string;
    oneLiner?: string;
    activityByYear?: Array<{ year?: number; narrative?: string; highlights?: string[] }>;
    repoDeepDives?: Array<{
      repo?: string;
      roleEstimate?: string;
      contributionSummary?: string;
      techFocus?: string;
      repoContentDeepDive?: string;
      personContributionDeepDive?: string;
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

  const validRepoNames = new Set(crawlData.repos.map((r) => r.name));
  const yearsWithEvidence = collectYearsFromCrawl(crawlData);
  const byYearRaw = Array.isArray(parsed.activityByYear) ? parsed.activityByYear : [];
  const llmYearRows = byYearRaw
    .map((row) => ({
      year: Math.min(2100, Math.max(1970, Math.floor(Number(row.year) || 0))),
      narrative: String(row.narrative || '').trim().slice(0, 120),
      highlights: Array.isArray(row.highlights)
        ? row.highlights.map((h) => String(h).trim().slice(0, 80)).filter(Boolean).slice(0, 4)
        : [],
    }))
    .filter((row) => row.year > 1970 && yearsWithEvidence.has(row.year));

  const llmByYear = new Map<number, { year: number; narrative: string; highlights: string[] }>();
  for (const r of llmYearRows) {
    if (r.narrative || r.highlights.length > 0) llmByYear.set(r.year, r);
  }

  const sortedYears = [...yearsWithEvidence].sort((a, b) => b - a).slice(0, 15);
  const byYear: Array<{ year: number; narrative: string; highlights: string[] }> = [];
  for (const year of sortedYears) {
    const fromLlm = llmByYear.get(year);
    if (fromLlm) {
      byYear.push(fromLlm);
      continue;
    }
    const fb = buildYearActivityFallback(year, crawlData);
    if (fb) byYear.push(fb);
  }

  const divesRaw = Array.isArray(parsed.repoDeepDives) ? parsed.repoDeepDives : [];
  const repoDeepDives = divesRaw
    .map((d) => ({
      repo: String(d.repo || '').trim().slice(0, 120),
      roleEstimate: String(d.roleEstimate || '').trim().slice(0, 60),
      contributionSummary: String(d.contributionSummary || '').trim().slice(0, 120),
      techFocus: String(d.techFocus || '').trim().slice(0, 120),
      repoContentDeepDive: String(d.repoContentDeepDive || '').trim().slice(0, 2200),
      personContributionDeepDive: String(d.personContributionDeepDive || '').trim().slice(0, 2200),
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
    activityDeepDive,
  };
}
