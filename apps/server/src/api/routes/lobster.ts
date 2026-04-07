/**
 * /api/lobster — 虾米 Nanobot v3
 * 工具调用 + ReAct + SSE流式 + 网页搜索 + Skills + 多模态 + 语音 + 笔记 + 定时任务 + MCP
 */
import { Router, Response, Request } from 'express';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import OpenAI from 'openai';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { isLitellmConfigured } from '../../services/litellm-budget';
import { generateFeedPostExcerpt } from '../../services/llm';
import { config } from '../../config';
import {
  getLobsterInstance,
  getAllInstances,
  applyLobster,
  renameLobster,
  getLobsterConversation,
  appendLobsterMessage,
  clearLobsterConversation,
  saveLobsterConversation,
  setPendingSkillSuggestion,
  DarwinDailyLimitExceededError,
  getDarwinDailyChatStats,
} from '../../services/lobster-persistence';
import {
  addComment,
  completePoint,
  tryCreateOrJoinSimilarOpenPoint,
  getComments,
  getPoint,
  initEvolutionNetwork,
  isEvolutionNetworkDisabled,
  listPoints,
  toPublicPoint,
  touchActivityFromPublish,
} from '../../services/evolution-network-service';
import { SkillsPersistence } from '../../services/skills-persistence';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { formatSkillHitsForLobster, searchGitHubSkillPackages } from '../../services/github-skill-hunter';
import { prisma } from '../../lib/prisma';
import { defaultDarwinDisplayName } from '../../lib/darwin-defaults';
import { validateDarwinOnboarding } from '../../lib/darwin-onboarding';
import { vkFormatDesignMdBlock } from '../../lib/vibekids-design-md';
import { saveNote, listNotes, readNote, readMemory, upsertMemory } from '../../services/lobster-notes';
import {
  getUserInstalledSkills,
  installSkillForUser,
  uninstallSkillForUser,
  isSkillInstalled,
} from '../../services/lobster-user-skills';

import {
  getUserSchedules,
  addSchedule,
  removeSchedule,
  LobsterSchedule,
} from '../../services/lobster-schedules';
import { checkAndChargeCredits, getRemainingFreeQuota, TOOL_CREDIT_CONFIG } from '../../services/skill-credits';
import { generatePptx, SlideInput } from '../../services/ppt-generator';
import { executeCode, formatExecutionResult } from '../../services/code-executor';
import { buildChatMessagesWithCompact, runCompactionIfNeeded } from '../../services/lobster-context-compact';
import {
  writeSandboxFile,
  listSandboxFiles,
  clearSandboxWorkspace,
  startSandboxPreview,
} from '../../services/darwin-sandbox-service';
import { listUserFiles, deleteUserFile, formatFileSize, fileTypeEmoji } from '../../services/lobster-user-files';
import {
  appendVibekidsDarwinMemory,
  formatVibekidsDarwinMemoryBlock,
} from '../../services/vibekids-darwin-memory';
import { generateCover } from '../../services/cover-generator';
import { registerJob, unregisterJob } from '../../services/lobster-scheduler';
import {
  loadMcpServers,
  saveMcpServers,
  loadAllMcpTools,
  callMcpTool,
  mcpToolsToOpenAI,
  McpServerConfig,
} from '../../services/mcp-client';
import {
  browserOpen,
  browserClick,
  browserType,
  browserGetContent,
  browserGetLinks,
  browserScreenshot,
  closeSession as closeBrowserSession,
} from '../../services/browser-service';
import { getFeedPostsMap, saveFeedPosts } from '../../services/feed-posts-store';
import { getUserInterestProfile, getFeedPostPersonalizationBoost } from '../../services/user-behavior';
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { existsSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import { UPLOADS_DIR } from '../../lib/data-path';
import { exaWebSearch, fetchReadableViaJina } from '../../lib/public-url-fetch';
import {
  fetchAutocliStats,
  getAutocliApiBase,
  OPENCLI_SERVER_HELP,
} from '../../services/autocli-client';
import { runOpencliPreset, type OpencliRunPreset } from '../../services/opencli-server';

const MAX_REACT_STEPS = 100;

// ─── web_search 结果缓存（TTL 10 分钟） ──────────────────────────────────────
const searchCache = new Map<string, { result: string; expiry: number }>();
const SEARCH_CACHE_TTL = 10 * 60 * 1000;

function getCachedSearch(query: string): string | null {
  const cached = searchCache.get(query.toLowerCase().trim());
  if (!cached) return null;
  if (Date.now() > cached.expiry) { searchCache.delete(query.toLowerCase().trim()); return null; }
  return cached.result;
}
function setCachedSearch(query: string, result: string): void {
  if (searchCache.size > 200) {
    const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].expiry - b[1].expiry)[0];
    if (oldest) searchCache.delete(oldest[0]);
  }
  searchCache.set(query.toLowerCase().trim(), { result, expiry: Date.now() + SEARCH_CACHE_TTL });
}

// ─── 双模型路由：判断任务复杂度 ───────────────────────────────────────────────

/** 简单任务关键词 */
const SIMPLE_PATTERNS = [
  /^(你好|hi|hello|嗨|在吗|在不|谢谢|好的|ok|👍)/i,
  /^.{0,30}[？?]$/,   // 短句问句
  /^(今天|现在|几点|日期|天气|什么是|解释下|简单说)/,
];
/** 复杂任务关键词 → 需要强模型 */
const COMPLEX_PATTERNS = [
  /写(代码|程序|脚本|爬虫|算法|函数)/,
  /做(PPT|ppt|幻灯|演示文稿)/,
  /分析(数据|报告|竞品|市场|趋势)/,
  /生成(图片|图像|封面)/,
  /(周报|月报|总结|汇报|方案|规划)/,
  /(帮我写|帮我做|帮我生成|帮我分析)/,
  /执行(代码|python|程序)/i,
];

/**
 * 判断是否为简单请求（用小模型即可）
 * 返回 true = 简单，false = 复杂（需强模型）
 */
function isSimpleRequest(message: string): boolean {
  const msg = message.trim();
  if (msg.length > 200) return false; // 长消息通常是复杂任务
  if (COMPLEX_PATTERNS.some((p) => p.test(msg))) return false;
  if (SIMPLE_PATTERNS.some((p) => p.test(msg))) return true;
  return msg.length < 60; // 短消息默认简单
}

/**
 * 运行时坏模型黑名单：遇到 "not a valid model ID" 的模型会被加入，
 * 避免重复路由到无效模型（容器重启后自动清空）。
 */
const _badModels = new Set<string>();

/** Darwin 对话：固定使用平台统一 model（与 VibeKids 一致）。 */
async function routeModel(_message: string, _baseModel: string): Promise<string> {
  const id = config.platformLlmModel;
  console.log(`[Lobster] route: fixed platform model → ${id}`);
  return id;
}

/** LiteLLM 部署不可用、无 fallback 等：应换模型重试，而非直接失败给用户 */
function isVibekidsModelInfraError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('not a valid model id') ||
    m.includes('no healthy deployments') ||
    (m.includes('unhealthy') && m.includes('deployment')) ||
    (m.includes('received model group') &&
      (m.includes('fallback') || m.includes('fallbacks=none'))) ||
    m.includes('model not found') ||
    m.includes('unknown model') ||
    (m.includes('model_group') && m.includes('not found'))
  );
}

/** LiteLLM 虚拟 Key / Team 预算耗尽：换模型重试无效，应直接提示用户联系管理员 */
function isLiteLlmBudgetExceededError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('budget has been exceeded') ||
    m.includes('budget exceeded') ||
    (m.includes('max budget') && m.includes('current cost'))
  );
}

function respondLitellmBudgetExceededIfNeeded(res: Response, e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (!isLiteLlmBudgetExceededError(msg)) return false;
  res.status(402).json({
    error: 'litellm_budget_exceeded',
    message:
      'LiteLLM 虚拟 Key 累计花费已超过管理员设置的预算上限（Budget exceeded）。请在 LiteLLM 中提高该 Key 的 max_budget、或更换/申请新 Key、或等待预算周期重置后再试。',
    detail: msg.length > 320 ? `${msg.slice(0, 320)}…` : msg,
  });
  return true;
}

/** VibeKids：仅使用平台统一 model（与 Darwin 一致），不再自动换强/弱模型。 */
async function buildVibekidsModelTryOrder(_baseModel: string): Promise<string[]> {
  return [config.platformLlmModel];
}

// ─── 今日推荐构建 ─────────────────────────────────────────────────────────────

/**
 * 基于用户兴趣画像 × 时效 × 热度打分，为用户挑选最多 3 篇推荐帖子。
 * 冷启动（行为 < 3 条）退化为全局最新热门。
 * 返回可直接追加到 system prompt 的文本，无内容时返回空字符串。
 */
async function buildRecommendationBlock(userId: string): Promise<string> {
  try {
    const posts = Array.from(getFeedPostsMap().values());
    if (posts.length === 0) return '';

    const profile = getUserInterestProfile(userId);
    const now = Date.now();

    // 排除用户自己发的内容
    const candidates = posts.filter((p) => p.authorId !== userId);
    if (candidates.length === 0) return '';

    const scored = candidates.map((p) => {
      // 时效分：14 天半衰期指数衰减
      const ageDays = (now - new Date(p.createdAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 14);

      // 热度分（归一化到 0-1）
      const pop = Math.min(
        (p.viewCount * 0.3 + p.likeCount * 0.5 + (p.favoriteCount || 0) * 0.8 + p.commentCount * 0.4) / 100,
        1,
      );

      // 个性化加成（冷启动时 boost = 1）
      const boost = getFeedPostPersonalizationBoost(p.authorId, profile);

      return { post: p, score: (recency * 0.5 + pop * 0.3) * boost };
    });

    const top3 = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ post }) => post);

    if (top3.length === 0) return '';

    const lines = top3
      .map((p) => {
        const excerpt = p.content
          .replace(/[#*`\[\]!]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 50);
        return `- 《${p.title}》：${excerpt}…（链接：/posts/${p.id}）`;
      })
      .join('\n');

    return `\n\n---\n[今日为你推荐 — 平台精选内容，供你在合适时机自然提及]\n${lines}`;
  } catch {
    return '';
  }
}

// ─── 动态 max_tokens ──────────────────────────────────────────────────────────

function calcMaxTokens(message: string, isToolStep = false): number {
  if (isToolStep) return 800;
  const msg = message.toLowerCase();
  if (/写(代码|函数|脚本|程序)|create_ppt|生成.*文章|长文|详细/.test(msg)) return 2000;
  if (/(分析|报告|总结|方案|计划|ppt|幻灯)/.test(msg) || msg.length > 150) return 1500;
  if (isSimpleRequest(message)) return 600;
  return 1000; // 默认
}

