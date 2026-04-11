/**
 * AI Engagement Score：从公开数据推断开发者的 AI 工具使用深度和 AI 领域参与度。
 *
 * 信号来源：
 * 1. GitHub 仓库 topics / 名称 / 描述中的 AI 关键词
 * 2. GitHub 仓库中 AI 工具配置文件（.cursor/, .aider*, copilot 等）
 * 3. 代码语言分布（Python 在 AI 领域的占比）
 * 4. Commit 消息中的 AI 工具痕迹（copilot, cursor, aider 等）
 * 5. Hugging Face 模型 / 数据集 / Spaces
 * 6. npm / PyPI 中 AI 相关包
 * 7. DEV.to AI 相关文章
 */

import type { GitHubCrawlResult, GHRepo } from './github-crawler';
import type { MultiPlatformProfile } from './multiplatform-crawler';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export interface AIEngagementScore {
  overall: number;
  breakdown: {
    aiProjects: number;
    aiToolUsage: number;
    aiModelPublishing: number;
    aiKnowledgeSharing: number;
    aiPackageContrib: number;
  };
  signals: AISignal[];
  level: 'none' | 'explorer' | 'practitioner' | 'builder' | 'leader';
  levelLabel: string;
  summary: string;
}

export interface AISignal {
  category: 'repo' | 'tool' | 'model' | 'package' | 'content' | 'commit';
  signal: string;
  weight: number;
  source: string;
  /** 主站上的权威入口（仓库、HF 列表、npm 包页等） */
  href?: string;
  /** 人类可读的细节：多行文本，供侧栏「洞穿」展示 */
  detail?: string;
}

/* ══════════════════════════════════════════════════════════════
   Keywords & Patterns
   ══════════════════════════════════════════════════════════════ */

const AI_TOPIC_KEYWORDS = new Set([
  'machine-learning', 'deep-learning', 'artificial-intelligence', 'ai',
  'ml', 'neural-network', 'nlp', 'natural-language-processing',
  'computer-vision', 'reinforcement-learning', 'generative-ai',
  'llm', 'large-language-model', 'gpt', 'chatgpt', 'openai',
  'langchain', 'llama', 'transformers', 'diffusion', 'stable-diffusion',
  'huggingface', 'pytorch', 'tensorflow', 'keras', 'rag',
  'retrieval-augmented-generation', 'fine-tuning', 'prompt-engineering',
  'embedding', 'vector-database', 'onnx', 'mlops',
  'text-generation', 'image-generation', 'speech-recognition',
  'object-detection', 'semantic-search', 'chatbot', 'agent', 'ai-agent',
  'autogpt', 'autonomous-agent', 'multimodal',
]);

const AI_REPO_NAME_PATTERNS = [
  /\b(gpt|llm|ai|ml|bert|llama|diffus|neural|transform|langchain|openai|chatbot|rag)\b/i,
  /\b(copilot|cursor|aider|cline|continue)\b/i,
  /\b(fine.?tun|prompt|embed|vector|agent)\b/i,
];

const AI_DESCRIPTION_PATTERNS = [
  /\b(machine learning|deep learning|artificial intelligence|neural network)\b/i,
  /\b(large language model|LLM|GPT|natural language processing|NLP)\b/i,
  /\b(computer vision|object detection|image (generation|classification))\b/i,
  /\b(reinforcement learning|generative AI|diffusion model)\b/i,
  /\b(fine.?tun|RAG|retrieval.?augmented|prompt engineer|embedding|vector (store|db|database))\b/i,
  /\b(transformer|hugging\s*face|pytorch|tensorflow|keras|onnx)\b/i,
  /\b(AI agent|autonomous agent|tool use|function call)\b/i,
];

