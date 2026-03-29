/**
 * 虾米内容策展服务
 *
 * 每 4 小时为已注册虾米的用户自动：
 * 1. 搜索全网 AI 相关热门内容
 * 2. 用 LLM 整理成平台文章
 * 3. 直接发布（无需用户确认）
 * 4. 奖励 +5 积分
 *
 * 限制：每用户每次最多 1 篇；7 天内无活跃的用户跳过。
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { getAllInstances, setPendingSkillSuggestion } from './lobster-persistence';
import { getFeedPostsMap, saveFeedPosts } from './feed-posts-store';
import { FeedPostRecord } from './feed-posts-persistence';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// ── AI 内容话题池（每次随机选取） ──────────────────────────────────────────────

const TOPIC_POOL = [
  'AI 编程工具使用技巧 2025',
  'Cursor AI 编辑器最新功能',
  'Claude AI 使用技巧',
  'ChatGPT 提示词工程',
  'AI Agent 自动化工作流',
  'Midjourney 最新玩法',
  'AI 办公效率提升方法',
  'LLM 大语言模型应用案例',
  '开源 AI 工具推荐',
  'AI 写作辅助工具对比',
  'GitHub Copilot 使用技巧',
  'Stable Diffusion 教程',
  'AI 视频生成工具盘点',
  'RAG 知识库搭建实践',
  'AI 数据分析工具推荐',
  'Notion AI 深度使用指南',
  '本地部署 AI 模型教程',
  'AI 创业项目案例分析',
  'Perplexity AI 使用心得',
  'AI 学习路线图 2025',
];

// 防重复：记录最近 24 小时内已为某用户发过的话题前缀
const recentTopics = new Map<string, Set<string>>(); // userId -> Set<topicKey>

function pickTopic(userId: string): string {
  const used = recentTopics.get(userId) ?? new Set<string>();
  const available = TOPIC_POOL.filter((t) => !used.has(t));
  const pool = available.length > 0 ? available : TOPIC_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

function markTopicUsed(userId: string, topic: string) {
  if (!recentTopics.has(userId)) recentTopics.set(userId, new Set());
  const set = recentTopics.get(userId)!;
  set.add(topic);
  // 24 小时后自动清除
  setTimeout(() => set.delete(topic), 24 * 60 * 60 * 1000);
}

// ── Tavily 搜索 ───────────────────────────────────────────────────────────────

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return '';
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return '';
    const data = (await resp.json()) as { results?: Array<{ title: string; url: string; content: string }> };
    if (!data.results?.length) return '';
    return data.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 400)}\n来源：${r.url}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

// ── LLM 写文章 ────────────────────────────────────────────────────────────────

async function generateArticle(
  topic: string,
  searchResults: string,
): Promise<{ title: string; content: string } | null> {
  const base = config.litellm.baseUrl;
  const masterKey = config.litellm.masterKey;
  if (!base || !masterKey) return null;

  const llm = new OpenAI({ apiKey: masterKey, baseURL: `${base}/v1` });

  const systemPrompt = `你是一位专注 AI 领域的内容创作者，为 ClawLab（面向 AI 学习者的社区平台）撰写实用文章。
文章风格：专业但易读，有实际操作价值，中文写作。
文章要求：
- 标题吸引人，不超过 30 字
- 正文 400-800 字，Markdown 格式
- 包含：背景介绍、核心要点（3-5 条）、实际用法或建议
- 结尾简单总结
- 禁止虚构数据，禁止夸大宣传`;

  const userPrompt = searchResults
    ? `请基于以下搜索资料，写一篇关于「${topic}」的实用文章。\n\n搜索资料：\n${searchResults.slice(0, 3000)}`
    : `请写一篇关于「${topic}」的实用文章，分享给正在学习 AI 的用户。`;

  try {
    const resp = await llm.chat.completions.create({
      model: config.litellm.models[0] || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    });
    const text = resp.choices[0]?.message?.content?.trim();
    if (!text) return null;

    // 从正文提取标题（第一行 # 开头，或自动生成）
    const lines = text.split('\n').filter((l) => l.trim());
    let title = topic;
    let content = text;
    const firstLine = lines[0]?.trim();
    if (firstLine?.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 120);
      content = lines.slice(1).join('\n').trim();
    }

    return { title, content };
  } catch (e) {
    console.error('[Curator] LLM error:', e);
    return null;
  }
}

// ── 从平台热帖中提取技能关键词 ──────────────────────────────────────────────────

/** 基础已知技能词，假设 AI 对这些有足够掌握（可后续扩充） */
const BASE_KNOWN_SKILLS = new Set([
  'ChatGPT', 'Claude', 'Gemini', 'GPT-4', 'Cursor', 'GitHub Copilot',
  '提示词', 'Prompt', 'RAG', '知识库', 'AI 写作', '向量数据库',
  'Stable Diffusion', 'Midjourney', '文生图', 'AI 绘画',
  'Python', 'JavaScript', 'TypeScript', 'Node.js', 'React',
]);