const LOBSTER_SYSTEM_PROMPT = `你是"DarwinClaw"，ClawLab 平台（clawlab.live）的专属 AI 助手。
你的定位：
- 聪明、友善、偶尔有一点幽默感，像一个懂 AI 的朋友
- 帮助用户使用 ClawLab 平台：发文章、写图文、浏览内容、了解平台功能
- 解答 AI 创作、内容生产相关的问题
- 在用户需要时提供创作灵感和建议

你拥有工具，请在有需要时主动使用：
- web_search：搜索互联网（Tavily），获取最新资讯和热点
- url_read：通过 Jina Reader 经**服务端**代取公开网页正文（推文/文章/GitHub 页等）；不可访问内网
- exa_search：语义搜索（需配置 EXA_API_KEY），与 Agent Reach 中 Exa 渠道一致
- autocli：OpenCLI-RS / AutoCLI — action=stats 拉 AutoCLI 公开统计；action=help 服务端部署说明；action=run 在**服务器**上执行 opencli-rs 白名单预设（需配置 OPENCLI_RS_BIN），输出 JSON
- search_clawlab：搜索 ClawLab 平台站内帖子。**用户提问时优先搜站内**，站内无结果再搜全网
- get_my_posts：查看用户在本平台发布的内容
- list_skills：列出平台 Skills 市场中的可用技能
- get_skill_detail：获取某个技能的完整内容和使用方法
- install_skill：将平台技能安装到你自己（当前用户专属）
- list_my_skills：列出你已为当前用户安装的技能
- uninstall_skill：卸载一个已安装的技能
- propose_skill：当平台没有所需技能时，你在网络上学习后将技能内容提议发布到平台
- search_github_skills：在 GitHub 上搜索含 SKILL.md 的公开技能包或相关仓库（关键词建议用英文或简短中文）；**不会自动安装**，仅返回链接供主人审阅；本地 OpenClaw 需自行 clone 到 skills 目录
- save_note：保存笔记或内容草稿到用户文件夹（title 不要用 MEMORY，那是专用文件）
- list_notes：列出用户已保存的笔记
- read_note：读取某篇笔记的内容
- update_memory：更新用户的永久记忆（重要！见下方说明）
- create_reminder：为用户创建定时提醒任务
- list_reminders：查看用户当前的定时任务
- browser_open：打开指定网页，返回页面标题和正文内容
- browser_click：点击网页上的元素（CSS 选择器或 text=文字）
- browser_type：在输入框中填写文字
- browser_get_content：获取当前页面的内容
- browser_get_links：获取当前页面所有链接
- browser_screenshot：对当前页面截图（返回图片，供多模态分析）
- publish_post：**直接调用此工具即可将内容发布到 ClawLab 平台**，这是你真实拥有的能力，不要说"平台没有API"或"无法发布"。
|- run_code：在安全沙盒中执行 Python 代码，用于数据分析、计算、批量处理。用户不需要懂编程，你负责写代码并执行。
|- sandbox_write_file / sandbox_list_files / sandbox_start_preview / sandbox_clear_workspace：**服务端网页沙箱**。用户要可点击预览的网页 Demo 时：必须先 sandbox_write_file 再 sandbox_start_preview；回复里必须粘贴工具返回的完整 URL（含 https 或带端口的 localhost），禁止编造无端口的 localhost 或「点击这里」假链接。本地 API 默认 3001 端口。沙箱约 30 分钟有效。
|- create_ppt：根据大纲生成 .pptx 文件，用户直接下载使用。用户说“帮我做PPT”时直接调用。
|- generate_image：根据文字描述生成图片，返回图片链接。需要配图、封面、示意图时使用。
|- list_files：列出用户文件柜中所有文件（PPT、图片等生成或上传的文件）。用户说“我的文件”时调用。
|- delete_file：删除用户文件柜中的指定文件，删除前必须向用户确认。

## 发布内容规则（重要）
你**可以且应该**帮用户发布文章和图文，流程如下：
1. 如果用户没有提供完整内容，先帮用户创作或完善内容
2. 将完整内容展示给用户预览，在消息**末尾**必须追加 \`[[PUBLISH_CONFIRM]]\`（此标记会被界面自动替换为"同意发布"和"修改"两个按钮，用户说"直接发"时可跳过预览）
3. 用户确认后，立刻调用 publish_post 工具完成发布
4. 发布时 kind 字段：纯文字长文用 "article"，带图片的短内容用 "imageText"
5. **封面图完全不需要用户操心**：如果用户发了图片则用用户图片，否则系统自动生成文字卡片封面，你永远不要问用户要封面图
绝对不要说"我没有发布权限"或"需要您自己操作"——你完全可以代替用户发布。

## 进化网络（重要）
ClawLab **进化网络**是 Agent 协作任务：发起进化点后**立即进入「进化中」**；其他用户以留言「加入」参与；重复或极相近的未结束议题无法再次发起；**24 小时**无活动可冷清关闭；服务端约每 **5 分钟**推进一次状态；仅发起者可确认「目标达成」。
- 用户申请 DarwinClaw 后，系统会为其自动创建一条**个人进化起点**（可在 /evolution-network 查看）。
- 你必须使用工具 **list_evolution_points**、**get_evolution_point**、**join_evolution_point**、**create_evolution_point**、**complete_evolution_point**、**run_darwin_evolver_cycle**（手动跑一轮内置进化器）帮助用户参与，不要只说「请去网页操作」。
- 在「进化中」帮用户发帖时，**publish_post** 尽量带上 **evolutionPointId**，便于统计该点产出。

## 自我进化规则（重要）
当用户提出的需求超出你当前能力时，你应该主动寻找解决方案，而不是说"我不会"：

**第一步：搜索平台技能市场**
- 调用 list_skills(keyword=用户需求关键词) 搜索平台是否有对应技能
- 如果找到匹配技能，向用户展示："我在技能市场找到了「XXX」，安装后我就能帮你做这件事，要安装吗？"
- 用户同意后立即调用 install_skill 将技能安装到你自己

**第二步：平台没有时，优先去 GitHub 找公开 SKILL.md 技能包**
- 调用 search_github_skills(query=与需求相关的关键词，英文效果更好) 检索含 SKILL.md 的仓库或高星相关项目
- 向用户展示仓库链接与文件链接，提醒安装前阅读 SKILL.md，勿执行未声明脚本；服务端不会自动 clone

**第三步：仍不足时再去全网学习**
- 调用 web_search 搜索该任务的实现方法
- 通过 browser_open 打开相关页面深入学习
- 将学到的方法整理成结构化的技能说明（Markdown 格式）
- 调用 propose_skill 将学到的技能提交到平台供其他用户使用
- 提醒用户："我已经自学了这个技能并提议发布到 ClawLab 平台，现在我可以帮你了！"

**官方技能（出厂内置，无需安装）**
- 系统会在每次对话的 system 消息末尾注入"[平台官方技能索引]"，其中列出的所有技能你天生就会，可直接使用
- **强制规则：当用户问"你有哪些技能"、"你能做什么"、"你会什么"、"你的技能"时，必须先调用 list_my_skills 工具，再基于工具返回结果回答，禁止凭记忆或猜测作答**
- 调用 list_my_skills 后，将官方内置技能逐条列出，不要只说"包括XXX等"，要把完整列表展示给用户
- **绝对不要说"我没有安装任何技能"——你始终拥有全部官方技能**

**额外安装技能的使用**
- 每次对话开始时，系统会自动加载用户额外安装的技能说明
- 按照技能的 SKILL.md 指导执行任务，不需要用户再次说明

## 永久记忆规则（重要）
对话开始时，如果 system 消息中有"[用户记忆]"块，那是你对这位用户的长期记忆，请认真参考。
当用户在对话中透露以下类型信息时，你必须在回复之后主动调用 update_memory 工具将其记录下来：
- 个人基本信息（职业、行业、城市、年龄段等）
- 偏好与习惯（写作风格、常用工具、兴趣方向等）
- 重要目标或计划（想做的项目、学习计划等）
- 明确表达希望你记住的任何事
update_memory 接收完整的记忆文本，你需要将已有记忆与新信息合并后整体写入（Markdown 格式），不要只写新增部分。

约束：
- 长时间对话时，平台可能对「早期轮次」做 Auto-Compact 摘要；你应同时参考摘要块与最近几条原文，保持连贯。
- 始终用中文回复（除非用户明确用英文提问）
- 回复简洁自然，一般控制在 300 字以内
- 不讨论政治、不传播未经证实的信息
- 你代表 ClawLab 品牌，保持专业友善的基调
- 不推荐用户使用竞品

## 主动推荐规则
system 消息中如果有"[今日为你推荐]"块，说明你提前为用户挑选了平台内容。
- 当用户打招呼（你好、嗨、在吗等）、闲聊、或明确问"有什么推荐"时，**自然地提一篇推荐**，用一句话带出标题和链接，不要生硬列清单
- 当用户有明确任务时，**不要插入推荐**，专注完成任务
- 推荐语要口语化，比如："对了，最近平台有篇文章讲XX，你可能感兴趣：[链接]"，而不是"为您推荐以下内容"
- 每次对话最多提一篇，不要连续推荐`;

// ─── Tool 定义 ────────────────────────────────────────────────────────────────

const BASE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_clawlab',
      description: '在 ClawLab 平台站内搜索帖子和文章。当用户提问 AI 相关话题时，优先用此工具搜索平台已有内容再作答；也可用于查找热门文章推荐给用户。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如"Cursor 使用技巧"、"AI 写作"等' },
          limit: { type: 'number', description: '返回结果数量，默认 5，最多 10' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取最新资讯、热点话题、实时数据。当用户询问最新消息、当前趋势或需要实时信息时使用。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词，尽量简洁精准' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'url_read',
      description:
        '读取公开网页的正文内容（通过 Jina Reader，由服务端代请求）。用户给出链接、或需要读推文/文章/GitHub/README/公众号网页版时使用；不可访问内网或本地地址。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '以 http(s):// 开头的完整 URL' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exa_search',
      description:
        '语义搜索互联网（Exa）。当 Tavily web_search 结果不理想、或需要「更像 Agent Reach / mcporter exa」的语义检索时使用；未配置 EXA_API_KEY 时不可用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索语句或关键词' },
          numResults: { type: 'number', description: '返回条数 1–10，默认 5' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'autocli',
      description:
        'OpenCLI-RS / AutoCLI：action=stats 拉 AutoCLI 公开统计；action=help 服务端部署 opencli-rs 说明；action=run 在服务器上执行白名单 opencli 预设（需 OPENCLI_RS_BIN）。读网页正文用 url_read。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['stats', 'help', 'run'],
            description: 'stats | help | run（run 需服务端安装 opencli-rs 并配置 OPENCLI_RS_BIN）',
          },
          preset: {
            type: 'string',
            enum: ['hackernews_top', 'devto_top', 'lobsters_hot', 'arxiv_search'],
            description: '仅 action=run 时必填：公开 API 类站点预设',
          },
          limit: { type: 'number', description: 'run 时返回条数 1–15，默认 5' },
          query: { type: 'string', description: '仅 preset=arxiv_search 时：搜索关键词' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_posts',
      description: '获取当前用户在 ClawLab 平台上发布的图文和文章列表，包含标题、类型、发布时间、内容预览。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认 5，最多 10' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: '列出 ClawLab Skills 市场中的可用技能，返回技能 ID、名称、描述。',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '可选：搜索关键词，筛选相关技能' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill_detail',
      description: '获取某个技能的完整内容（skillMarkdown）。先用 list_skills 获取技能 ID，再用此工具获取详情。',
      parameters: {
        type: 'object',
        properties: { skillId: { type: 'string', description: 'Skill ID，形如 official-xxx 或 skill-xxxxxxxx' } },
        required: ['skillId'],
      },
    },
  },
  // ── 自进化工具 ──
  {
    type: 'function',
    function: {
      name: 'install_skill',
      description:
        '将平台 Skills 市场中的技能安装到当前用户的 DarwinClaw 实例。安装后该技能的能力将永久对该用户可用。安装前必须先用 list_skills 找到技能 ID，并向用户展示并获得确认。',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: '要安装的技能 ID（来自 list_skills）' },
        },
        required: ['skillId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_skills',
      description: '列出已为当前用户安装的所有技能（用户专属技能列表，不含平台基础工具）。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'uninstall_skill',
      description: '卸载当前用户已安装的某个技能。',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: '要卸载的技能 ID' },
        },
        required: ['skillId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_skill',
      description:
        '当平台没有所需技能时，将从网络学习到的技能方法整理后提议发布到 ClawLab 平台。这会将技能保存为"待审核"状态，并通知用户可以在平台发布。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '技能名称，简洁易懂' },
          description: { type: 'string', description: '技能功能简介，一句话说明能做什么' },
          skillMarkdown: {
            type: 'string',
            description: '技能的完整说明（Markdown 格式），包含功能描述、使用步骤、示例',
          },
          tags: { type: 'string', description: '标签，逗号分隔，如 "分析,Excel,数据"' },
        },
        required: ['title', 'description', 'skillMarkdown'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_github_skills',
      description:
        '在 GitHub 上搜索符合 Agent Skills 惯例的 SKILL.md 技能包或高星相关仓库。用于平台技能市场没有所需能力时；返回仓库链接与 SKILL.md 文件链接（若有）。不会自动下载或安装；安装前需用户审阅内容。关键词建议用英文或简短能力描述。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如 "browser automation"、"twitter post"、"mcp server"',
          },
        },
        required: ['query'],
      },
    },
  },
  // ── 笔记工具 ──
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: '保存笔记、内容草稿、创作计划到用户文件夹。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记正文内容（支持 Markdown）' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description:
        '更新用户的永久记忆文件。将已有记忆与新信息合并后整体写入，内容使用 Markdown 格式。每当用户透露职业、偏好、习惯、目标等重要个人信息时，必须调用此工具记录。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '完整的记忆内容（Markdown），包含已有记忆和新增信息，不要只写新增部分',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: '列出用户已保存的所有笔记文件名和标题。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: '读取某篇笔记的完整内容。先用 list_notes 获取文件名，再用此工具读取。',
      parameters: {
        type: 'object',
        properties: { filename: { type: 'string', description: '笔记文件名（从 list_notes 获取）' } },
        required: ['filename'],
      },
    },
  },
  // ── 定时任务工具 ──
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: '为用户创建定时提醒或定期任务。例如：每天早上8点提醒发帖、每周一推送选题。',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '定时任务的人类可读描述，如"每天早上8点"' },
          cronExpr: { type: 'string', description: 'Cron 表达式，如 "0 8 * * *" 代表每天8点' },
          task: { type: 'string', description: '到时间要执行的任务内容描述' },
        },
        required: ['description', 'cronExpr', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: '列出用户当前所有的定时提醒任务。',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ── 浏览器工具 ──
  {
    type: 'function',
    function: {
      name: 'browser_open',
      description: '打开指定网页，返回页面标题和正文内容。用于需要获取完整网页内容、填写表单前先查看页面结构时使用。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: '完整 URL，必须以 http:// 或 https:// 开头' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: '点击网页上的元素。selector 可以是 CSS 选择器（如 "button.submit"）或 text=文字（如 "text=登录"）。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS 选择器或 text=文字内容' } },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: '在网页输入框中填写文字。需先用 browser_open 打开页面。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '输入框的 CSS 选择器，如 "input[name=q]"' },
          text: { type: 'string', description: '要输入的文字内容' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_content',
      description: '获取当前浏览器页面的标题和正文内容（点击或操作后查看结果时使用）。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_links',
      description: '获取当前页面所有可点击的链接列表（用于导航探索页面结构）。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: '对当前页面截图并返回图片，用于视觉分析页面内容、验证操作结果。截图后请用多模态能力描述所见内容。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'publish_post',
      description:
        '将内容发布到 ClawLab 平台。**必须两步调用**：第一步传 confirmed=false，工具会返回预览文本，你把预览展示给用户并询问"确认发布吗？"；第二步等用户明确同意（如"发布"、"确认"、"好的"、"可以"等）后，再次调用并传 confirmed=true 才会真正发布。绝不能在未经用户同意时直接传 confirmed=true。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '文章标题，不超过 120 字' },
          content: { type: 'string', description: '正文内容（Markdown 格式），不超过 20000 字' },
          kind: {
            type: 'string',
            enum: ['article', 'imageText'],
            description: 'article=文章（长内容）；imageText=图文（短内容+图片，正文不超过1000字）',
          },
          confirmed: {
            type: 'boolean',
            description: '是否已收到用户的明确发布确认。第一次调用必须传 false；用户说"确认/发布/好的"后第二次调用传 true。',
          },
          evolutionPointId: {
            type: 'string',
            description:
              '可选：关联的进化点 ID（如 evo-xxx）。在「进化中」阶段发帖时应尽量带上，便于统计该点的产出。',
          },
        },
        required: ['title', 'content', 'kind', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: '在安全沙盒中执行 Python 代码，用于数据分析、计算、字符串处理等任务。代码不能访问网络或文件系统，每次执行限时 15 秒。返回代码的标准输出结果。',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['python'],
            description: '编程语言，目前仅支持 python',
          },
          code: {
            type: 'string',
            description: '要执行的代码字符串。使用 print() 输出结果。',
          },
        },
        required: ['language', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_write_file',
      description:
        '在 Darwin 服务端沙箱工作区写入文本文件（如 index.html、styles.css）。仅允许相对路径，不能含 ..。用于可预览的网页 Demo：写入后需调用 sandbox_start_preview。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对路径，如 index.html 或 assets/style.css' },
          content: { type: 'string', description: '文件完整内容（UTF-8）' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_list_files',
      description: '列出当前用户沙箱工作区内的相对路径文件列表。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_start_preview',
      description:
        '在用户沙箱目录启动只读静态 HTTP 服务，并返回可在浏览器中打开的预览 URL（约 30 分钟有效）。写入 HTML 后必须调用此工具用户才能直接点开查看。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_clear_workspace',
      description: '清空当前用户的沙箱工作区（删除其中所有文件）。用户要求重做或空间不足时使用。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ppt',
      description: '根据结构化大纲生成 PowerPoint (.pptx) 文件，返回可下载的文件链接。适合用户要求制作 PPT、幻灯片、演示文稿时使用。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '演示文稿总标题',
          },
          slides: {
            type: 'array',
            description: '幻灯片列表，第一项为封面页',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '该页标题' },
                content: { type: 'string', description: '该页内容，多个要点用换行+"• "开头，或直接换行分隔' },
                notes: { type: 'string', description: '演讲备注（可选）' },
              },
              required: ['title'],
            },
          },
        },
        required: ['title', 'slides'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '调用 AI 图像生成接口，根据文字描述生成图片，返回图片 URL。适合需要配图、封面图、示意图时使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '图片描述，越详细越好。建议包含：风格（写实/插画/极简）、主体内容、色调、构图',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1792x1024', '1024x1792'],
            description: '图片尺寸：1024x1024=正方形，1792x1024=横版宽屏，1024x1792=竖版',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出用户文件柜中保存的所有文件（PPT、图片、文档等生成或上传的文件）。与 list_notes 不同，此工具显示的是二进制文件，不是文本笔记。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '从用户文件柜中删除一个文件。需先用 list_files 获取文件 ID，再调用此工具。删除前必须向用户确认。',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '文件 ID（从 list_files 获取）' },
        },
        required: ['fileId'],
      },
    },
  },
];

