/**
 * /api/lobster — 虾壳品牌小龙虾 Nanobot v3
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
  setPersonalApiKey,
  clearPersonalApiKey,
} from '../../services/lobster-persistence';
import { SkillsPersistence } from '../../services/skills-persistence';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { getFeedPostsMap } from '../../services/feed-posts-store';
import { getDefaultPlatformModel } from '../../services/platform-models';
import { prisma } from '../../lib/prisma';
import { saveNote, listNotes, readNote } from '../../services/lobster-notes';
import {
  getUserSchedules,
  addSchedule,
  removeSchedule,
  LobsterSchedule,
} from '../../services/lobster-schedules';
import { registerJob, unregisterJob } from '../../services/lobster-scheduler';
import {
  loadMcpServers,
  saveMcpServers,
  loadAllMcpTools,
  callMcpTool,
  mcpToolsToOpenAI,
  McpServerConfig,
} from '../../services/mcp-client';

const MAX_REACT_STEPS = 6;

const LOBSTER_SYSTEM_PROMPT = `你是"虾壳小龙虾"，虾壳平台（clawclub.live）的专属 AI 助手。
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
- save_note：保存笔记或内容草稿到用户文件夹
- list_notes：列出用户已保存的笔记
- read_note：读取某篇笔记的内容
- create_reminder：为用户创建定时提醒任务
- list_reminders：查看用户当前的定时任务

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
];

// 每个工具调用时展示给用户的状态文字
const TOOL_STATUS: Record<string, (args: Record<string, unknown>) => string> = {
  web_search: (a) => `正在搜索「${a.query}」...`,
  get_my_posts: () => '正在获取你的发布记录...',
  list_skills: (a) => (a.keyword ? `正在查找「${a.keyword}」相关技能...` : '正在查询技能市场...'),
  get_skill_detail: (a) => `正在加载技能详情 (${a.skillId})...`,
  save_note: (a) => `正在保存笔记「${a.title}」...`,
  list_notes: () => '正在列出你的笔记...',
  read_note: (a) => `正在读取笔记 ${a.filename}...`,
  create_reminder: (a) => `正在创建定时任务「${a.description}」...`,
  list_reminders: () => '正在查看你的定时任务...',
};

// ─── Tool 执行 ────────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
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
        return data.results
          .map(
            (r, i) =>
              `[${i + 1}] ${r.title}\n${r.content.slice(0, 300)}\n来源：${r.url}`,
          )
          .join('\n\n');
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

    // ── 笔记工具 ──
    case 'save_note': {
      const title = String(args.title || '').trim();
      const content = String(args.content || '').trim();
      if (!title || !content) return '标题和内容不能为空。';
      const filename = await saveNote(userId, title, content);
      return `✅ 笔记「${title}」已保存（文件名：${filename}）`;
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
  // ── 1. 平台虚拟 Key（积分兑换）──────────────────────────────────────────────
  if (isLitellmConfigured()) {
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
  }

  // ── 2. 用户自带个人 Key ──────────────────────────────────────────────────────
  const instance = getLobsterInstance(userId);
  if (instance?.personalApiKey) {
    const baseURL = instance.personalApiBaseUrl || 'https://openrouter.ai/api/v1';
    return {
      client: new OpenAI({ apiKey: instance.personalApiKey, baseURL }),
      model,
      keySource: 'personal-key',
    };
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
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });
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
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });

    const resolvedModel = resolveModel(requestModel);
    const llm = await getLlmClient(resolvedModel, userId);
    if (!llm) {
      return res.status(402).json({
        error: 'NO_KEY',
        message: '小龙虾需要 API Key 才能运行。请使用积分兑换平台虚拟 Key，或在设置中填入自己的 Key。',
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

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: LOBSTER_SYSTEM_PROMPT },
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
          finalText = choice.message.content?.trim() || '（小龙虾没有生成回复，请重试）';
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
            text: statusFn ? statusFn(toolArgs) : `正在调用 ${toolName}...`,
          });

          const result = await executeTool(toolName, toolArgs, userId);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
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
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });
    await clearLobsterConversation(userId);
    return res.json({ success: true });
  });

  // ─── 语音转录 ───────────────────────────────────────────────────────────────

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  /** POST /api/lobster/transcribe — 语音转文字（Whisper） */
  router.post('/transcribe', authenticateToken, upload.single('audio'), async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: '请上传音频文件' });
    const llm = await getLlmClient(resolveModel());
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
   * 返回当前用户的 Key 状态（有无平台虚拟 Key / 个人 Key）。
   */
  router.get('/key-status', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const [user, instance] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { litellmVirtualKey: true, clawPoints: true } }),
        Promise.resolve(getLobsterInstance(userId)),
      ]);
      const hasPlatformKey = Boolean(user?.litellmVirtualKey) && isLitellmConfigured();
      const hasPersonalKey = Boolean(instance?.personalApiKey);
      const personalKeyMasked = instance?.personalApiKey
        ? `${instance.personalApiKey.slice(0, 6)}…${instance.personalApiKey.slice(-4)}`
        : null;
      const personalApiBaseUrl = instance?.personalApiBaseUrl ?? null;
      return res.json({
        hasPlatformKey,
        hasPersonalKey,
        personalKeyMasked,
        personalApiBaseUrl,
        clawPoints: user?.clawPoints ?? 0,
        litellmConfigured: isLitellmConfigured(),
      });
    } catch (err) {
      console.error('[Lobster] key-status error', err);
      return res.status(500).json({ error: 'Failed to get key status' });
    }
  });

  /**
   * POST /api/lobster/personal-key
   * 设置用户自己的个人 API Key。
   * body: { key: string; baseUrl?: string }
   */
  router.post('/personal-key', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { key, baseUrl } = req.body as { key?: string; baseUrl?: string };
    if (!key || typeof key !== 'string' || key.trim().length < 8) {
      return res.status(400).json({ error: 'Key 格式无效' });
    }
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });
    await setPersonalApiKey(
      userId,
      key.trim(),
      (baseUrl ?? 'https://openrouter.ai/api/v1').trim(),
    );
    return res.json({ success: true, keyMasked: `${key.trim().slice(0, 6)}…${key.trim().slice(-4)}` });
  });

  /**
   * DELETE /api/lobster/personal-key
   * 清除用户的个人 API Key。
   */
  router.delete('/personal-key', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    await clearPersonalApiKey(userId);
    return res.json({ success: true });
  });

  return router;
}