const masteredSkills = new Map<string, Set<string>>(); // userId -> Set<skill>

function getUserMasteredSkills(userId: string): Set<string> {
  if (!masteredSkills.has(userId)) masteredSkills.set(userId, new Set(BASE_KNOWN_SKILLS));
  return masteredSkills.get(userId)!;
}

/** 从帖子列表里用简单关键词匹配提取技能短语 */
function extractSkillsFromPosts(posts: FeedPostRecord[]): string[] {
  const skillPattern = /[\u4e00-\u9fff\w]{2,20}(?:技能|技巧|方法|工具|框架|教程|实践|指南)/g;
  const found = new Set<string>();
  for (const p of posts) {
    const text = `${p.title} ${p.content.slice(0, 500)}`;
    const matches = text.match(skillPattern) ?? [];
    for (const m of matches) found.add(m.trim());
  }
  return [...found];
}

async function detectSkillGap(userId: string): Promise<string | null> {
  const posts = Array.from(getFeedPostsMap().values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20); // 取最新 20 篇
  if (posts.length === 0) return null;

  const skills = extractSkillsFromPosts(posts);
  const mastered = getUserMasteredSkills(userId);
  const gap = skills.find((s) => !mastered.has(s));
  return gap ?? null;
}

// ── 为单个用户执行采集发帖 ─────────────────────────────────────────────────────

async function curateForUser(userId: string): Promise<void> {
  // Step 1: 检测技能缺口，保存到 pendingSkillSuggestion
  try {
    const skillGap = await detectSkillGap(userId);
    if (skillGap) {
      await setPendingSkillSuggestion(userId, skillGap);
      console.log(`[Curator] user=${userId} skill gap detected: "${skillGap}"`);
    }
  } catch (e) {
    console.warn('[Curator] skill gap detection failed:', e);
  }

  const topic = pickTopic(userId);
  console.log(`[Curator] user=${userId} topic="${topic}"`);

  const searchResults = await tavilySearch(topic);
  const article = await generateArticle(topic, searchResults);
  if (!article) {
    console.warn(`[Curator] user=${userId} article generation failed`);
    return;
  }

  const id = uuidv4();
  const record: FeedPostRecord = {
    id,
    authorId: userId,
    kind: 'article',
    title: article.title,
    content: article.content,
    imageUrls: [],
    viewCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    publishedByAgent: true,
  };
  getFeedPostsMap().set(id, record);
  saveFeedPosts();

  // 发帖奖励 +5 积分
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { clawPoints: { increment: 5 } },
        select: { clawPoints: true },
      });
      await tx.pointLedger.create({
        data: {
          userId,
          delta: 5,
          balanceAfter: updated.clawPoints,
          reason: 'agent_post_publish',
          metadata: { postId: id, title: article.title, via: 'auto_curator', topic },
        },
      });
    });
  } catch (e) {
    console.error('[Curator] reward error:', e);
  }

  markTopicUsed(userId, topic);
  console.log(`[Curator] Published post id=${id} title="${article.title}" for user=${userId}`);
}

// ── 主调度入口 ────────────────────────────────────────────────────────────────

export function startContentCurator(): void {
  if (!config.litellm.baseUrl || !config.litellm.masterKey) {
    console.log('[Curator] LiteLLM not configured, content curator disabled');
    return;
  }

  // 每 30 分钟执行一次，覆盖所有注册用户
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Curator] Starting content curation run...');
    const instances = getAllInstances();

    console.log(`[Curator] ${instances.length} users to curate for`);

    // 串行处理，避免并发过高
    for (const inst of instances) {
      try {
        await curateForUser(inst.userId);
        // 每个用户间隔 5 秒，避免 API 速率限制
        await new Promise((r) => setTimeout(r, 5000));
      } catch (e) {
        console.error(`[Curator] Failed for user ${inst.userId}:`, e);
      }
    }

    console.log('[Curator] Content curation run complete');
  }, { timezone: 'Asia/Shanghai' });

  console.log('[Curator] Content curator scheduled (every 4 hours)');
}