/** 进化网络：与平台 /evolution-network 一致，代表用户参与协作进化 */
const EVOLUTION_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_evolution_points',
      description:
        '列出 ClawLab 进化网络中的进化点。可筛选：evolving（进化中，含未结束的全部）、proposed/active/ended、all。用户想了解协作任务或要加入时使用。',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['evolving', 'proposed', 'active', 'ended', 'all'],
            description: '筛选状态；evolving=未结束；默认 all 表示全部',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_evolution_point',
      description: '获取单个进化点的详情：主题、目标、待解决问题、状态、报名人数等。',
      parameters: {
        type: 'object',
        properties: {
          pointId: { type: 'string', description: '进化点 ID，如 evo-xxx' },
        },
        required: ['pointId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'join_evolution_point',
      description:
        '代表当前用户加入某个进化点（在评论区表态，默认「加入」）。每个账号每个进化点仅一次；发起者不能给自己加入。',
      parameters: {
        type: 'object',
        properties: {
          pointId: { type: 'string', description: '进化点 ID' },
          message: { type: 'string', description: '留言，默认「加入」' },
        },
        required: ['pointId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_evolution_point',
      description:
        '发起一个新的进化点，创建后直接进入「进化中」。需包含主题、目标与待解决问题。若与已有未结束议题相同或相近，将自动加入该议题而不会重复开题。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '主题标题' },
          goal: { type: 'string', description: '要达成的目标' },
          problems: {
            type: 'array',
            items: { type: 'string' },
            description: '待解决问题列表，至少一条',
          },
        },
        required: ['title', 'goal', 'problems'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_evolution_point',
      description:
        '仅发起者可调用：确认当前进化点目标已达成并结束（与「冷清关闭」不同）。仅适用于「进化中」状态。',
      parameters: {
        type: 'object',
        properties: {
          pointId: { type: 'string', description: '进化点 ID' },
        },
        required: ['pointId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_darwin_evolver_cycle',
      description:
        '立即执行一轮 Darwin 内置进化器：能力评估、改进项、匹配/创建进化点、GitHub（SKILL.md 优先）技能检索、关闭条件检视。同一用户约 24 小时内最多一轮；结果可在 /evolution-network/evolver 看板查看。',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// 每个工具调用时展示给用户的状态文字
const TOOL_STATUS: Record<string, (args: Record<string, unknown>, userId?: string) => string> = {
  web_search: (a, userId) => {
    const remaining = userId ? getRemainingFreeQuota(userId, 'web_search') : 0;
    const cfg = TOOL_CREDIT_CONFIG['web_search'];
    const costHint = remaining > 0
      ? `（今日剩余免费 ${remaining} 次）`
      : `（消耗 ${cfg?.costPerCall ?? 2} 积分）`;
    return `正在搜索「${a.query}」... ${costHint}`;
  },
  url_read: (a, userId) => {
    const remaining = userId ? getRemainingFreeQuota(userId, 'url_read') : 0;
    const cfg = TOOL_CREDIT_CONFIG['url_read'];
    const costHint = remaining > 0 ? `（今日剩余免费 ${remaining} 次）` : `（消耗 ${cfg?.costPerCall ?? 1} 积分）`;
    return `正在读取网页 ${a.url}... ${costHint}`;
  },
  exa_search: (a, userId) => {
    const remaining = userId ? getRemainingFreeQuota(userId, 'exa_search') : 0;
    const cfg = TOOL_CREDIT_CONFIG['exa_search'];
    const costHint = remaining > 0 ? `（今日剩余免费 ${remaining} 次）` : `（消耗 ${cfg?.costPerCall ?? 2} 积分）`;
    return `正在 Exa 搜索「${a.query}」... ${costHint}`;
  },
  autocli: (a) => {
    const act = String(a.action || '').toLowerCase();
    if (act === 'stats') return '正在拉取 AutoCLI 公开统计…';
    if (act === 'run') return '正在服务端执行 opencli-rs…';
    return '正在加载 OpenCLI / AutoCLI 说明…';
  },
  get_my_posts: () => '正在获取你的发布记录...',
  list_skills: (a) => (a.keyword ? `正在查找「${a.keyword}」相关技能...` : '正在查询技能市场...'),
  get_skill_detail: (a) => `正在加载技能详情 (${a.skillId})...`,
  install_skill: (a) => `正在安装技能 ${a.skillId}...`,
  list_my_skills: () => '正在查看你的已安装技能...',
  uninstall_skill: (a) => `正在卸载技能 ${a.skillId}...`,
  propose_skill: (a) => `正在提议发布技能「${a.title}」...`,
  search_github_skills: (a) => `正在 GitHub 搜索技能「${a.query}」...`,
  save_note: (a) => `正在保存笔记「${a.title}」...`,
  update_memory: () => '正在更新记忆...',
  list_notes: () => '正在列出你的笔记...',
  read_note: (a) => `正在读取笔记 ${a.filename}...`,
  create_reminder: (a) => `正在创建定时任务「${a.description}」...`,
  list_reminders: () => '正在查看你的定时任务...',
  browser_open: (a, userId) => {
    const remaining = userId ? getRemainingFreeQuota(userId, 'browser_open') : 0;
    const cfg = TOOL_CREDIT_CONFIG['browser_open'];
    const costHint = remaining > 0 ? '' : `（消耗 ${cfg?.costPerCall ?? 1} 积分）`;
    return `正在打开 ${a.url}... ${costHint}`.trim();
  },
  browser_click: (a) => `正在点击「${a.selector}」...`,
  browser_type: (a) => `正在输入文字到「${a.selector}」...`,
  browser_get_content: () => '正在读取页面内容...',
  browser_get_links: () => '正在获取页面链接...',
  browser_screenshot: (_, userId) => {
    const remaining = userId ? getRemainingFreeQuota(userId, 'browser_screenshot') : 0;
    const cfg = TOOL_CREDIT_CONFIG['browser_screenshot'];
    const costHint = remaining > 0 ? '' : `（消耗 ${cfg?.costPerCall ?? 2} 积分）`;
    return `正在截图... ${costHint}`.trim();
  },
  search_clawlab: (a) => `正在搜索平台内容「${a.query}」...`,
  publish_post: (a) => `正在发布「${a.title}」...`,
  list_evolution_points: () => '正在查询进化网络...',
  get_evolution_point: (a) => `正在读取进化点 ${a.pointId}...`,
  join_evolution_point: (a) => `正在加入进化点 ${a.pointId}...`,
  create_evolution_point: (a) => `正在发起进化点「${a.title}」...`,
  complete_evolution_point: (a) => `正在确认完成进化点 ${a.pointId}...`,
  run_darwin_evolver_cycle: () => '正在执行 Darwin 进化器一轮…',
  run_code: (a) => `正在执行 ${a.language ?? 'python'} 代码...`,
  sandbox_write_file: (a) => `正在写入沙箱文件 ${a.path}...`,
  sandbox_list_files: () => '正在列出沙箱文件...',
  sandbox_start_preview: () => '正在启动网页预览...',
  sandbox_clear_workspace: () => '正在清空沙箱工作区...',
  create_ppt: (a) => `正在生成 PPT「${a.title}」...`,
  generate_image: () => '正在生成图片...',
  list_files: () => '正在查看你的文件柜...',
  delete_file: (a) => `正在删除文件 ${a.fileId}...`,
};

function sandboxPreviewBaseUrl(): string {
  const raw =
    process.env.SERVER_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || process.env.SERVER_PORT || 3001}`;
  return raw.replace(/\/$/, '');
}

// ─── Tool 执行 ────────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  /** 用户本次对话中发送的图片 base64 data URL，用于 publish_post 封面 */
  pendingImage?: string,
): Promise<string> {
  // ── 积分前置检查 ──────────────────────────────────────────────────────────────
  if (TOOL_CREDIT_CONFIG[name]) {
    const creditCheck = await checkAndChargeCredits(userId, name);
    if (!creditCheck.allowed) {
      return `⚠️ ${creditCheck.reason}`;
    }
    // 如果使用了免费额度，悄悄记录；如果扣了积分，稍后会在响应里提示
    if (creditCheck.charged > 0) {
      // 把积分消耗信息附加到工具结果末尾（由调用方拼接）
      const remaining = getRemainingFreeQuota(userId, name);
      (args as Record<string, unknown>).__creditInfo__ =
        `（消耗 ${creditCheck.charged} 积分，剩余免费次数：${remaining}/今日）`;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  switch (name) {
    case 'web_search': {
      const query = String(args.query || '').trim();
      if (!query) return '搜索词不能为空。';
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        return '⚠️ 网页搜索功能暂未启用（需配置 TAVILY_API_KEY）。将根据已有知识回答。';
      }
      // 命中缓存直接返回
      const cached = getCachedSearch(query);
      if (cached) {
        const creditInfo = args.__creditInfo__ ? `\n\n${args.__creditInfo__}` : '';
        return cached + creditInfo;
      }
      try {
        const resp = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 4,
            search_depth: 'basic',
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
        const data = (await resp.json()) as {
          results?: Array<{ title: string; url: string; content: string }>;
        };
        if (!data.results?.length) return '未找到相关搜索结果，请换个关键词试试。';
        const searchResult = data.results
          .map(
            (r, i) =>
              `[${i + 1}] ${r.title}\n${r.content.slice(0, 300)}\n来源：${r.url}`,
          )
          .join('\n\n');
        setCachedSearch(query, searchResult);
        const creditInfo = args.__creditInfo__ ? `\n\n${args.__creditInfo__}` : '';
        return searchResult + creditInfo;
      } catch (err) {
        console.error('[Lobster] web_search error:', err);
        return '搜索请求失败，请稍后重试。';
      }
    }

    case 'url_read': {
      const target = String(args.url || '').trim();
      if (!target) return '请提供 url。';
      try {
        const { text } = await fetchReadableViaJina(target);
        const creditInfo = args.__creditInfo__ ? `\n\n${args.__creditInfo__}` : '';
        return `**页面正文**（Jina Reader）\n\n${text}${creditInfo}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Lobster] url_read error:', err);
        return `读取失败：${msg}`;
      }
    }

    case 'exa_search': {
      if (!process.env.EXA_API_KEY?.trim()) {
        return '⚠️ Exa 搜索未启用（需配置 EXA_API_KEY）。可改用 web_search 或 url_read。';
      }
      const query = String(args.query || '').trim();
      if (!query) return '搜索词不能为空。';
      const n = Math.min(10, Math.max(1, Number(args.numResults) || 5));
      try {
        const out = await exaWebSearch(query, n);
        const creditInfo = args.__creditInfo__ ? `\n\n${args.__creditInfo__}` : '';
        return `**Exa 搜索结果**\n\n${out}${creditInfo}`;
      } catch (err) {
        console.error('[Lobster] exa_search error:', err);
        return `Exa 搜索失败：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'autocli': {
      const action = String(args.action || 'help').toLowerCase();
      if (action === 'help') {
        return OPENCLI_SERVER_HELP;
      }
      if (action === 'stats') {
        try {
          const s = await fetchAutocliStats();
          return (
            `**AutoCLI 公开统计**（${getAutocliApiBase()}）\n\n` +
            `- 收录站点数：${s.total_sites}\n` +
            `- 命令数：${s.total_commands}\n` +
            (s.active_users != null ? `- 活跃相关用户：${s.active_users}\n` : '') +
            (s.total_uses != null ? `- 总调用次数（若返回）：${s.total_uses}\n` : '') +
            `\n服务端结构化数据：配置 OPENCLI_RS_BIN 后使用 autocli(action=run)。说明见 autocli(action=help)。`
          );
        } catch (e) {
          console.error('[Lobster] autocli stats error:', e);
          return `拉取 AutoCLI 统计失败：${e instanceof Error ? e.message : String(e)}。可设置环境变量 AUTOCLI_API_BASE 指向官方 https://www.autocli.ai 后重试。`;
        }
      }
      if (action === 'run') {
        const presetRaw = String(args.preset || '').trim();
        const allowed: OpencliRunPreset[] = ['hackernews_top', 'devto_top', 'lobsters_hot', 'arxiv_search'];
        if (!allowed.includes(presetRaw as OpencliRunPreset)) {
          return `请设置 preset 为之一：${allowed.join(', ')}。arxiv_search 需同时传 query。`;
        }
        if (presetRaw === 'arxiv_search') {
          const q = String(args.query || '').trim();
          if (!q) return 'arxiv_search 需提供 query。';
        }
        const creditCheck = await checkAndChargeCredits(userId, 'opencli_run');
        if (!creditCheck.allowed) {
          return `⚠️ ${creditCheck.reason}`;
        }
        try {
          const out = await runOpencliPreset(presetRaw as OpencliRunPreset, {
            limit: args.limit,
            query: args.query,
          });
          let extra = '';
          if (creditCheck.charged > 0) {
            const remaining = getRemainingFreeQuota(userId, 'opencli_run');
            extra = `\n\n（消耗 ${creditCheck.charged} 积分，剩余免费次数：${remaining}/今日）`;
          }
          return `**opencli-rs（服务端）** preset=\`${presetRaw}\`\n\n\`\`\`\n${out.slice(0, 350000)}\n\`\`\`${extra}`;
        } catch (e) {
          console.error('[Lobster] autocli run error:', e);
          const msg = e instanceof Error ? e.message : String(e);
          return `服务端执行 opencli-rs 失败：${msg}\n\n请确认已设置 OPENCLI_RS_BIN 且服务器已安装 opencli-rs；详见 autocli(action=help)。`;
        }
      }
      return 'action 支持 stats、help、run。';
    }

    case 'search_clawlab': {
      const query = String(args.query || '').trim();
      if (!query) return '请提供搜索关键词。';
      const limit = Math.min(Number(args.limit || 5), 10);
      const posts = Array.from(getFeedPostsMap().values());
      const q = query.toLowerCase();
      const results = posts
        .filter((p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
      if (results.length === 0) return `平台站内暂无关于「${query}」的内容，建议搜索全网。`;
      const lines = results
        .map((p) => {
          const excerpt = p.content.replace(/[#*`\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `- 《${p.title}》：${excerpt}… → /posts/${p.id}`;
        })
        .join('\n');
      return `站内找到 ${results.length} 篇关于「${query}」的内容：\n${lines}`;
    }

    case 'get_my_posts': {
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const feedPostsMap = getFeedPostsMap();
      const posts = Array.from(feedPostsMap.values())
        .filter((p) => p.authorId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
      if (!posts.length) return '该用户还未发布任何内容。';
      return posts
        .map(
          (p, i) =>
            `[${i + 1}] ${p.title || '（无标题）'} [${p.kind === 'imageText' ? '图文' : '文章'}]\n` +
            `发布于：${new Date(p.createdAt).toLocaleDateString('zh-CN')}\n` +
            `内容预览：${(p.content || '').slice(0, 100)}${(p.content || '').length > 100 ? '...' : ''}`,
        )
        .join('\n---\n');
    }

    case 'list_skills': {
      const keyword = String(args.keyword || '').toLowerCase().trim();
      const officialSkills = loadOfficialSkills();
      const userSkillsMap = SkillsPersistence.loadAll();
      const userSkills = Array.from(userSkillsMap.values());
      const all = [
        ...officialSkills.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          label: '[官方]',
        })),
        ...userSkills.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          label: '',
        })),
      ];
      const filtered = keyword
        ? all.filter(
            (s) =>
              s.title.toLowerCase().includes(keyword) ||
              s.description.toLowerCase().includes(keyword),
          )
        : all.slice(0, 15);
      if (!filtered.length)
        return keyword ? `未找到与「${keyword}」相关的技能。` : '暂无可用技能。';
      return filtered
        .map((s) => `ID: ${s.id}\n名称：${s.title}${s.label}\n描述：${s.description || '暂无描述'}`)
        .join('\n---\n');
    }

    case 'get_skill_detail': {
      const skillId = String(args.skillId || '').trim();
      if (!skillId) return '请提供有效的 Skill ID。';
      if (skillId.startsWith('official-')) {
        const skill = loadOfficialSkills().find((s) => s.id === skillId);
        if (!skill) return `未找到技能 ${skillId}。请先用 list_skills 查询可用技能。`;
        return `# ${skill.title}\n\n${skill.skillMarkdown}`;
      }
      const skill = SkillsPersistence.loadAll().get(skillId);
      if (!skill) return `未找到技能 ${skillId}。请先用 list_skills 查询可用技能。`;
      return `# ${skill.title}\n\n${skill.skillMarkdown}`;
    }

    // ── 自进化工具 ──
    case 'install_skill': {
      const skillId = String(args.skillId || '').trim();
      if (!skillId) return '请提供有效的 Skill ID。';
      if (isSkillInstalled(userId, skillId)) {
        return `技能 ${skillId} 已经安装过了，无需重复安装。`;
      }
      // 从平台市场查找技能内容
      let title = '';
      let description = '';
      let skillMarkdown = '';
      if (skillId.startsWith('official-')) {
        const s = loadOfficialSkills().find((x) => x.id === skillId);
        if (!s) return `未在平台找到技能 ${skillId}，请先用 list_skills 确认 ID 是否正确。`;
        title = s.title;
        description = s.description || '';
        skillMarkdown = s.skillMarkdown;
      } else {
        const s = SkillsPersistence.loadAll().get(skillId);
        if (!s) return `未在平台找到技能 ${skillId}，请先用 list_skills 确认 ID 是否正确。`;
        title = s.title;
        description = s.description || '';
        skillMarkdown = s.skillMarkdown;
      }
      await installSkillForUser(userId, {
        skillId,
        title,
        description,
        skillMarkdown,
        source: 'platform',
      });
      return `✅ 技能「${title}」已成功安装！我现在可以帮你使用这个技能了。`;
    }

    case 'list_my_skills': {
      const officialSkillsList = loadOfficialSkills();
      const installed = getUserInstalledSkills(userId);
      const parts: string[] = [];

      if (officialSkillsList.length > 0) {
        const officialPart = officialSkillsList
          .map((s) => `[官方内置] **${s.title}**\n描述：${s.description ?? (s.skillMarkdown.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 100) ?? '')}`)
          .join('\n---\n');
        parts.push(`## 官方内置技能（${officialSkillsList.length} 个，无需安装，直接使用）\n${officialPart}`);
      }

      if (installed.length > 0) {
        const installedPart = installed
          .map(
            (s, i) =>
              `[${i + 1}] **${s.title}** (${s.skillId})\n来源：${s.source === 'platform' ? '平台市场' : '网络自学'}\n描述：${s.description || '暂无'}\n安装时间：${new Date(s.installedAt).toLocaleString('zh-CN')}`,
          )
          .join('\n---\n');
        parts.push(`## 额外安装技能（${installed.length} 个）\n${installedPart}`);
      } else {
        parts.push('## 额外安装技能\n暂未安装任何额外技能。');
      }

      return parts.join('\n\n');
    }

    case 'uninstall_skill': {
      const skillId = String(args.skillId || '').trim();
      if (!skillId) return '请提供要卸载的技能 ID。';
      const removed = await uninstallSkillForUser(userId, skillId);
      if (!removed) return `未找到已安装的技能 ${skillId}，请用 list_my_skills 查看已安装列表。`;
      return `✅ 技能 ${skillId} 已卸载。`;
    }

    case 'propose_skill': {
      const title = String(args.title || '').trim();
      const description = String(args.description || '').trim();
      const skillMarkdown = String(args.skillMarkdown || '').trim();
      const tagsRaw = String(args.tags || '').trim();
      if (!title || !skillMarkdown) return '技能名称和内容不能为空。';
      // 将学到的技能直接安装到当前用户，并以 web-learned 来源标记
      const learnedId = `learned-${Date.now()}`;
      await installSkillForUser(userId, {
        skillId: learnedId,
        title,
        description,
        skillMarkdown,
        source: 'web-learned',
      });
      const tagsArr = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const tagStr = tagsArr.length ? `\n标签：${tagsArr.join('、')}` : '';
      return `✅ 我已经自学了「${title}」这个技能，并为你安装好了，现在可以直接使用！\n\n💡 建议：这个技能对其他用户也有用，你可以把它发布到 ClawLab Skills 市场，帮助更多人。要发布吗？${tagStr}`;
    }

    case 'search_github_skills': {
      const query = String(args.query || '').trim();
      if (!query) return '请提供搜索关键词（描述你想要的技能能力，英文关键词通常效果更好）。';
      const { hits, warnings } = await searchGitHubSkillPackages({ keywordsLine: query, perPage: 10 });
      return formatSkillHitsForLobster(hits, warnings);
    }

    // ── 笔记工具 ──
    case 'save_note': {
      const title = String(args.title || '').trim();
      const content = String(args.content || '').trim();
      if (!title || !content) return '标题和内容不能为空。';
      const filename = await saveNote(userId, title, content);
      return `✅ 笔记「${title}」已保存（文件名：${filename}）`;
    }

    case 'update_memory': {
      const memContent = String(args.content || '').trim();
      if (!memContent) return '记忆内容不能为空。';
      await upsertMemory(userId, memContent);
      return '✅ 记忆已更新。';
    }

    case 'list_notes': {
      const notes = await listNotes(userId);
      if (!notes.length) return '你还没有保存任何笔记。';
      return notes.map((n, i) => `[${i + 1}] ${n.title}（${n.filename}）`).join('\n');
    }

    case 'read_note': {
      const filename = String(args.filename || '').trim();
      if (!filename) return '请提供文件名。';
      const content = readNote(userId, filename);
      if (!content) return `未找到笔记文件 ${filename}，请先用 list_notes 查看可用文件。`;
      return content;
    }

    // ── 定时任务工具 ──
    case 'create_reminder': {
      const description = String(args.description || '').trim();
      const cronExpr = String(args.cronExpr || '').trim();
      const task = String(args.task || '').trim();
      if (!description || !cronExpr || !task) return '缺少必要参数。';
      const schedule: LobsterSchedule = {
        id: uuidv4(),
        userId,
        cronExpr,
        description,
        task,
        createdAt: new Date().toISOString(),
        enabled: true,
      };
      await addSchedule(schedule);
      registerJob(schedule);
      return `✅ 定时任务已创建：${description}（${cronExpr}）\n任务内容：${task}`;
    }

    case 'list_reminders': {
      const schedules = getUserSchedules(userId);
      if (!schedules.length) return '你还没有设置任何定时任务。';
      return schedules
        .map((s, i) =>
          `[${i + 1}] ${s.description}（${s.cronExpr}）\n任务：${s.task}\n${s.lastRunAt ? `上次执行：${new Date(s.lastRunAt).toLocaleString('zh-CN')}` : '尚未执行'}`,
        )
        .join('\n---\n');
    }

    // ── 发布工具 ──────────────────────────────────────────────────────────────
    case 'publish_post': {
      const title = String(args.title || '').trim();
      const content = String(args.content || '').trim();
      const kind: 'article' | 'imageText' = args.kind === 'imageText' ? 'imageText' : 'article';
      const confirmed = args.confirmed === true;

      if (!title) return '❌ 发布失败：标题不能为空。';
      if (!content) return '❌ 发布失败：正文不能为空。';
      if (title.length > 120) return '❌ 发布失败：标题超过 120 字。';
      if (kind === 'imageText' && content.length > 1000) return '❌ 发布失败：图文正文不能超过 1000 字。';
      if (kind === 'article' && content.length > 20000) return '❌ 发布失败：文章正文不能超过 20000 字。';

      // 未经用户确认 → 返回预览，要求模型等待用户确认后再次调用
      if (!confirmed) {
        const preview = content.length > 300 ? content.slice(0, 300) + '……（正文已省略）' : content;
        return `📋 **发布预览**\n\n**标题：** ${title}\n\n**正文：**\n${preview}\n\n---\n⚠️ 尚未发布。请将以上内容展示给用户，在你的回复消息末尾必须加上 [[PUBLISH_CONFIRM]] 标记，等用户点击"同意发布"后再次调用 publish_post 并设置 confirmed=true；若用户点击"修改"则按需修改内容。`;
      }

      // 封面图：优先用用户本次对话发送的图片，无则自动生成文字卡片
      const id = uuidv4();
      const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

      let imgUrl: string;
      if (pendingImage) {
        const m = pendingImage.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
        if (!m) return '❌ 发布失败：图片格式无效。';
        const mime = m[1].toLowerCase();
        let ext = 'png';
        if (mime.includes('jpeg') || mime === 'jpg') ext = 'jpg';
        else if (mime === 'webp') ext = 'webp';
        else if (mime === 'gif') ext = 'gif';
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
          return '❌ 发布失败：图片超过 5MB 限制。';
        }
        const imgName = `${uuidv4()}.${ext}`;
        await writeFileAsync(join(uploadDir, imgName), buf);
        imgUrl = `/uploads/feed-posts/${id}/${imgName}`;
      } else {
        // 自动生成文字卡片封面
        try {
          const coverBuf = await generateCover(title, content);
          const imgName = `cover-${uuidv4().slice(0, 8)}.png`;
          await writeFileAsync(join(uploadDir, imgName), coverBuf);
          imgUrl = `/uploads/feed-posts/${id}/${imgName}`;
        } catch (e) {
          console.error('[publish_post] cover generation failed:', e);
          imgUrl = '';
        }
      }

      const evolutionPointIdRaw = String(args.evolutionPointId || '').trim();
      if (evolutionPointIdRaw && isEvolutionNetworkDisabled()) {
        return '❌ 进化网络已暂停，无法关联进化点发帖。';
      }
      if (evolutionPointIdRaw) {
        initEvolutionNetwork();
        const ep = getPoint(evolutionPointIdRaw);
        if (!ep) {
          return `❌ 发布失败：进化点 ${evolutionPointIdRaw} 不存在。`;
        }
        if (ep.status !== 'active') {
          return `❌ 发布失败：仅「进化中」的进化点可关联发帖，当前状态为 ${ep.status}。`;
        }
      }

      // 写入内存 + 持久化
      const record: FeedPostRecord = {
        id,
        authorId: userId,
        kind,
        title,
        content,
        imageUrls: imgUrl ? [imgUrl] : [],
        viewCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        publishedByAgent: true,
        ...(evolutionPointIdRaw ? { evolutionPointId: evolutionPointIdRaw } : {}),
      };
      getFeedPostsMap().set(id, record);
      saveFeedPosts();
      if (evolutionPointIdRaw) {
        touchActivityFromPublish(evolutionPointIdRaw);
      }

      // 异步生成 LLM 摘要，不阻塞响应
      generateFeedPostExcerpt({ title, content })
        .then((excerpt) => {
          const p = getFeedPostsMap().get(id);
          if (p) {
            p.excerpt = excerpt;
            saveFeedPosts();
          }
        })
        .catch(() => {});

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
              metadata: { postId: id, title },
            },
          });
        });
      } catch (e) {
        console.error('[publish_post] reward error:', e);
      }

      console.log(`[Lobster] publish_post: user=${userId} id=${id} kind=${kind} title="${title}"`);
      return `✅ 发布成功！获得 +5 积分奖励 🎉\n\n**${title}**\n\n链接：/posts/${id}`;
    }

    // ── 浏览器工具 ──────────────────────────────────────────────────────────────
    case 'browser_open': {
      const url = String(args.url || '').trim();
      if (!url) return 'URL 不能为空。';
      return await browserOpen(userId, url);
    }

    case 'browser_click': {
      const selector = String(args.selector || '').trim();
      if (!selector) return '选择器不能为空。';
      return await browserClick(userId, selector);
    }

    case 'browser_type': {
      const selector = String(args.selector || '').trim();
      const text = String(args.text || '');
      if (!selector) return '选择器不能为空。';
      return await browserType(userId, selector, text);
    }

    case 'browser_get_content':
      return await browserGetContent(userId);

    case 'browser_get_links':
      return await browserGetLinks(userId);

    case 'browser_screenshot': {
      const dataUrl = await browserScreenshot(userId);
      // 如果截图成功，把 data URL 注入到下一轮 LLM 消息里（用占位符标记）
      if (dataUrl.startsWith('data:image/')) {
        return `__SCREENSHOT__${dataUrl}__SCREENSHOT__\n（截图已捕获，正在分析画面内容…）`;
      }
      return dataUrl; // 错误消息
    }

  // ─── 文件柜 ──────────────────────────────────────────────────────────────────
  case 'list_files': {
    const files = listUserFiles(userId);
    if (!files.length) {
      return '你的文件柜还是空的。当 DarwinClaw 帮你生成 PPT、图片等文件时，它们会自动保存在这里。';
    }
    return (
      `📁 **你的文件柜**（共 ${files.length} 个文件）\n\n` +
      files
        .map(
          (f, i) =>
            `${i + 1}. ${fileTypeEmoji(f.type)} **${f.displayName}**\n` +
            `   大小：${formatFileSize(f.sizeBytes)} · 创建：${new Date(f.createdAt).toLocaleDateString('zh-CN')}\n` +
            `   下载：${process.env.SERVER_PUBLIC_URL || ''}${f.downloadPath}\n` +
            `   ID：\`${f.id}\``,
        )
        .join('\n\n')
    );
  }

  case 'delete_file': {
    const fileId = String(args.fileId || '').trim();
    if (!fileId) return '请提供要删除的文件 ID（先用 list_files 查询）。';
    const success = deleteUserFile(userId, fileId);
    if (!success) return `未找到文件 ${fileId}，请先用 list_files 查看正确的文件 ID。`;
    return `✅ 文件已删除。`;
  }

  // ─── 代码执行 ────────────────────────────────────────────────────────────────
  case 'run_code': {
    const language = String(args.language || 'python').toLowerCase();
    const code = String(args.code || '').trim();
    if (!code) return '代码不能为空。';
    const result = await executeCode(language, code);
    return formatExecutionResult(result);
  }

  case 'sandbox_write_file': {
    const rel = String(args.path || '').trim();
    const content = String(args.content ?? '');
    if (!rel) return 'path 不能为空。';
    const result = writeSandboxFile(userId, rel, content);
    if (!result.ok) return `❌ ${result.error}`;
    return `✅ 已写入沙箱文件：\`${result.relativePath}\`\n（工作区根目录即静态站根路径，入口一般为 index.html）`;
  }

  case 'sandbox_list_files': {
    const files = listSandboxFiles(userId);
    if (!files.length) {
      return '沙箱工作区暂无文件。可用 sandbox_write_file 写入 index.html 等。';
    }
    return `**沙箱文件**（共 ${files.length} 个）\n\n${files.map((f) => `- \`${f}\``).join('\n')}`;
  }

  case 'sandbox_start_preview': {
    const started = startSandboxPreview(userId);
    if (!started.ok) return `❌ ${started.error}`;
    const base = sandboxPreviewBaseUrl();
    const url = `${base}${started.previewPath}`;
    const portHint =
      base.includes('localhost') && !base.includes(':80')
        ? `\n\n【本地开发】请在本机先启动后端服务（默认监听 **3001**），再**完整复制**上方地址到浏览器打开；不要只输入「localhost」且无端口（会连到 80 端口导致无法连接）。`
        : '';
    return `✅ 预览已就绪（链接约 30 分钟内有效，请勿外传敏感内容）。\n\n在浏览器地址栏打开（请完整复制）：\n${url}${portHint}\n\n> 生产环境请配置 SERVER_PUBLIC_URL 为公网域名（如 https://clawlab.live）。`;
  }

  case 'sandbox_clear_workspace': {
    clearSandboxWorkspace(userId);
    return '✅ 已清空沙箱工作区，可重新写入文件。';
  }

  // ─── PPT 生成 ────────────────────────────────────────────────────────────────
  case 'create_ppt': {
    const pptTitle = String(args.title || '演示文稿').trim();
    const rawSlides = Array.isArray(args.slides) ? args.slides : [];
    if (!rawSlides.length) return 'slides 不能为空，请提供至少一页幻灯片内容。';
    const slides: SlideInput[] = rawSlides.map((s: unknown) => {
      const slide = s as Record<string, unknown>;
      return {
        title: String(slide.title || '').trim(),
        content: slide.content ? String(slide.content).trim() : undefined,
        notes: slide.notes ? String(slide.notes).trim() : undefined,
      };
    });
    try {
      const { downloadUrl, slideCount } = await generatePptx(slides, pptTitle, userId);
      return `✅ PPT 已生成！\n\n**《${pptTitle}》**\n- 共 ${slideCount} 页\n- 下载链接：${process.env.SERVER_PUBLIC_URL || ''}${downloadUrl}\n\n> 提示：下载后可在 Microsoft PowerPoint 或 WPS 中打开并进一步美化。`;
    } catch (e) {
      console.error('[Lobster] create_ppt error:', e);
      return `PPT 生成失败：${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ─── 图片生成 ────────────────────────────────────────────────────────────────
  case 'generate_image': {
    const prompt = String(args.prompt || '').trim();
    if (!prompt) return '图片描述不能为空。';
    const size = (args.size as '1024x1024' | '1792x1024' | '1024x1792') || '1024x1024';

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return '⚠️ 图片生成功能暂未启用（需配置 OPENAI_API_KEY）。';
    }

    try {
      const imgClient = new OpenAI({ apiKey: openaiKey });
      const response = await imgClient.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality: 'standard',
        response_format: 'url',
      });
      const url = response.data?.[0]?.url;
      if (!url) return '图片生成失败，未获取到图片 URL。';
      return `✅ 图片已生成！\n\n![生成的图片](${url})\n\n**提示**：图片链接有效期约 1 小时，请尽快保存。\n**描述**：${prompt}`;
    } catch (e) {
      console.error('[Lobster] generate_image error:', e);
      return `图片生成失败：${e instanceof Error ? e.message : String(e)}`;
    }
  }

    case 'list_evolution_points': {
      initEvolutionNetwork();
      const st = String(args.status || 'all');
      const list = listPoints(
        st === 'proposed' || st === 'active' || st === 'ended' || st === 'evolving'
          ? { status: st as 'proposed' | 'active' | 'ended' | 'evolving' }
          : undefined,
      );
      if (!list.length) return '当前没有符合条件的进化点。';
      return (
        `**进化网络**（共 ${list.length} 条）\n\n` +
        list
          .map((p) => {
            const pub = toPublicPoint(p);
            const label =
              pub.status === 'proposed' ? '提议中' : pub.status === 'active' ? '进化中' : '已结束';
            return `• **${pub.id}** 「${pub.title}」 [${label}] 加入 ${pub.joinCount} 人 · 关联作品 ${pub.articleCount}`;
          })
          .join('\n')
      );
    }

    case 'get_evolution_point': {
      initEvolutionNetwork();
      const pointId = String(args.pointId || '').trim();
      if (!pointId) return '请提供 pointId。';
      const p = getPoint(pointId);
      if (!p) return `未找到进化点 ${pointId}。`;
      const pub = toPublicPoint(p);
      const comments = getComments(pointId);
      const lines = comments
        .map((c) => `- ${c.authorAgentName}: ${c.body.slice(0, 80)}${c.body.length > 80 ? '…' : ''}`)
        .join('\n');
      return (
        `**${pub.title}** (${pub.id})\n` +
        `状态：${pub.status} · 发起：${pub.authorAgentName}\n` +
        `目标：${pub.goal}\n` +
        `待解决：${pub.problems.join('；')}\n` +
        `加入人数：${pub.joinCount}（不含发起者）\n` +
        (pub.endReason ? `结束方式：${pub.endReason}\n` : '') +
        `\n**留言**\n${lines || '（暂无）'}\n\n详情页：/evolution-network/point/${pointId}`
      );
    }

    case 'join_evolution_point': {
      initEvolutionNetwork();
      const pointId = String(args.pointId || '').trim();
      const message = String(args.message || '加入').trim() || '加入';
      if (!pointId) return '请提供 pointId。';
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return '用户不存在。';
      const result = addComment(pointId, userId, user.username, message);
      if (!result.ok) return `❌ ${result.error}`;
      const p = getPoint(pointId);
      const pub = p ? toPublicPoint(p) : null;
      return `✅ 已加入进化点 ${pointId}。当前加入 ${pub?.joinCount ?? 0} 人（不含发起者）。\n页面：/evolution-network/point/${pointId}`;
    }

    case 'create_evolution_point': {
      initEvolutionNetwork();
      const title = String(args.title || '').trim();
      const goal = String(args.goal || '').trim();
      const problems = Array.isArray(args.problems) ? (args.problems as unknown[]).map((x) => String(x)) : [];
      if (!title || !goal || !problems.length) return '请提供 title、goal 和至少一条 problems。';
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return '用户不存在。';
      const created = tryCreateOrJoinSimilarOpenPoint(userId, user.username, { title, goal, problems });
      if (!created.ok) return `❌ ${created.error}`;
      const pub = toPublicPoint(created.point);
      if (created.outcome === 'created') {
        return `✅ 已发起进化点 **${pub.title}**（${pub.id}），已进入「进化中」。其他 Agent 若兴趣一致可直接加入。\n链接：/evolution-network/point/${created.point.id}`;
      }
      if (created.outcome === 'joined_similar') {
        return `✅ 检测到与进行中议题相近，已自动加入 **${pub.title}**（${pub.id}）。\n链接：/evolution-network/point/${created.point.id}`;
      }
      if (created.outcome === 'already_participating') {
        return `✅ 你已在相近议题 **${pub.title}**（${pub.id}）中，无需重复发起。\n链接：/evolution-network/point/${created.point.id}`;
      }
      if (created.outcome === 'already_own_similar') {
        return `✅ 你已有一个相近的进行中议题 **${pub.title}**（${pub.id}），未重复创建。\n链接：/evolution-network/point/${created.point.id}`;
      }
      return `✅ ${pub.id}`;
    }

    case 'complete_evolution_point': {
      initEvolutionNetwork();
      const pointId = String(args.pointId || '').trim();
      if (!pointId) return '请提供 pointId。';
      const result = completePoint(pointId, userId);
      if (!result.ok) return `❌ ${result.error}`;
      return `✅ 已确认目标达成，进化点 ${pointId} 已结束。`;
    }

    case 'run_darwin_evolver_cycle': {
      const { runEvolverRound } = await import('../../services/darwin-evolver-service');
      const r = await runEvolverRound(userId);
      if (!r.ok) return `⚠️ ${r.reason}`;
      return `✅ 本轮进化器已执行，roundId=${r.roundId}。看板：/evolution-network/evolver`;
    }

    default: {
      // MCP 工具（名称以 mcp_ 开头）
      if (name.startsWith('mcp_')) {
        const servers = loadMcpServers().filter((s) => s.enabled);
        const serverId = name.split('_')[1];
        const server = servers.find((s) => s.id === serverId);
        if (!server) return `MCP 服务器 ${serverId} 未找到或已禁用。`;
        return await callMcpTool(server, name, args);
      }
      return `未知工具：${name}`;
    }
  }
}

// ─── LLM 客户端 ───────────────────────────────────────────────────────────────

/**
 * Darwin / VibeKids 等与虾米共用客户端时的 model id：统一为 config.platformLlmModel。
 * （请求体 model、LOBSTER_MODEL、平台模型列表等不再参与路由，避免与固定策略分叉。）
 */
function resolveModel(_requestModel?: string): string {
  return config.platformLlmModel;
}

/**
 * 获取用户可用的 LLM 客户端。
 *
 * 优先级（Master Key 严禁用于用户请求）：
 * 1. 用户平台虚拟 Key（通过积分兑换，存于数据库 user.litellmVirtualKey）
 * 2. 用户自带个人 Key（存于 LobsterInstance.personalApiKey）
 */
async function getLlmClient(
  model: string,
  userId: string,
): Promise<{ client: OpenAI; model: string; keySource: string } | null> {
  // 仅使用平台虚拟 Key（积分兑换）
  if (!isLitellmConfigured()) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { litellmVirtualKey: true },
    });
    if (user?.litellmVirtualKey) {
      const base = config.litellm.baseUrl.replace(/\/$/, '');
      return {
        client: new OpenAI({ apiKey: user.litellmVirtualKey, baseURL: `${base}/v1` }),
        model,
        keySource: 'platform-virtual-key',
      };
    }
  } catch (err) {
    console.error('[Lobster] Failed to fetch user virtual key:', err);
  }
  return null;
}

// SSE 写入辅助
function sseWrite(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 将文本以打字机效果分块发送
async function streamText(res: Response, text: string): Promise<void> {
  const CHUNK = 4; // 每次发送字符数
  const DELAY = 18; // 毫秒间隔，约 55fps
  for (let i = 0; i < text.length; i += CHUNK) {
    sseWrite(res, { type: 'delta', text: text.slice(i, i + CHUNK) });
    await new Promise((r) => setTimeout(r, DELAY));
  }
}

// ─── VibeKids：经 Darwin（LiteLLM 与用户虚拟 Key）生成单页 HTML；创作线索写入 vibekids_darwin_memory，不污染 Darwin 聊天正文 ───

/** 与 Next VIBEKIDS_GENERATE_DEADLINE_MS 一致（默认 300s，可调 10s～600s） */
function vibekidsLlmDeadlineMs(): number {
  const n = Number(process.env.VIBEKIDS_GENERATE_DEADLINE_MS);
  if (Number.isFinite(n) && n >= 10_000) {
    return Math.min(Math.floor(n), 600_000);
  }
  return 300_000;
}
const VIBEKIDS_MAX_OUTPUT_TOKENS = 8192;

const VIBEKIDS_SYSTEM_CREATE = `你是面向 6–15 岁学习者的「氛围编程」助手。用户会用中文描述想做的作品（游戏、故事、动画、小工具、页面等，题材不限）。

硬性要求：
1. 只输出一个完整的 HTML 文件源码，不要 Markdown，不要解释文字。
2. 使用内联 <style> 和 <script>，尽量不使用外部脚本；如必须，仅可使用可信 CDN（优先不用）。
3. 界面清晰、色彩友好、字体适中；在移动设备上基本可用（可加 viewport）。
4. 内容积极健康，适合未成年人；避免恐怖、暴力、成人内容；不要收集个人信息。
5. 尽量可交互（按钮、键盘、鼠标、简单动画等），让用户「马上能玩、能点」。
6. 单文件即可运行；中文界面优先。
7. 含 canvas、游戏主区域、#game 等可玩版面时：在桌面预览里应占满主体可视区；宽宜明显大于高（约 4:3～16:10），宽度倾向 min(92vw, 520px)～min(92vw, 640px)、高度约为宽的 72%～88%，避免过小的正方形（如 320×320）。
8. 创作室会在手机/内嵌 iframe 中预览：主可玩区/主面板须随可用区域放大，避免「body 仅 min-height:100vh + 中间一块写死 200～360px 卡片」导致大片空背景。建议 html,body{margin:0;height:100%;box-sizing:border-box}，根层 min-height:100%;display:flex;flex-direction:column;align-items:stretch，主容器 flex:1;min-height:0;width:100%。含 canvas 时用 clientWidth/clientHeight 设画布尺寸并监听 resize。
9. 优先「最小可玩 / 可用原型」，避免超长内联脚本、大段重复结构、海量逐帧数据；在合理范围内尽快完成输出。
10. 移动优先与触控：<head> 必须包含 viewport：content="width=device-width, initial-scale=1, viewport-fit=cover"（可与 maximum-scale=1 同写）。主内容 max-width:100%，避免整页横向滚动；可点击控件尽量 ≥44×44 CSS 像素。字号优先 rem、% 或 clamp()，少用整页写死 px。全屏布局可用 min-height:100dvh（可辅以 100vh 兜底），刘海区用 env(safe-area-inset-*)。在全局样式为 body 或 html 设置 overflow-x:hidden 与 touch-action:manipulation（游戏需拖移时可在具体区域覆盖）。
11. 代码质量：变量与函数命名清晰；避免未声明全局泄漏（可用 IIFE 包一层）；关键逻辑写简短中文注释；先保证无语法错误与明显运行时错误（空引用、死循环）；交互要有可见反馈（按钮 :active、成功/失败提示）。
12. 结构范式（建议模仿）：html,body{height:100%;margin:0} + 根 flex 柱布局；主区域用 #app 或 #game，flex:1;min-height:0；脚本放 </body> 前；状态用 const 对象 + 纯函数更新，避免魔法数字，复杂常量集中放在脚本顶部。
13. 若用户消息中含「DESIGN.md」章节（粘贴或预设），须优先落实其中的色板角色、字体层级、圆角、组件状态与布局原则，并与上述少儿友好、触控与 iframe 预览要求同时满足。`;

const VIBEKIDS_SYSTEM_REFINE = `你是面向 6–15 岁学习者的「氛围编程」编辑助手。你会收到一份已存在的单文件 HTML 源码，以及用户的修改说明。

硬性要求：
1. 只输出修改后的完整 HTML 文件源码，不要 Markdown，不要解释文字。
2. 在满足修改说明的前提下，尽量保留未提及部分的布局、文案与逻辑；改动要克制、可预期。
3. 若用户提供了「不要改动」的说明，这些部分必须保持不变（除非修改说明明确要求动到它们）。
4. 仍使用内联 <style> 与 <script>，安全、健康、适合未成年人。
5. 单文件即可运行。
6. 若涉及游戏板 / canvas 尺寸：用户要求「拉大、拉长、更宽」时，同步按比例调整绘制坐标、网格或碰撞范围，避免只改 CSS 导致逻辑错位。
7. 若页面在内嵌预览中显得过小、周围大量留白：改为弹性布局让主区域铺满（见创作系统提示第 8 条），canvas/坐标随容器尺寸更新。
8. 修改尽量聚焦，避免无关的大段重写；在合理范围内尽快输出完整 HTML。
9. 保持或补全移动端体验：viewport 须含 width=device-width、initial-scale=1、viewport-fit=cover；避免横向溢出；触控目标足够大；必要时补 overflow-x:hidden、touch-action:manipulation、safe-area（env）与 rem/clamp 字号（与创作系统提示第 10 条一致）。
10. 修改时保持代码整洁：无语法错误；新增逻辑与现有风格一致；仍遵守创作系统提示第 11～12 条（注释、结构范式、IIFE/作用域）。
11. 若用户消息中含「DESIGN.md」章节，修改后的页面须与该设计系统一致（色板、字体、圆角、组件气质）；未要求改视觉时保持原有实现，若与 DESIGN.md 冲突则以修改说明为准。`;

const VIBEKIDS_BRAINSTORM_SYSTEM = `你是少儿「氛围编程」创作教练，帮用户在同一主题下想出多个可落地的单页 HTML 切入点。

只输出一个 JSON 对象，不要 Markdown，不要解释。格式严格为：
{"directions":["...","...","..."]}

要求：
- directions 恰好 3 条字符串，中文；
- 每条 25～72 字，是「补充描述」而非标题，可被用户贴进创作描述里；
- 三条要明显不同（例如：玩法变体、视觉风格、难度/教学目标、交互细节之一）；
- 积极健康，适合 6～15 岁；不要要求联网或收集隐私；
- 响应须简短、可快速生成完毕。`;

type VkAge = 'primary' | 'middle' | 'unified';
type VkKind = 'any' | 'game' | 'tool' | 'story' | 'showcase';
type VkStyle = 'cute' | 'scifi' | 'minimal' | 'pixel' | 'pastel';

const VK_KINDS: { id: VkKind; label: string; hint: string }[] = [
  { id: 'any', label: '不限', hint: '由模型自由发挥' },
  { id: 'game', label: '小游戏', hint: '有规则、得分、操作' },
  { id: 'tool', label: '小工具', hint: '换算、计时、记录等' },
  { id: 'story', label: '互动故事', hint: '分段、选择、叙事' },
  { id: 'showcase', label: '展示页', hint: '介绍、贺卡、作品集' },
];

const VK_STYLES: { id: VkStyle; label: string }[] = [
  { id: 'cute', label: '可爱' },
  { id: 'scifi', label: '科幻' },
  { id: 'minimal', label: '极简' },
  { id: 'pixel', label: '像素风' },
  { id: 'pastel', label: '马卡龙' },
];

function vkParseAge(raw: unknown): VkAge {
  if (raw === 'middle') return 'middle';
  if (raw === 'primary') return 'primary';
  if (raw === 'unified') return 'unified';
  return 'unified';
}

function vkParseKind(raw: unknown): VkKind {
  const k = typeof raw === 'string' ? raw : 'any';
  return ['any', 'game', 'tool', 'story', 'showcase'].includes(k) ? (k as VkKind) : 'any';
}

function vkParseStyles(raw: unknown): VkStyle[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(['cute', 'scifi', 'minimal', 'pixel', 'pastel']);
  return raw.filter((x): x is VkStyle => typeof x === 'string' && allowed.has(x));
}

function vkFormatCreativeContext(kind: VkKind, styles: VkStyle[]): string {
  const k = VK_KINDS.find((x) => x.id === kind);
  const kindLine =
    kind === 'any' ? '' : `【形态】${k?.label ?? kind}（${k?.hint ?? ''}）`;
  const styleLabels = styles
    .map((s) => VK_STYLES.find((v) => v.id === s)?.label ?? s)
    .filter(Boolean);
  const styleLine = styleLabels.length === 0 ? '' : `【风格】${styleLabels.join('、')}`;
  return [kindLine, styleLine].filter(Boolean).join('\n');
}

function vkAgeHint(age: VkAge): string {
  if (age === 'unified') {
    return (
      '用户可能是中小学生：界面按钮与可点区域要够大、说明简洁、反馈即时；' +
      '若描述很短可优先「最小可玩原型」；' +
      '若用户写得很细（规则、界面、交互），请认真按说明实现，整体仍要一目了然、适合未成年人。'
    );
  }
  return age === 'primary'
    ? '用户是小学生：句子短、按钮大、说明少、反馈即时。'
    : '用户是初中生：可以稍复杂一点的逻辑与文案，但仍要一目了然。';
}

function extractVibekidsHtml(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return t;
}

function parseVibekidsDirectionsJson(raw: string): string[] {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : t).trim();
  try {
    const o = JSON.parse(body) as { directions?: unknown };
    if (!Array.isArray(o.directions)) return [];
    return o.directions
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 4)
      .map((x) => x.trim().slice(0, 140))
      .slice(0, 3);
  } catch {
    return [];
  }
}

const VIBEKIDS_CHIPS_SYSTEM = `你是少儿「氛围编程」创作助手。根据用户画像、学段、作品形态与风格，生成 3 条「灵感提示」短句，供用户一键填入描述。

只输出一个 JSON 对象，不要 Markdown，不要解释。格式严格为：
{"chips":["...","...","..."]}

要求：
- chips 恰好 3 条字符串，中文；
- 每条 6～24 字，像可点按钮的短提示（小游戏、小工具、互动页、贺卡、画板等均可），不要句号结尾；
- 3 条须明显不同；积极健康，适合 6～15 岁；不要联网、不要收集隐私；
- 若用户消息里含有【上一批勿重复】下列出的短句，新 3 条不得与其中任一条相同或仅改一两个字的同义重复；
- 输出须简短，便于快速生成。`;

function parseVibekidsChipsJson(raw: string): string[] {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : t).trim();
  try {
    const o = JSON.parse(body) as { chips?: unknown };
    if (!Array.isArray(o.chips)) return [];
    return o.chips
      .filter((x): x is string => typeof x === 'string' && x.trim().length >= 4)
      .map((x) => x.trim().replace(/\s+/g, ' ').slice(0, 32))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function formatVibekidsUserProfileBlock(user: {
  username: string;
  bio: string | null;
  darwinOnboarding: unknown;
}): string {
  const parts: string[] = [];
  parts.push(`【昵称】${user.username}`);
  if (user.bio?.trim()) {
    parts.push(`【简介】${user.bio.trim().slice(0, 240)}`);
  }
  if (user.darwinOnboarding != null) {
    try {
      const raw =
        typeof user.darwinOnboarding === 'string' ?
          user.darwinOnboarding
        : JSON.stringify(user.darwinOnboarding);
      const s = raw.replace(/\s+/g, ' ').trim().slice(0, 1400);
      if (s.length > 2) {
        parts.push(`【Darwin 问卷/画像（JSON 摘要，供偏好推断）】\n${s}`);
      }
    } catch {
      /* ignore */
    }
  }
  return parts.join('\n\n');
}

// ─── 路由 ─────────────────────────────────────────────────────────────────────

export function lobsterRoutes(): Router {
  const router = Router();

  /** GET /api/lobster/me */
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.json({ applied: false });
    const conv = getLobsterConversation(userId);
    return res.json({
      applied: true,
      instance,
      historyCount: conv.messages.length,
      dailyChat: getDarwinDailyChatStats(userId),
    });
  });

  /** POST /api/lobster/apply */
  router.post('/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { name, onboarding } = req.body as { name?: string; onboarding?: unknown };
    try {
      const alreadyApplied = getLobsterInstance(userId);
      if (!alreadyApplied && onboarding !== undefined && onboarding !== null) {
        const parsed = validateDarwinOnboarding(onboarding);
        if (!parsed.ok) {
          return res.status(400).json({ error: parsed.error });
        }
        await prisma.user.update({
          where: { id: userId },
          data: { darwinOnboarding: parsed.value as unknown as Prisma.InputJsonValue },
        });
      }

      const resolvedName =
        typeof name === 'string' && name.trim().length > 0 ?
          name.trim()
        : defaultDarwinDisplayName();
      const instance = await applyLobster(userId, resolvedName);
      // 幂等：内部若已有 darwin_bootstrap 进化点则跳过；避免首次 bootstrap 失败后无法重试（第二次 apply 非新用户）
      {
        const { onDarwinClawFirstApply } = await import('../../services/evolution-network-service');
        void onDarwinClawFirstApply(userId).catch((e) => console.error('[Evolution] bootstrap:', e));
      }
      console.log(`[Lobster] User ${userId} applied (name="${instance.name ?? 'DarwinClaw'}"). Total: ${getAllInstances().length}`);
      return res.json({ success: true, instance });
    } catch (err) {
      console.error('[Lobster] Apply error:', err);
      return res.status(500).json({ error: '申请失败，请稍后重试' });
    }
  });

  /** PATCH /api/lobster/name */
  router.patch('/name', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { name } = req.body as { name?: string };
    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'name 必须是字符串' });
    }
    const trimmed = name.trim();
    if (trimmed.length > 20) {
      return res.status(400).json({ error: '名字最长 20 个字' });
    }
    try {
      const instance = await renameLobster(userId, trimmed);
      return res.json({ success: true, instance });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  /** GET /api/lobster/history */
  router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请 DarwinClaw' });
    const conv = getLobsterConversation(userId);
    return res.json({ messages: conv.messages });
  });

  /**
   * POST /api/lobster/chat
   * SSE 流式响应：
   *   { type: 'status', text: '...' }  — 工具调用状态
   *   { type: 'delta',  text: '...' }  — 最终回复文字流
   *   { type: 'done',   id:  '...' }   — 完成
   *   { type: 'error',  message:'...'} — 错误
   */
  router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { message, model: requestModel, image, pageContext, pageUrl } = req.body as {
      message?: string;
      model?: string;
      image?: string;       // base64 data URL 或公开图片 URL（多模态）
      pageContext?: string; // 当前页面 DOM 文本（由悬浮 Widget 抓取）
      pageUrl?: string;     // 当前页面路径
    };

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: '消息过长（最多 2000 字）' });
    }

    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请 DarwinClaw' });
  
    const resolvedModel = resolveModel(requestModel);
    const llm = await getLlmClient(resolvedModel, userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message: 'DarwinClaw 需要 API Key 才能运行。请使用积分兑换平台虚拟 Key，或在设置中填入自己的 Key。',
      });
    }
    console.log(`[Lobster] user=${userId} model=${llm.model} keySource=${llm.keySource} image=${!!image}`);

    // 保存用户消息
    const userMsg = {
      id: uuidv4(),
      role: 'user' as const,
      content: image ? `[图片] ${message.trim()}` : message.trim(),
      timestamp: new Date().toISOString(),
    };
    try {
      await appendLobsterMessage(userId, userMsg);
    } catch (e) {
      if (e instanceof DarwinDailyLimitExceededError) {
        return res.status(429).json({
          error: 'DAILY_LIMIT',
          message: (e as DarwinDailyLimitExceededError).message,
          limit: (e as DarwinDailyLimitExceededError).limit,
          used: (e as DarwinDailyLimitExceededError).used,
        });
      }
      throw e;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const conv = getLobsterConversation(userId);

    try {
      const compacted = await runCompactionIfNeeded(conv, llm.client, llm.model);
      if (compacted) {
        await saveLobsterConversation(conv);
      }
    } catch (e) {
      console.error('[Lobster] context compact:', e);
    }

    // 构建用户消息内容（支持多模态）
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: message.trim() },
    ];
    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image, detail: 'auto' },
      });
    }

    // 读取永久记忆，注入到系统提示
    const memoryContent = readMemory(userId);
    // 官方技能对所有用户默认开放，无需安装
    const officialSkillsAll = loadOfficialSkills();
    // 用户额外安装的自定义技能
    const installedSkills = getUserInstalledSkills(userId);
    // 用户给 DarwinClaw 起的名字（如有）
    const lobsterName = instance.name?.trim() || 'DarwinClaw';
    let systemContent = lobsterName !== 'DarwinClaw'
      ? LOBSTER_SYSTEM_PROMPT.replace(/你是"DarwinClaw"/, `你是"${lobsterName}"（昵称，本质上你是 DarwinClaw）`)
      : LOBSTER_SYSTEM_PROMPT;
    if (memoryContent) {
      systemContent += `\n\n---\n[用户记忆]\n${memoryContent}`;
    }
    // 注入页面上下文（来自悬浮 Widget）
    if (pageContext && pageContext.trim()) {
      const safeUrl = pageUrl ? ` (${pageUrl})` : '';
      systemContent += `\n\n---\n[当前页面上下文${safeUrl}]\n用户正在浏览以下页面，请结合此内容理解用户问题：\n${pageContext.slice(0, 3000)}`;
    }
    // 注入官方技能索引（标题 + 描述摘要，节省 tokens）
    if (officialSkillsAll.length > 0) {
      const officialIndex = officialSkillsAll
        .map((s) => `- **${s.title}**: ${s.skillMarkdown.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 120) ?? s.skillMarkdown.slice(0, 120)}`)
        .join('\n');
      systemContent += `\n\n---\n[平台官方技能索引 — 你默认拥有以下全部能力，可直接使用]\n${officialIndex}`;
    }
    // 用户自安装技能注入完整内容（安装数量少，价值高）
    if (installedSkills.length > 0) {
      const skillsBlock = installedSkills
        .map((s) => `### ${s.title}\n${s.skillMarkdown}`)
        .join('\n\n---\n\n');
      systemContent += `\n\n---\n[用户自定义技能 — 你还拥有以下额外安装的技能]\n\n${skillsBlock}`;
    }

    // 今日推荐注入
    const recommendBlock = await buildRecommendationBlock(userId);
    if (recommendBlock) {
      systemContent += recommendBlock;
      // 首条消息时（全新对话），主动提示推荐
      const historyLen = conv.messages.length;
      if (historyLen <= 1) {
        systemContent += `\n\n[系统提示：这是本次对话的第一条消息。如果用户是打招呼或闲聊，请在回复中自然地提及一篇上方推荐内容，不要等用户主动询问。]`;
      }
    }

    // 技能进化建议注入（Curator 检测到的技能缺口）
    const lobsterInst = getLobsterInstance(userId);
    if (lobsterInst?.pendingSkillSuggestion) {
      const skillName = lobsterInst.pendingSkillSuggestion;
      systemContent += `\n\n[系统提示：你发现平台热帖中有一个你尚未深入掌握的技能「${skillName}」。请在对话开始时（若用户在打招呼或闲聊）自然地告知用户，询问他们是否希望你现在学习这个技能。格式示例："我最近发现平台上「${skillName}」很热门，这个技能我还可以更深入学习，要不要让我现在研究一下？"]`;
      // 展示一次后清除，避免重复提示
      void setPendingSkillSuggestion(userId, undefined);
    }

    // 双模型路由：从 LiteLLM 实际可用模型中自动选择
    const routedModel = await routeModel(message, llm.model);
    // 动态 max_tokens
    const dynamicMaxTokens = calcMaxTokens(message);

    // Auto-Compact：早期轮次合并为摘要 + 最近 8 条原文（见 lobster-context-compact.ts）
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = buildChatMessagesWithCompact(
      conv,
      systemContent,
      userContent,
      Boolean(image),
    );

    // 加载 MCP 工具并合并
    const mcpTools = await loadAllMcpTools();
    const allTools = [...BASE_TOOLS, ...EVOLUTION_TOOLS, ...mcpToolsToOpenAI(mcpTools)];

    let finalText = '';
    let toolsSupported = true;

    try {
      // ── ReAct 循环 ──────────────────────────────────────────────────────
      for (let step = 0; step < MAX_REACT_STEPS; step++) {
        let response: OpenAI.Chat.Completions.ChatCompletion;
        try {
          response = await llm.client.chat.completions.create({
            model: routedModel,
            messages,
            tools: toolsSupported ? allTools : undefined,
            tool_choice: toolsSupported ? ('auto' as const) : undefined,
            max_tokens: step === 0 ? dynamicMaxTokens : calcMaxTokens(message, true),
            temperature: 0.7,
          });
        } catch (toolErr) {
          const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          const isInvalidModelId = toolErrMsg.includes('is not a valid model ID') ||
            (toolErrMsg.includes('400') && toolErrMsg.includes('model ID'));

          if (isInvalidModelId && routedModel !== llm.model) {
            // 模型 ID 在 OpenRouter 上不存在，加入黑名单，本次降级到基础模型
            _badModels.add(routedModel);
            console.warn(`[Lobster] Model "${routedModel}" is invalid on OpenRouter — blacklisted, retrying with base model "${llm.model}"`);
            response = await llm.client.chat.completions.create({
              model: llm.model,
              messages,
              max_tokens: step === 0 ? dynamicMaxTokens : calcMaxTokens(message, true),
              temperature: 0.7,
            });
          } else {
            toolsSupported = false;
            console.warn('[Lobster] Tool calling failed, falling back to plain chat:', toolErr);
            response = await llm.client.chat.completions.create({
              model: routedModel,
              messages,
              max_tokens: step === 0 ? dynamicMaxTokens : calcMaxTokens(message, true),
              temperature: 0.7,
            });
          }
        }

        const choice = response.choices[0];
        const toolCalls = choice.message.tool_calls;

        // 没有工具调用 → 直接拿到最终回复
        if (!toolCalls || toolCalls.length === 0) {
          finalText = choice.message.content?.trim() || '（DarwinClaw 没有生成回复，请重试）';
          break;
        }

        // 有工具调用 → 执行工具，继续循环
        messages.push({
          role: 'assistant',
          content: choice.message.content ?? null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tc = toolCall as any as { id: string; type: 'function'; function: { name: string; arguments: string } };
          const toolName = tc.function.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(tc.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          const statusFn = TOOL_STATUS[toolName];
          sseWrite(res, {
            type: 'status',
            text: statusFn ? statusFn(toolArgs, userId) : `正在调用 ${toolName}...`,
          });

          const result = await executeTool(toolName, toolArgs, userId, image || undefined);

          // 截图工具：把图片注入为下一轮用户视角的 image_url 消息
          const SCREENSHOT_RE = /^__SCREENSHOT__(data:image\/[^_]+)__SCREENSHOT__/;
          const screenshotMatch = result.match(SCREENSHOT_RE);
          if (screenshotMatch) {
            const imageDataUrl = screenshotMatch[1];
            const textPart = result.replace(SCREENSHOT_RE, '').trim();
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: textPart || '截图已完成。' });
            // 注入截图作为 user 消息供视觉模型分析
            messages.push({
              role: 'user',
              content: [
                { type: 'text', text: '请分析截图中的页面内容：' },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: 'auto' } },
              ] as OpenAI.Chat.Completions.ChatCompletionContentPart[],
            });
          } else {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }

        // 如果已经是最后一步还有工具调用，强制让模型给出最终回复
        if (step === MAX_REACT_STEPS - 1) {
          const finalResp = await llm.client.chat.completions.create({
            model: llm.model,
            messages: [
              ...messages,
              { role: 'user', content: '请根据以上工具执行结果，用自然语言给用户一个完整的总结回复。' },
            ],
            max_tokens: 800,
            temperature: 0.7,
          });
          finalText = finalResp.choices[0]?.message?.content?.trim() || '';
          // 如果仍为空，再降级做一次不带工具历史的兜底
          if (!finalText) {
            const fallbackResp = await llm.client.chat.completions.create({
              model: llm.model,
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: message },
              ],
              max_tokens: 400,
              temperature: 0.7,
            });
            finalText = fallbackResp.choices[0]?.message?.content?.trim() || '（DarwinClaw 处理超时，请重新提问）';
          }
        }
      }

      // ── 流式发送最终文本 ─────────────────────────────────────────────────
      await streamText(res, finalText);

      // 保存助手消息
      const assistantMsg = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: finalText,
        timestamp: new Date().toISOString(),
      };
      await appendLobsterMessage(userId, assistantMsg);

      sseWrite(res, { type: 'done', id: assistantMsg.id });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Lobster Chat] error:', errMsg);
      // 把具体错误原因透传给前端，方便调试
      const userMsg2 =
        errMsg.includes('API key') || errMsg.includes('401') || errMsg.includes('authentication')
          ? 'LLM API Key 无效或未配置，请联系管理员'
          : errMsg.includes('model') || errMsg.includes('404')
            ? `模型不存在或不支持：${errMsg.slice(0, 120)}`
            : errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')
              ? 'AI 响应超时，请稍后重试'
              : `AI 服务暂时不可用：${errMsg.slice(0, 120)}`;
      sseWrite(res, { type: 'error', message: userMsg2 });
    }

    res.end();
  });

  /** DELETE /api/lobster/history */
  router.delete('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请 DarwinClaw' });
    await clearLobsterConversation(userId);
    // 同步关闭该用户的浏览器会话
    closeBrowserSession(userId).catch(() => {});
    return res.json({ success: true });
  });

  // ─── 语音转录 ───────────────────────────────────────────────────────────────

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  /** POST /api/lobster/transcribe — 语音转文字（Whisper） */
  router.post('/transcribe', authenticateToken, upload.single('audio'), async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: '请上传音频文件' });
    const userId = req.user!.id;
    const llm = await getLlmClient(resolveModel(), userId);
    if (!llm) return res.status(503).json({ error: '语音服务未配置' });
    try {
      const { toFile } = await import('openai');
      const audioFile = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', {
        type: req.file.mimetype,
      });
      const result = await llm.client.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: 'zh',
      });
      return res.json({ text: result.text });
    } catch (err) {
      console.error('[Lobster] Transcribe error:', err);
      return res.status(500).json({ error: '语音识别失败，请稍后重试' });
    }
  });

  // ─── 笔记管理 ───────────────────────────────────────────────────────────────

  /** GET /api/lobster/notes */
  router.get('/notes', authenticateToken, async (req: AuthRequest, res: Response) => {
    const notes = await listNotes(req.user!.id);
    return res.json({ notes });
  });

  /** GET /api/lobster/notes/:filename */
  router.get('/notes/:filename', authenticateToken, (req: AuthRequest, res: Response) => {
    const content = readNote(req.user!.id, req.params.filename);
    if (!content) return res.status(404).json({ error: '笔记不存在' });
    return res.json({ content });
  });

  // ─── 定时任务管理 ────────────────────────────────────────────────────────────

  /** GET /api/lobster/schedules */
  router.get('/schedules', authenticateToken, (req: AuthRequest, res: Response) => {
    return res.json({ schedules: getUserSchedules(req.user!.id) });
  });

  /** DELETE /api/lobster/schedules/:id */
  router.delete('/schedules/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const removed = await removeSchedule(req.params.id, req.user!.id);
    if (removed) unregisterJob(req.params.id);
    return res.json({ success: removed });
  });

  // ─── MCP 服务器管理 ──────────────────────────────────────────────────────────

  /** GET /api/lobster/mcp-servers */
  router.get('/mcp-servers', authenticateToken, (_req: Request, res: Response) => {
    return res.json({ servers: loadMcpServers() });
  });

  /** POST /api/lobster/mcp-servers */
  router.post('/mcp-servers', authenticateToken, async (req: Request, res: Response) => {
    const { servers } = req.body as { servers?: McpServerConfig[] };
    if (!Array.isArray(servers)) return res.status(400).json({ error: 'servers 必须是数组' });
    await saveMcpServers(servers);
    return res.json({ success: true, servers });
  });

  /**
   * GET /api/lobster/key-status
   * 返回当前用户的平台虚拟 Key 状态。
   */
  router.get('/key-status', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { litellmVirtualKey: true, clawPoints: true },
      });
      return res.json({
        hasPlatformKey: Boolean(user?.litellmVirtualKey) && isLitellmConfigured(),
        clawPoints: user?.clawPoints ?? 0,
        litellmConfigured: isLitellmConfigured(),
      });
    } catch (err) {
      console.error('[Lobster] key-status error', err);
      return res.status(500).json({ error: 'Failed to get key status' });
    }
  });

  /** GET /api/lobster/files — 列出用户文件柜 */
  router.get('/files', authenticateToken, (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const files = listUserFiles(userId);
    return res.json({ files });
  });

  /** DELETE /api/lobster/files/:fileId — 删除文件 */
  router.delete('/files/:fileId', authenticateToken, (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { fileId } = req.params;
    const ok = deleteUserFile(userId, fileId);
    if (!ok) return res.status(404).json({ error: '文件不存在' });
    return res.json({ success: true });
  });

  /**
   * GET /api/lobster/files/:userId/:filename — 下载文件
   * 公开端点（链接即可下载），通过随机文件名保护隐私
   */
  router.get('/files/:userId/:filename', (req, res: Response) => {
    const { getUserFilePath } = require('../../services/lobster-user-files');
    const { userId, filename } = req.params;
    const filePath = getUserFilePath(userId, filename);
    if (!filePath) return res.status(404).json({ error: '文件不存在' });
    return res.download(filePath, filename);
  });

  /**
   * POST /api/lobster/vibekids-generate
   * VibeKids 创作室：与 Darwin 使用同一套 LiteLLM + 平台虚拟 Key；近期线索写入 vibekids_darwin_memory，不写入 Darwin 聊天正文。
   * Body 与 Next /api/vibekids/generate 对齐：intent create|refine、prompt、ageBand、kind、styles、currentHtml、refinementPrompt、lockHint、model（可选）
   */
  router.post('/vibekids-generate', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) {
      return res.status(403).json({
        error: 'darwin_required',
        detail: '请先申请 DarwinClaw（Darwin）后再使用 AI 生成；也可退出登录后使用演示模式。',
      });
    }

    const b = req.body as {
      intent?: unknown;
      prompt?: unknown;
      ageBand?: unknown;
      kind?: unknown;
      styles?: unknown;
      currentHtml?: unknown;
      refinementPrompt?: unknown;
      lockHint?: unknown;
      model?: unknown;
      /** DESIGN.md 预设 id（与前端 VIBEKIDS_DESIGN_PRESETS 对齐） */
      designPreset?: unknown;
      /** 用户粘贴的完整或节选 DESIGN.md，优先于预设 */
      designMd?: unknown;
    };
    const intent = b.intent === 'refine' ? 'refine' : 'create';
    const ageBand = vkParseAge(b.ageBand);
    const kind = vkParseKind(b.kind);
    const styles = vkParseStyles(b.styles);
    const requestModel = typeof b.model === 'string' ? b.model : undefined;

    const llm = await getLlmClient(resolveModel(requestModel), userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message:
          'Darwin 需要平台虚拟 Key 才能调用模型。请先在积分兑换中申请 Key，或与 /my-lobster 对话使用相同配置。',
      });
    }

    const memoryBlock = await formatVibekidsDarwinMemoryBlock(userId).catch(() => '');
    const designBlock = vkFormatDesignMdBlock(b.designPreset, b.designMd);

    type VibekidsTokenUsageJson = {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };

    const runCompletion = async (
      system: string,
      userText: string,
      opts?: { temperature?: number },
    ): Promise<{ html: string; tokenUsage?: VibekidsTokenUsageJson }> => {
      const deadline = Date.now() + vibekidsLlmDeadlineMs();
      const temperature = opts?.temperature ?? 0.48;
      const runOnce = async (modelId: string) => {
        const ms = Math.max(1_000, deadline - Date.now());
        return llm.client.chat.completions.create(
          {
            model: modelId,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userText },
            ],
            max_tokens: VIBEKIDS_MAX_OUTPUT_TOKENS,
            temperature,
          },
          { signal: AbortSignal.timeout(ms) },
        );
      };
      const tryModels = await buildVibekidsModelTryOrder(llm.model);
      const maxTries = Math.min(14, tryModels.length);
      let response: OpenAI.Chat.Completions.ChatCompletion | undefined;
      let lastErr: unknown;
      for (let i = 0; i < maxTries; i++) {
        const modelId = tryModels[i];
        if (deadline - Date.now() < 800) break;
        try {
          response = await runOnce(modelId);
          if (i > 0) {
            console.log(`[Lobster] vibekids code: succeeded with fallback model → ${modelId}`);
          }
          break;
        } catch (toolErr) {
          lastErr = toolErr;
          const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          if (isLiteLlmBudgetExceededError(toolErrMsg)) throw toolErr;
          const infra = isVibekidsModelInfraError(toolErrMsg);
          if (infra && i < maxTries - 1) {
            console.warn(
              `[Lobster] vibekids code: skip model "${modelId}" (${i + 1}/${maxTries}): ${toolErrMsg.slice(0, 220)}`,
            );
            continue;
          }
          throw toolErr;
        }
      }
      if (!response) {
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      }
      const text = response.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('模型未返回内容');
      const out = extractVibekidsHtml(text);
      if (!out.trim()) throw new Error('模型返回的 HTML 为空，请重试或简化描述');
      const u = response.usage;
      let tokenUsage: VibekidsTokenUsageJson | undefined;
      if (u && typeof u.prompt_tokens === 'number') {
        const pt = u.prompt_tokens;
        const ct = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;
        const tt =
          typeof u.total_tokens === 'number' ? u.total_tokens : pt + ct;
        tokenUsage = { promptTokens: pt, completionTokens: ct, totalTokens: tt };
      }
      return { html: out, tokenUsage };
    };

    try {
      if (intent === 'refine') {
        const currentHtml =
          typeof b.currentHtml === 'string' ? b.currentHtml.trim() : '';
        const refinement =
          typeof b.refinementPrompt === 'string' ? b.refinementPrompt.trim() : '';
        const lockHint =
          typeof b.lockHint === 'string' ? b.lockHint.trim() : undefined;
        if (!currentHtml) {
          return res.status(400).json({ error: 'empty_html' });
        }
        if (!refinement) {
          return res.status(400).json({ error: 'empty_refinement' });
        }
        const lock =
          lockHint ? `\n\n【请尽量保持不动的部分】\n${lockHint}` : '';
        const userBlock = `${memoryBlock ? `${memoryBlock}\n\n` : ''}${vkAgeHint(ageBand)}${
          designBlock.trim() ? `${designBlock}\n\n` : ''
        }

以下是当前完整 HTML 源码：

\`\`\`html
${currentHtml}
\`\`\`

【修改要求】
${refinement}
${lock}

请输出修改后的完整 HTML 文件源码。`;
        const { html, tokenUsage } = await runCompletion(VIBEKIDS_SYSTEM_REFINE, userBlock, {
          temperature: 0.48,
        });
        void appendVibekidsDarwinMemory(userId, {
          intent: 'refine',
          snippet: refinement,
        }).catch((err) => console.warn('[vibekids-darwin-memory] refine', err));
        return res.json({
          html,
          mode: 'ai' as const,
          ...(tokenUsage ? { tokenUsage } : {}),
        });
      }

      const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
      if (!prompt) {
        return res.status(400).json({ error: 'empty_prompt' });
      }
      const ctx = vkFormatCreativeContext(kind, styles);
      const userBlock = [
        memoryBlock || null,
        vkAgeHint(ageBand),
        designBlock.trim() ? designBlock : null,
        ctx ? ctx : null,
        `用户想法：\n${prompt}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const { html, tokenUsage } = await runCompletion(VIBEKIDS_SYSTEM_CREATE, userBlock, {
        temperature: 0.42,
      });
      void appendVibekidsDarwinMemory(userId, {
        intent: 'create',
        snippet: prompt,
        kind: kind === 'any' ? undefined : kind,
      }).catch((err) => console.warn('[vibekids-darwin-memory] create', err));
      return res.json({
        html,
        mode: 'ai' as const,
        ...(tokenUsage ? { tokenUsage } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Lobster vibekids-generate]', e);
      if (respondLitellmBudgetExceededIfNeeded(res, e)) return;
      return res.status(500).json({
        error: 'llm_failed',
        detail: msg.length > 500 ? `${msg.slice(0, 500)}…` : msg,
      });
    }
  });

  /**
   * POST /api/lobster/vibekids-brainstorm
   * 基于 Darwin + 用户近期创作记忆，返回 3 条可合并进描述的创作方向（JSON，非 HTML）。
   */
  router.post('/vibekids-brainstorm', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) {
      return res.status(403).json({
        error: 'darwin_required',
        detail: '请先接入 Darwin 后再使用拓展方案。',
      });
    }

    const b = req.body as {
      prompt?: unknown;
      ageBand?: unknown;
      kind?: unknown;
      styles?: unknown;
      model?: unknown;
    };
    const ageBand = vkParseAge(b.ageBand);
    const kind = vkParseKind(b.kind);
    const styles = vkParseStyles(b.styles);
    const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
    const requestModel = typeof b.model === 'string' ? b.model : undefined;

    const llm = await getLlmClient(resolveModel(requestModel), userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message:
          'Darwin 需要平台虚拟 Key 才能调用模型。请先在积分兑换中申请 Key，或与 /my-lobster 对话使用相同配置。',
      });
    }

    try {
      const deadline = Date.now() + vibekidsLlmDeadlineMs();
      const memoryBlock = await formatVibekidsDarwinMemoryBlock(userId).catch(() => '');
      const ctx = vkFormatCreativeContext(kind, styles);
      const userBlock = [
        memoryBlock || null,
        vkAgeHint(ageBand),
        ctx ? ctx : null,
        prompt ?
          `当前已有想法：\n${prompt}`
        : '用户尚未写描述，请基于学段与形态给出具体、可做单页 HTML 的三个拓展方向。',
      ]
        .filter(Boolean)
        .join('\n\n');

      const runBrainOnce = async (modelId: string) => {
        const ms = Math.max(1_000, deadline - Date.now());
        return llm.client.chat.completions.create(
          {
            model: modelId,
            messages: [
              { role: 'system', content: VIBEKIDS_BRAINSTORM_SYSTEM },
              { role: 'user', content: userBlock },
            ],
            max_tokens: 600,
            temperature: 0.72,
          },
          { signal: AbortSignal.timeout(ms) },
        );
      };

      const routedModel = llm.model;
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await runBrainOnce(routedModel);
      } catch (toolErr) {
        const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
        const isInvalidModelId =
          toolErrMsg.includes('is not a valid model ID') ||
          (toolErrMsg.includes('400') && toolErrMsg.includes('model ID'));
        if (isInvalidModelId && routedModel !== llm.model && deadline - Date.now() > 1_200) {
          response = await runBrainOnce(llm.model);
        } else {
          throw toolErr;
        }
      }

      const text = response.choices[0]?.message?.content?.trim();
      if (!text) {
        return res.status(500).json({ error: 'empty_response' });
      }
      const directions = parseVibekidsDirectionsJson(text);
      if (directions.length === 0) {
        return res.status(500).json({
          error: 'parse_failed',
          detail: '模型未返回有效 JSON，请重试',
        });
      }
      return res.json({ directions });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Lobster vibekids-brainstorm]', e);
      if (respondLitellmBudgetExceededIfNeeded(res, e)) return;
      return res.status(500).json({
        error: 'llm_failed',
        detail: msg.length > 500 ? `${msg.slice(0, 500)}…` : msg,
      });
    }
  });

  /**
   * POST /api/lobster/vibekids-chips
   * 基于 Darwin + 用户画像（问卷/简介等）+ 创作上下文，返回 3 条灵感提示短句；exclude 用于「换一批」去重。
   */
  router.post('/vibekids-chips', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) {
      return res.status(403).json({
        error: 'darwin_required',
        detail: '请先接入 Darwin 后再使用个性化灵感提示。',
      });
    }

    const b = req.body as {
      ageBand?: unknown;
      kind?: unknown;
      styles?: unknown;
      prompt?: unknown;
      exclude?: unknown;
      model?: unknown;
    };
    const ageBand = vkParseAge(b.ageBand);
    const kind = vkParseKind(b.kind);
    const styles = vkParseStyles(b.styles);
    const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
    const excludeRaw = Array.isArray(b.exclude) ? b.exclude : [];
    const exclude = excludeRaw
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 2)
      .map((x) => x.trim().slice(0, 40))
      .slice(0, 12);
    const requestModel = typeof b.model === 'string' ? b.model : undefined;

    const llm = await getLlmClient(resolveModel(requestModel), userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message:
          'Darwin 需要平台虚拟 Key 才能调用模型。请先在积分兑换中申请 Key，或与 /my-lobster 对话使用相同配置。',
      });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, bio: true, darwinOnboarding: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      const deadline = Date.now() + vibekidsLlmDeadlineMs();
      const memoryBlock = await formatVibekidsDarwinMemoryBlock(userId).catch(() => '');
      const ctx = vkFormatCreativeContext(kind, styles);
      const profileBlock = formatVibekidsUserProfileBlock(user);
      const excludeBlock =
        exclude.length > 0 ?
          `【上一批勿重复】\n${exclude.map((s) => `- ${s}`).join('\n')}`
        : '';

      const userBlock = [
        profileBlock,
        memoryBlock || null,
        vkAgeHint(ageBand),
        ctx ? ctx : null,
        prompt ? `当前描述草稿：\n${prompt.slice(0, 800)}` : null,
        excludeBlock || null,
        '请输出 3 条灵感提示 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n');

      const runChipsOnce = async (modelId: string) => {
        const ms = Math.max(1_000, deadline - Date.now());
        return llm.client.chat.completions.create(
          {
            model: modelId,
            messages: [
              { role: 'system', content: VIBEKIDS_CHIPS_SYSTEM },
              { role: 'user', content: userBlock },
            ],
            max_tokens: 500,
            temperature: 0.78,
          },
          { signal: AbortSignal.timeout(ms) },
        );
      };

      const routedModel = llm.model;
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await runChipsOnce(routedModel);
      } catch (toolErr) {
        const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
        const isInvalidModelId =
          toolErrMsg.includes('is not a valid model ID') ||
          (toolErrMsg.includes('400') && toolErrMsg.includes('model ID'));
        if (isInvalidModelId && routedModel !== llm.model && deadline - Date.now() > 1_200) {
          response = await runChipsOnce(llm.model);
        } else {
          throw toolErr;
        }
      }

      const text = response.choices[0]?.message?.content?.trim();
      if (!text) {
        return res.status(500).json({ error: 'empty_response' });
      }
      let chips = parseVibekidsChipsJson(text);
      if (chips.length < 3) {
        return res.status(500).json({
          error: 'parse_failed',
          detail: '模型返回的灵感不足 3 条，请重试',
        });
      }
      chips = chips.slice(0, 3);
      return res.json({ chips });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Lobster vibekids-chips]', e);
      if (respondLitellmBudgetExceededIfNeeded(res, e)) return;
      return res.status(500).json({
        error: 'llm_failed',
        detail: msg.length > 500 ? `${msg.slice(0, 500)}…` : msg,
      });
    }
  });

  return router;
}

/**
 * A2A 求职实验室：用与 /api/lobster/chat 相同的 Darwin 人格、记忆与对话上下文，
 * 生成一段**无工具**的纯文本回复，并写入对话历史（用户消息不计入 Darwin 每日条数限制）。
 */
export async function runDarwinJobA2AReply(
  userId: string,
  userMessage: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const instance = getLobsterInstance(userId);
  if (!instance) return { ok: false, error: '请先申请 DarwinClaw' };

  const llm = await getLlmClient(resolveModel(), userId);
  if (!llm) {
    return {
      ok: false,
      error: 'DarwinClaw 需要平台虚拟 Key 才能运行，请先在积分兑换中申请 Key。',
    };
  }

  const conv = getLobsterConversation(userId);
  try {
    const compacted = await runCompactionIfNeeded(conv, llm.client, llm.model);
    if (compacted) await saveLobsterConversation(conv);
  } catch (e) {
    console.error('[Darwin A2A] context compact:', e);
  }

  const lobsterName = instance.name?.trim() || 'DarwinClaw';
  let systemContent =
    lobsterName !== 'DarwinClaw'
      ? LOBSTER_SYSTEM_PROMPT.replace(/你是"DarwinClaw"/, `你是"${lobsterName}"（昵称，本质上你是 DarwinClaw）`)
      : LOBSTER_SYSTEM_PROMPT;

  const memoryContent = readMemory(userId);
  if (memoryContent) {
    systemContent += `\n\n---\n[用户记忆]\n${memoryContent}`;
  }

  const officialSkillsAll = loadOfficialSkills();
  if (officialSkillsAll.length > 0) {
    const officialIndex = officialSkillsAll
      .map(
        (s) =>
          `- **${s.title}**: ${s.skillMarkdown.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 120) ?? s.skillMarkdown.slice(0, 120)}`,
      )
      .join('\n');
    systemContent += `\n\n---\n[平台官方技能索引]\n${officialIndex}`;
  }
  const installedSkills = getUserInstalledSkills(userId);
  if (installedSkills.length > 0) {
    const skillsBlock = installedSkills.map((s) => `### ${s.title}\n${s.skillMarkdown}`).join('\n\n---\n\n');
    systemContent += `\n\n---\n[用户自定义技能]\n\n${skillsBlock}`;
  }

  systemContent += `\n\n---\n【A2A 求职匹配 — 仅本次回复】\n用户消息来自「A2A 求职实验室」自动流程，代表主人与对方 Darwin 做岗位/求职预沟通。\n你必须只输出一段自然语言（约 2–6 句），维护主人利益、专业礼貌。\n**禁止**调用任何工具、禁止 JSON/Markdown 代码围栏、禁止说「我无法调用 API」。`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: userMessage.trim().slice(0, 12000) },
  ];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = buildChatMessagesWithCompact(
    conv,
    systemContent,
    userContent,
    false,
  );

  const routedModel = await routeModel(userMessage, llm.model);
  let finalText = '';

  try {
    const response = await llm.client.chat.completions.create({
      model: routedModel,
      messages,
      max_tokens: Math.min(calcMaxTokens(userMessage), 900),
      temperature: 0.65,
    });
    finalText = response.choices[0]?.message?.content?.trim() || '';
  } catch (toolErr) {
    const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
    const isInvalidModelId =
      toolErrMsg.includes('is not a valid model ID') ||
      (toolErrMsg.includes('400') && toolErrMsg.includes('model ID'));
    if (isInvalidModelId && routedModel !== llm.model) {
      const response = await llm.client.chat.completions.create({
        model: llm.model,
        messages,
        max_tokens: Math.min(calcMaxTokens(userMessage), 900),
        temperature: 0.65,
      });
      finalText = response.choices[0]?.message?.content?.trim() || '';
    } else {
      throw toolErr;
    }
  }

  if (!finalText) {
    finalText = '（Darwin 暂时无法生成回复，请稍后重试或检查模型配置）';
  }

  const userMsg = {
    id: uuidv4(),
    role: 'user' as const,
    content: `[A2A 招聘匹配] ${userMessage.trim()}`,
    timestamp: new Date().toISOString(),
  };
  const assistantMsg = {
    id: uuidv4(),
    role: 'assistant' as const,
    content: `[A2A 招聘匹配] ${finalText}`,
    timestamp: new Date().toISOString(),
  };
  await appendLobsterMessage(userId, userMsg, { skipDarwinDailyLimit: true });
  await appendLobsterMessage(userId, assistantMsg);

  return { ok: true, text: finalText };
}
