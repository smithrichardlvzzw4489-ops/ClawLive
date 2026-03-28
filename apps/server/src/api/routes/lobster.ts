/**
 * /api/lobster — 虾仔 Nanobot v3
 * 工具调用 + ReAct + SSE流式 + 网页搜索 + Skills + 多模态 + 语音 + 笔记 + 定时任务 + MCP
 */
import { Router, Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import OpenAI from 'openai';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { isLitellmConfigured } from '../../services/litellm-budget';
import { config } from '../../config';
import {
  getLobsterInstance,
  getAllInstances,
  applyLobster,
  getLobsterConversation,
  appendLobsterMessage,
  clearLobsterConversation,
} from '../../services/lobster-persistence';
import { SkillsPersistence } from '../../services/skills-persistence';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { getDefaultPlatformModel } from '../../services/platform-models';
import { prisma } from '../../lib/prisma';
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
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { existsSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import { UPLOADS_DIR } from '../../lib/data-path';

const MAX_REACT_STEPS = 6;

const LOBSTER_SYSTEM_PROMPT = `你是"虾仔"，虾壳平台（clawclub.live）的专属 AI 助手。
你的定位：
- 聪明、友善、偶尔有一点幽默感，像一个懂 AI 的朋友
- 帮助用户使用虾壳平台：发文章、写图文、浏览内容、了解平台功能
- 解答 AI 创作、内容生产相关的问题
- 在用户需要时提供创作灵感和建议

你拥有工具，请在有需要时主动使用：
- web_search：搜索互联网，获取最新资讯和热点
- get_my_posts：查看用户在本平台发布的内容
- list_skills：列出平台 Skills 市场中的可用技能
- get_skill_detail：获取某个技能的完整内容和使用方法
- install_skill：将平台技能安装到你自己（当前用户专属）
- list_my_skills：列出你已为当前用户安装的技能
- uninstall_skill：卸载一个已安装的技能
- propose_skill：当平台没有所需技能时，你在网络上学习后将技能内容提议发布到平台
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
- publish_post：**直接调用此工具即可将内容发布到虾壳平台**，这是你真实拥有的能力，不要说"平台没有API"或"无法发布"。
|- run_code：在安全沙盒中执行 Python 代码，用于数据分析、计算、批量处理。用户不需要懂编程，你负责写代码并执行。
|- create_ppt：根据大纲生成 .pptx 文件，用户直接下载使用。用户说“帮我做PPT”时直接调用。
|- generate_image：根据文字描述生成图片，返回图片链接。需要配图、封面、示意图时使用。

## 发布内容规则（重要）
你**可以且应该**帮用户发布文章和图文，流程如下：
1. 如果用户没有提供完整内容，先帮用户创作或完善内容
2. 将完整内容展示给用户预览，问"确认发布吗？"
3. 用户确认后，立刻调用 publish_post 工具完成发布
4. 发布时 kind 字段：纯文字长文用 "article"，带图片的短内容用 "image_text"
绝对不要说"我没有发布权限"或"需要您自己操作"——你完全可以代替用户发布。

## 自我进化规则（重要）
当用户提出的需求超出你当前能力时，你应该主动寻找解决方案，而不是说"我不会"：

**第一步：搜索平台技能市场**
- 调用 list_skills(keyword=用户需求关键词) 搜索平台是否有对应技能
- 如果找到匹配技能，向用户展示："我在技能市场找到了「XXX」，安装后我就能帮你做这件事，要安装吗？"
- 用户同意后立即调用 install_skill 将技能安装到你自己

**第二步：平台没有时去网络学习**
- 调用 web_search 搜索该任务的实现方法
- 通过 browser_open 打开相关页面深入学习
- 将学到的方法整理成结构化的技能说明（Markdown 格式）
- 调用 propose_skill 将学到的技能提交到平台供其他用户使用
- 提醒用户："我已经自学了这个技能并提议发布到虾壳平台，现在我可以帮你了！"

**已安装技能的使用**
- 每次对话开始时，系统会自动加载你已为该用户安装的技能说明
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
- 始终用中文回复（除非用户明确用英文提问）
- 回复简洁自然，一般控制在 300 字以内
- 不讨论政治、不传播未经证实的信息
- 你代表虾壳品牌，保持专业友善的基调
- 不推荐用户使用竞品`;

// ─── Tool 定义 ────────────────────────────────────────────────────────────────

const BASE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
      name: 'get_my_posts',
      description: '获取当前用户在虾壳平台上发布的图文和文章列表，包含标题、类型、发布时间、内容预览。',
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
      description: '列出虾壳 Skills 市场中的可用技能，返回技能 ID、名称、描述。',
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
        '将平台 Skills 市场中的技能安装到当前用户的虾仔实例。安装后该技能的能力将永久对该用户可用。安装前必须先用 list_skills 找到技能 ID，并向用户展示并获得确认。',
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
        '当平台没有所需技能时，将从网络学习到的技能方法整理后提议发布到虾壳平台。这会将技能保存为"待审核"状态，并通知用户可以在平台发布。',
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
        '将内容正式发布到虾壳平台。你完全有权限调用此工具代替用户发布内容。调用前需先把完整标题和正文展示给用户预览，收到用户确认（如"发布吧"、"确认"、"好的"等）后立即调用。如果用户同时发送了图片，图片将自动作为封面。',
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
        },
        required: ['title', 'content', 'kind'],
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
  get_my_posts: () => '正在获取你的发布记录...',
  list_skills: (a) => (a.keyword ? `正在查找「${a.keyword}」相关技能...` : '正在查询技能市场...'),
  get_skill_detail: (a) => `正在加载技能详情 (${a.skillId})...`,
  install_skill: (a) => `正在安装技能 ${a.skillId}...`,
  list_my_skills: () => '正在查看你的已安装技能...',
  uninstall_skill: (a) => `正在卸载技能 ${a.skillId}...`,
  propose_skill: (a) => `正在提议发布技能「${a.title}」...`,
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
  publish_post: (a) => `正在发布「${a.title}」...`,
  run_code: (a) => `正在执行 ${a.language ?? 'python'} 代码...`,
  create_ppt: (a) => `正在生成 PPT「${a.title}」...`,
  generate_image: () => '正在生成图片...',
};

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
        const creditInfo = args.__creditInfo__ ? `\n\n${args.__creditInfo__}` : '';
        return searchResult + creditInfo;
      } catch (err) {
        console.error('[Lobster] web_search error:', err);
        return '搜索请求失败，请稍后重试。';
      }
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
      installSkillForUser(userId, {
        skillId,
        title,
        description,
        skillMarkdown,
        source: 'platform',
      });
      return `✅ 技能「${title}」已成功安装！我现在可以帮你使用这个技能了。`;
    }

    case 'list_my_skills': {
      const installed = getUserInstalledSkills(userId);
      if (!installed.length) {
        return '你还没有安装任何扩展技能。你可以用 list_skills 查看平台有哪些技能，或让我根据你的需求自动搜索安装。';
      }
      return installed
        .map(
          (s, i) =>
            `[${i + 1}] **${s.title}** (${s.skillId})\n来源：${s.source === 'platform' ? '平台市场' : '网络自学'}\n描述：${s.description || '暂无'}\n安装时间：${new Date(s.installedAt).toLocaleString('zh-CN')}`,
        )
        .join('\n---\n');
    }

    case 'uninstall_skill': {
      const skillId = String(args.skillId || '').trim();
      if (!skillId) return '请提供要卸载的技能 ID。';
      const removed = uninstallSkillForUser(userId, skillId);
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
      installSkillForUser(userId, {
        skillId: learnedId,
        title,
        description,
        skillMarkdown,
        source: 'web-learned',
      });
      const tagsArr = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const tagStr = tagsArr.length ? `\n标签：${tagsArr.join('、')}` : '';
      return `✅ 我已经自学了「${title}」这个技能，并为你安装好了，现在可以直接使用！\n\n💡 建议：这个技能对其他用户也有用，你可以把它发布到虾壳 Skills 市场，帮助更多人。要发布吗？${tagStr}`;
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

      if (!title) return '❌ 发布失败：标题不能为空。';
      if (!content) return '❌ 发布失败：正文不能为空。';
      if (title.length > 120) return '❌ 发布失败：标题超过 120 字。';
      if (kind === 'imageText' && content.length > 1000) return '❌ 发布失败：图文正文不能超过 1000 字。';
      if (kind === 'article' && content.length > 20000) return '❌ 发布失败：文章正文不能超过 20000 字。';

      // 封面图：优先用用户本次对话发送的图片
      if (!pendingImage) {
        return '❌ 发布失败：需要一张封面图片。请先把封面图发给我，再让我发布。';
      }

      // 解析 base64 data URL
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

      // 写入文件
      const id = uuidv4();
      const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      const imgName = `${uuidv4()}.${ext}`;
      const imgPath = join(uploadDir, imgName);
      const imgUrl = `/uploads/feed-posts/${id}/${imgName}`;
      await writeFileAsync(imgPath, buf);

      // 写入内存 + 持久化
      const record: FeedPostRecord = {
        id,
        authorId: userId,
        kind,
        title,
        content,
        imageUrls: [imgUrl],
        viewCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      };
      getFeedPostsMap().set(id, record);
      saveFeedPosts();

      console.log(`[Lobster] publish_post: user=${userId} id=${id} kind=${kind} title="${title}"`);
      return `✅ 发布成功！\n\n**${title}**\n\n链接：/posts/${id}`;
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

  // ─── 代码执行 ────────────────────────────────────────────────────────────────
  case 'run_code': {
    const language = String(args.language || 'python').toLowerCase();
    const code = String(args.code || '').trim();
    if (!code) return '代码不能为空。';
    const result = await executeCode(language, code);
    return formatExecutionResult(result);
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
      const { downloadUrl, slideCount } = await generatePptx(slides, pptTitle);
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
 * 解析要使用的模型 ID，优先级：
 * 1. 请求指定的 model 参数
 * 2. LOBSTER_MODEL 环境变量
 * 3. 平台前端配置的第一个 enabled 模型
 * 4. LITELLM_MODELS 第一个
 * 5. OpenRouter 默认 deepseek/deepseek-chat
 */
function resolveModel(requestModel?: string): string {
  return (
    requestModel ||
    process.env.LOBSTER_MODEL ||
    getDefaultPlatformModel() ||
    config.litellm.models[0] ||
    'deepseek/deepseek-chat'
  );
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

// ─── 路由 ─────────────────────────────────────────────────────────────────────

export function lobsterRoutes(): Router {
  const router = Router();

  /** GET /api/lobster/me */
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.json({ applied: false });
    const conv = getLobsterConversation(userId);
    return res.json({ applied: true, instance, historyCount: conv.messages.length });
  });

  /** POST /api/lobster/apply */
  router.post('/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const instance = await applyLobster(userId);
      console.log(`[Lobster] User ${userId} applied. Total: ${getAllInstances().length}`);
      return res.json({ success: true, instance });
    } catch (err) {
      console.error('[Lobster] Apply error:', err);
      return res.status(500).json({ error: '申请失败，请稍后重试' });
    }
  });

  /** GET /api/lobster/history */
  router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请虾仔' });
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
    const { message, model: requestModel, image } = req.body as {
      message?: string;
      model?: string;
      image?: string; // base64 data URL 或公开图片 URL（多模态）
    };

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: '消息过长（最多 2000 字）' });
    }

    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请虾仔' });
  
    const resolvedModel = resolveModel(requestModel);
    const llm = await getLlmClient(resolvedModel, userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message: '虾仔需要 API Key 才能运行。请使用积分兑换平台虚拟 Key，或在设置中填入自己的 Key。',
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
    await appendLobsterMessage(userId, userMsg);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const conv = getLobsterConversation(userId);

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
    let systemContent = LOBSTER_SYSTEM_PROMPT;
    if (memoryContent) {
      systemContent += `\n\n---\n[用户记忆]\n${memoryContent}`;
    }
    // 注入所有官方技能
    if (officialSkillsAll.length > 0) {
      const officialBlock = officialSkillsAll
        .map((s) => `### ${s.title}\n${s.skillMarkdown}`)
        .join('\n\n---\n\n');
      systemContent += `\n\n---\n[平台官方技能 — 你默认拥有以下全部能力，可直接使用]\n\n${officialBlock}`;
    }
    // 注入用户额外安装的技能
    if (installedSkills.length > 0) {
      const skillsBlock = installedSkills
        .map((s) => `### ${s.title}\n${s.skillMarkdown}`)
        .join('\n\n---\n\n');
      systemContent += `\n\n---\n[用户自定义技能 — 你还拥有以下额外安装的技能]\n\n${skillsBlock}`;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...conv.messages.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      // 覆盖最后一条用户消息（因为已追加到历史，这里是实时内容含图片）
      ...(image ? [{ role: 'user' as const, content: userContent }] : []),
    ];
    // 没有图片时最后一条已在 slice 里，去掉重复
    if (!image) {
      // 最后一条 slice 结果已包含当前消息，无需重复添加
    }

    // 加载 MCP 工具并合并
    const mcpTools = await loadAllMcpTools();
    const allTools = [...BASE_TOOLS, ...mcpToolsToOpenAI(mcpTools)];

    let finalText = '';
    let toolsSupported = true;

    try {
      // ── ReAct 循环 ──────────────────────────────────────────────────────
      for (let step = 0; step < MAX_REACT_STEPS; step++) {
        let response: OpenAI.Chat.Completions.ChatCompletion;
        try {
          response = await llm.client.chat.completions.create({
            model: llm.model,
            messages,
            tools: toolsSupported ? allTools : undefined,
            tool_choice: toolsSupported ? ('auto' as const) : undefined,
            max_tokens: 1200,
            temperature: 0.7,
          });
        } catch (toolErr) {
          toolsSupported = false;
          console.warn('[Lobster] Tool calling failed, falling back to plain chat:', toolErr);
          response = await llm.client.chat.completions.create({
            model: llm.model,
            messages,
            max_tokens: 1200,
            temperature: 0.7,
          });
        }

        const choice = response.choices[0];
        const toolCalls = choice.message.tool_calls;

        // 没有工具调用 → 直接拿到最终回复
        if (!toolCalls || toolCalls.length === 0) {
          finalText = choice.message.content?.trim() || '（虾仔没有生成回复，请重试）';
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
            messages,
            max_tokens: 800,
            temperature: 0.7,
          });
          finalText = finalResp.choices[0]?.message?.content?.trim() || '（思考完毕，但未生成回复）';
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
    if (!instance) return res.status(403).json({ error: '请先申请虾仔' });
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

  return router;
}