const AI_TOOL_CONFIG_PATTERNS = [
  { pattern: /\.cursor\//i, tool: 'Cursor IDE', weight: 8 },
  { pattern: /\.aider/i, tool: 'Aider', weight: 8 },
  { pattern: /\.continue/i, tool: 'Continue.dev', weight: 7 },
  { pattern: /copilot/i, tool: 'GitHub Copilot', weight: 6 },
  { pattern: /\.cline/i, tool: 'Cline', weight: 7 },
  { pattern: /codex/i, tool: 'OpenAI Codex', weight: 5 },
];

const AI_COMMIT_PATTERNS = [
  { pattern: /\bcopilot\b/i, tool: 'GitHub Copilot' },
  { pattern: /\bcursor\b/i, tool: 'Cursor' },
  { pattern: /\baider\b/i, tool: 'Aider' },
  { pattern: /\bcline\b/i, tool: 'Cline' },
  { pattern: /\bai.?generated\b/i, tool: 'AI Generated' },
  { pattern: /\bco-authored-by:.*\[bot\]/i, tool: 'AI Bot' },
  { pattern: /\b(claude|gpt|gemini|llama)\b/i, tool: 'LLM Reference' },
];

const AI_NPM_PACKAGES = new Set([
  'openai', 'langchain', '@langchain/core', '@langchain/openai',
  'ai', '@ai-sdk/openai', '@ai-sdk/anthropic',
  'llamaindex', 'chromadb', 'pinecone-client', '@pinecone-database/pinecone',
  'weaviate-ts-client', 'qdrant-js', 'replicate',
  '@huggingface/inference', '@huggingface/hub',
  'ollama', 'cohere-ai', 'anthropic', '@anthropic-ai/sdk',
  'together-ai', 'groq-sdk',
]);

const AI_PYPI_KEYWORDS = new Set([
  'machine-learning', 'deep-learning', 'neural-network', 'ai',
  'nlp', 'transformers', 'pytorch', 'tensorflow', 'llm',
  'langchain', 'openai', 'huggingface', 'diffusers',
]);

/* ══════════════════════════════════════════════════════════════
   Scoring Logic
   ══════════════════════════════════════════════════════════════ */

function scoreRepos(repos: GHRepo[]): { score: number; signals: AISignal[] } {
  const signals: AISignal[] = [];
  let score = 0;

  for (const repo of repos) {
    let repoIsAI = false;

    const aiTopics = repo.topics.filter((t) => AI_TOPIC_KEYWORDS.has(t.toLowerCase()));
    if (aiTopics.length > 0) {
      repoIsAI = true;
      const w = Math.min(8, aiTopics.length * 3);
      score += w;
      signals.push({
        category: 'repo',
        signal: `${repo.name}: topics [${aiTopics.join(', ')}]`,
        weight: w,
        source: 'GitHub',
        href: repo.html_url,
        detail: [
          `仓库：${repo.full_name || repo.name}`,
          `Stars：${repo.stargazers_count.toLocaleString()} · Forks：${(repo.forks_count ?? 0).toLocaleString()}`,
          `Language：${repo.language || '—'}`,
          `AI topics：${aiTopics.join(', ')}`,
          repo.description ? `Description：${repo.description}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }

    if (!repoIsAI) {
      for (const pat of AI_REPO_NAME_PATTERNS) {
        if (pat.test(repo.name)) {
          repoIsAI = true;
          score += 4;
          signals.push({
            category: 'repo',
            signal: `${repo.name}: AI-related name`,
            weight: 4,
            source: 'GitHub',
            href: repo.html_url,
            detail: `仓库：${repo.full_name || repo.name}\nStars：${repo.stargazers_count.toLocaleString()}\nLanguage：${repo.language || '—'}\n${
              repo.description ? `Description：${repo.description}` : '（无描述）'
            }`,
          });
          break;
        }
      }
    }

    if (!repoIsAI && repo.description) {
      for (const pat of AI_DESCRIPTION_PATTERNS) {
        if (pat.test(repo.description)) {
          repoIsAI = true;
          score += 3;
          signals.push({
            category: 'repo',
            signal: `${repo.name}: "${repo.description.slice(0, 60)}..."`,
            weight: 3,
            source: 'GitHub',
            href: repo.html_url,
            detail: `仓库：${repo.full_name || repo.name}\n完整描述：\n${repo.description}\n\nTopics：${(repo.topics || []).join(', ') || '—'}`,
          });
          break;
        }
      }
    }

    if (repoIsAI && repo.stargazers_count >= 10) {
      const starBonus = Math.min(5, Math.floor(Math.log10(repo.stargazers_count)));
      score += starBonus;
    }
  }

  return { score: Math.min(35, score), signals };
}

function scoreToolUsage(
  repos: GHRepo[],
  commits: GitHubCrawlResult['recentCommits'],
  githubLogin: string,
): { score: number; signals: AISignal[] } {
  const signals: AISignal[] = [];
  let score = 0;
  const toolsSeen = new Set<string>();

  for (const repo of repos) {
    for (const cfg of AI_TOOL_CONFIG_PATTERNS) {
      if (cfg.pattern.test(repo.name) || cfg.pattern.test(repo.description || '')) {
        if (!toolsSeen.has(cfg.tool)) {
          toolsSeen.add(cfg.tool);
          score += cfg.weight;
          signals.push({
            category: 'tool',
            signal: `Uses ${cfg.tool}`,
            weight: cfg.weight,
            source: `GitHub: ${repo.name}`,
            href: repo.html_url,
            detail: `推断依据：仓库名或描述匹配 ${cfg.tool} 相关配置/关键词。\n仓库：${repo.full_name || repo.name}\n${
              repo.description ? `Description：${repo.description}` : ''
            }`.trim(),
          });
        }
      }
    }
  }

  const commitToolsSeen = new Set<string>();
  for (const commit of commits) {
    for (const pat of AI_COMMIT_PATTERNS) {
      if (pat.pattern.test(commit.message) && !commitToolsSeen.has(pat.tool)) {
        commitToolsSeen.add(pat.tool);
        score += 3;
        const repoPath = `${githubLogin}/${commit.repo}`;
        const repoUrl = `https://github.com/${encodeURIComponent(githubLogin)}/${encodeURIComponent(commit.repo)}`;
        signals.push({
          category: 'commit',
          signal: `Commit mentions ${pat.tool}`,
          weight: 3,
          source: `${commit.repo}`,
          href: `${repoUrl}/commits`,
          detail: `仓库：${repoPath}\n时间：${commit.date}\n匹配工具线索：${pat.tool}\n\n提交说明：\n${commit.message}`,
        });
      }
    }
  }

  return { score: Math.min(25, score), signals };
}

function scoreHuggingFace(hf: MultiPlatformProfile['huggingface']): { score: number; signals: AISignal[] } {
  if (!hf) return { score: 0, signals: [] };
  const signals: AISignal[] = [];
  let score = 0;
  const base = hf.profileUrl.replace(/\/$/, '');

  if (hf.models.length > 0) {
    const w = Math.min(15, hf.models.length * 3);
    score += w;
    const topModels = [...hf.models].sort((a, b) => b.downloads - a.downloads).slice(0, 12);
    signals.push({
      category: 'model',
      signal: `${hf.models.length} models published`,
      weight: w,
      source: 'Hugging Face',
      href: `${base}/models`,
      detail: [
        `HF 用户：@${hf.username}`,
        `模型总数：${hf.models.length}`,
        '',
        '代表性模型（可逐一点开）：',
        ...topModels.map(
          (m) => `• ${m.modelId}\n  下载 ${m.downloads.toLocaleString()} · ❤ ${m.likes} · pipeline: ${m.pipelineTag || '—'}\n  https://huggingface.co/${m.modelId}`,
        ),
      ].join('\n'),
    });

    if (hf.totalDownloads > 1000) {
      const dlBonus = Math.min(10, Math.floor(Math.log10(hf.totalDownloads)) * 2);
      score += dlBonus;
      signals.push({
        category: 'model',
        signal: `${hf.totalDownloads.toLocaleString()} total downloads`,
        weight: dlBonus,
        source: 'Hugging Face',
        href: `${base}/models`,
        detail: `全站模型累计下载：${hf.totalDownloads.toLocaleString()}\n\n下载量靠前的模型：\n${topModels
          .slice(0, 8)
          .map((m) => `• ${m.modelId} — ${m.downloads.toLocaleString()} 次\n  https://huggingface.co/${m.modelId}`)
          .join('\n')}`,
      });
    }
  }

  if (hf.datasets.length > 0) {
    const w = Math.min(8, hf.datasets.length * 2);
    score += w;
    const dsLines = hf.datasets.slice(0, 12).map((d) => {
      const url = `https://huggingface.co/datasets/${encodeURIComponent(d.id)}`;
      return `• ${d.id} — 下载 ${d.downloads.toLocaleString()} · ❤ ${d.likes}\n  ${url}`;
    });
    signals.push({
      category: 'model',
      signal: `${hf.datasets.length} datasets published`,
      weight: w,
      source: 'Hugging Face',
      href: `${base}/datasets`,
      detail: [`数据集共 ${hf.datasets.length} 个：`, '', ...dsLines].join('\n'),
    });
  }

  if (hf.spaces.length > 0) {
    const w = Math.min(6, hf.spaces.length * 2);
    score += w;
    const spLines = hf.spaces.slice(0, 10).map((s) => {
      const url = `https://huggingface.co/spaces/${encodeURIComponent(s.id)}`;
      return `• ${s.id} · SDK ${s.sdk || '—'}\n  ${url}`;
    });
    signals.push({
      category: 'model',
      signal: `${hf.spaces.length} Spaces (demos)`,
      weight: w,
      source: 'Hugging Face',
      href: `${base}/spaces`,
      detail: [`Spaces 共 ${hf.spaces.length} 个：`, '', ...spLines].join('\n'),
    });
  }

  return { score: Math.min(30, score), signals };
}

function scorePackages(
  npmPackages: MultiPlatformProfile['npmPackages'],
  pypiPackages: MultiPlatformProfile['pypiPackages'],
): { score: number; signals: AISignal[] } {
  const signals: AISignal[] = [];
  let score = 0;

  for (const pkg of npmPackages) {
    const isAI = AI_NPM_PACKAGES.has(pkg.name) ||
      pkg.keywords.some((k) => k.toLowerCase().includes('ai') || k.toLowerCase().includes('llm') || k.toLowerCase().includes('ml'));
    if (isAI) {
      score += 4;
      const npmUrl = `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
      signals.push({
        category: 'package',
        signal: `npm: ${pkg.name}`,
        weight: 4,
        source: 'npm',
        href: pkg.homepage?.trim() || npmUrl,
        detail: [`包名：${pkg.name}`, `周下载：${pkg.weeklyDownloads.toLocaleString()}`, `版本：${pkg.version}`, pkg.description ? `说明：${pkg.description}` : null, pkg.repository ? `源码：${pkg.repository}` : null, `npm 页：${npmUrl}`, pkg.keywords?.length ? `keywords: ${pkg.keywords.slice(0, 20).join(', ')}` : null]
          .filter(Boolean)
          .join('\n'),
      });
    }
  }

  for (const pkg of pypiPackages) {
    const isAI = pkg.keywords.some((k) => AI_PYPI_KEYWORDS.has(k.toLowerCase())) ||
      /\b(ai|ml|llm|neural|transform|diffus|torch|tensorflow)\b/i.test(pkg.name);
    if (isAI) {
      score += 4;
      const pypiUrl = pkg.projectUrl || `https://pypi.org/project/${encodeURIComponent(pkg.name)}/`;
      signals.push({
        category: 'package',
        signal: `PyPI: ${pkg.name}`,
        weight: 4,
        source: 'PyPI',
        href: pypiUrl,
        detail: [`项目：${pkg.name}`, `版本：${pkg.version}`, pkg.summary ? `摘要：${pkg.summary}` : null, pkg.downloadsInfo ? `下载：${pkg.downloadsInfo}` : null, pkg.homePage ? `主页：${pkg.homePage}` : null, `PyPI：${pypiUrl}`]
          .filter(Boolean)
          .join('\n'),
      });
    }
  }

  return { score: Math.min(15, score), signals };
}

function scoreContent(devto: MultiPlatformProfile['devto']): { score: number; signals: AISignal[] } {
  if (!devto) return { score: 0, signals: [] };
  const signals: AISignal[] = [];
  let score = 0;

  for (const article of devto.topArticles) {
    const aiTags = article.tags.filter((t) =>
      /\b(ai|ml|llm|gpt|machine.?learning|deep.?learning|neural|nlp|computer.?vision|generative)\b/i.test(t),
    );
    const titleIsAI = /\b(AI|ML|LLM|GPT|machine learning|deep learning|neural|NLP|ChatGPT|Claude|Copilot|Cursor|generative)\b/i.test(article.title);

    if (aiTags.length > 0 || titleIsAI) {
      score += 3;
      signals.push({
        category: 'content',
        signal: `"${article.title.slice(0, 50)}"`,
        weight: 3,
        source: 'DEV.to',
        href: article.url,
        detail: [`标题：${article.title}`, `发布时间：${article.publishedAt}`, `👍 ${article.positiveReactions}`, article.tags.length ? `标签：${article.tags.join(', ')}` : null].filter(Boolean).join('\n'),
      });
    }
  }

  return { score: Math.min(10, score), signals };
}

function determineLevel(overall: number): { level: AIEngagementScore['level']; levelLabel: string } {
  if (overall >= 70) return { level: 'leader', levelLabel: 'AI Leader' };
  if (overall >= 45) return { level: 'builder', levelLabel: 'AI Builder' };
  if (overall >= 25) return { level: 'practitioner', levelLabel: 'AI Practitioner' };
  if (overall >= 10) return { level: 'explorer', levelLabel: 'AI Explorer' };
  return { level: 'none', levelLabel: 'Pre-AI Era' };
}

function generateSummary(score: AIEngagementScore, username: string): string {
  const { level, breakdown, signals } = score;

  if (level === 'none') {
    return `@${username} 的公开项目中暂未发现显著的 AI 使用痕迹。可能使用私有仓库或尚未涉足 AI 领域。`;
  }

  const parts: string[] = [];

  if (breakdown.aiModelPublishing > 15) {
    parts.push('在 Hugging Face 上积极发布模型/数据集');
  }
  if (breakdown.aiProjects > 15) {
    parts.push('大量 AI/ML 相关开源项目');
  }
  if (breakdown.aiToolUsage > 10) {
    const tools = signals.filter((s) => s.category === 'tool').map((s) => s.signal.replace('Uses ', ''));
    parts.push(`使用 ${tools.join('、')} 等 AI 编程工具`);
  }
  if (breakdown.aiPackageContrib > 5) {
    parts.push('发布了 AI 相关包');
  }
  if (breakdown.aiKnowledgeSharing > 5) {
    parts.push('活跃分享 AI 技术内容');
  }

  if (parts.length === 0) {
    parts.push('有一定的 AI 工具使用经验');
  }

  return `@${username}：${parts.join('，')}。`;
}

/* ══════════════════════════════════════════════════════════════
   Main
   ══════════════════════════════════════════════════════════════ */

export function calculateAIEngagement(
  crawlData: GitHubCrawlResult,
  multiPlatform?: MultiPlatformProfile | null,
): AIEngagementScore {
  const repoResult = scoreRepos(crawlData.repos);
  const toolResult = scoreToolUsage(crawlData.repos, crawlData.recentCommits, crawlData.username);
  const hfResult = scoreHuggingFace(multiPlatform?.huggingface ?? null);
  const pkgResult = scorePackages(
    multiPlatform?.npmPackages ?? [],
    multiPlatform?.pypiPackages ?? [],
  );
  const contentResult = scoreContent(multiPlatform?.devto ?? null);

  const breakdown = {
    aiProjects: repoResult.score,
    aiToolUsage: toolResult.score,
    aiModelPublishing: hfResult.score,
    aiKnowledgeSharing: contentResult.score,
    aiPackageContrib: pkgResult.score,
  };

  const overall = Math.min(100,
    breakdown.aiProjects +
    breakdown.aiToolUsage +
    breakdown.aiModelPublishing +
    breakdown.aiKnowledgeSharing +
    breakdown.aiPackageContrib,
  );

  const allSignals = [
    ...repoResult.signals,
    ...toolResult.signals,
    ...hfResult.signals,
    ...pkgResult.signals,
    ...contentResult.signals,
  ].sort((a, b) => b.weight - a.weight);

  const { level, levelLabel } = determineLevel(overall);

  const score: AIEngagementScore = {
    overall,
    breakdown,
    signals: allSignals.slice(0, 15),
    level,
    levelLabel,
    summary: '',
  };

  score.summary = generateSummary(score, crawlData.username);

  return score;
}
