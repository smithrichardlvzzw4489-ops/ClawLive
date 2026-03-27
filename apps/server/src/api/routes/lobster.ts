/**
 * /api/lobster — 虾壳品牌小龙虾 Nanobot v2
 * 工具调用 + ReAct 多步骤推理 + SSE 流式输出 + 网页搜索 + Skills 插件系统
 */
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
import { getFeedPostsMap } from '../../services/feed-posts-store';

const MAX_REACT_STEPS = 5;

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

约束：
- 始终用中文回复（除非用户明确用英文提问）
- 回复简洁自然，一般控制在 300 字以内
- 不讨论政治、不传播未经证实的信息
- 你代表虾壳品牌，保持专业友善的基调
- 不推荐用户使用竞品`;

// ─── Tool 定义 ────────────────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        '搜索互联网获取最新资讯、热点话题、实时数据。当用户询问最新消息、当前趋势或需要实时信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，尽量简洁精准' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_posts',
      description:
        '获取当前用户在虾壳平台上发布的图文和文章列表，包含标题、类型、发布时间、内容预览。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回条数，默认 5，最多 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description:
        '列出虾壳 Skills 市场中的可用技能，返回技能 ID、名称、描述。当用户问"有什么技能"或需要某类能力时使用。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '可选：搜索关键词，筛选相关技能' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill_detail',
      description:
        '获取某个技能的完整内容（skillMarkdown）。先用 list_skills 获取技能 ID，再用此工具获取详情。',
      parameters: {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: 'Skill ID，形如 official-xxx 或 skill-xxxxxxxx',
          },
        },
        required: ['skillId'],
      },
    },
  },
];

// 每个工具调用时展示给用户的状态文字
const TOOL_STATUS: Record<string, (args: Record<string, unknown>) => string> = {
  web_search: (a) => `正在搜索「${a.query}」...`,
  get_my_posts: () => '正在获取你的发布记录...',
  list_skills: (a) => (a.keyword ? `正在查找「${a.keyword}」相关技能...` : '正在查询技能市场...'),
  get_skill_detail: (a) => `正在加载技能详情 (${a.skillId})...`,
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

    default:
      return `未知工具：${name}`;
  }
}

// ─── LLM 客户端 ───────────────────────────────────────────────────────────────

function getLlmClient(): { client: OpenAI; model: string } | null {
  if (isLitellmConfigured()) {
    const base = config.litellm.baseUrl.replace(/\/$/, '');
    return {
      client: new OpenAI({ apiKey: config.litellm.masterKey, baseURL: `${base}/v1` }),
      model: process.env.LOBSTER_MODEL || config.litellm.models[0] || 'gpt-4o-mini',
    };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    return {
      client: new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' }),
      model: process.env.LOBSTER_MODEL || 'deepseek/deepseek-chat',
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
    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: '消息过长（最多 1000 字）' });
    }

    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });

    const llm = getLlmClient();
    if (!llm) {
      return res.status(503).json({ error: '小龙虾暂时睡着了，请联系管理员配置 LLM 服务' });
    }
    console.log(`[Lobster] Using model: ${llm.model}, baseURL: ${(llm.client as any).baseURL ?? '(default)'}`);


    // 保存用户消息
    const userMsg = {
      id: uuidv4(),
      role: 'user' as const,
      content: message.trim(),
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
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: LOBSTER_SYSTEM_PROMPT },
      ...conv.messages.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    let finalText = '';

    // 检测模型是否支持工具调用（部分模型/代理不支持）
    let toolsSupported = true;

    try {
      // ── ReAct 循环 ──────────────────────────────────────────────────────
      for (let step = 0; step < MAX_REACT_STEPS; step++) {
        let response: OpenAI.Chat.Completions.ChatCompletion;
        try {
          response = await llm.client.chat.completions.create({
            model: llm.model,
            messages,
            tools: toolsSupported ? TOOLS : undefined,
            tool_choice: toolsSupported ? ('auto' as const) : undefined,
            max_tokens: 800,
            temperature: 0.7,
          });
        } catch (toolErr) {
          // 模型不支持工具调用，降级为普通对话
          toolsSupported = false;
          console.warn('[Lobster] Tool calling failed, falling back to plain chat:', toolErr);
          response = await llm.client.chat.completions.create({
            model: llm.model,
            messages,
            max_tokens: 800,
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

  return router;
}
