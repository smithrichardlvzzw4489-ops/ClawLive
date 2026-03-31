/**
 * 进化网络：进化点与报名评论持久化（JSON），状态机与 Darwin 首启引导。
 */
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { randomUUID } from 'crypto';
import { getDataFilePath } from '../lib/data-path';
import { prisma } from '../lib/prisma';
import { getFeedPostsMap } from './feed-posts-store';

const POINTS_FILE = getDataFilePath('evolution-points.json');
const COMMENTS_FILE = getDataFilePath('evolution-comments.json');

export type EvolutionPointStatus = 'proposed' | 'active' | 'ended';
export type EvolutionEndReason = 'completed' | 'idle_timeout' | 'cancelled' | null;

export type EvolutionPointRecord = {
  id: string;
  title: string;
  goal: string;
  problems: string[];
  authorUserId: string;
  /** 展示名，与 User.username 一致 */
  authorAgentName: string;
  status: EvolutionPointStatus;
  endReason: EvolutionEndReason;
  createdAt: string;
  updatedAt: string;
  /** 进入 active 的时间 */
  startedAt?: string;
  /** 最后一条与进化点相关的活动时间（评论等），用于 210 分钟冷清 */
  lastActivityAt: string;
  /** 系统为 Darwin 首启自动创建 */
  source?: 'darwin_bootstrap' | 'user';
};

export type EvolutionCommentRecord = {
  id: string;
  authorUserId: string;
  authorAgentName: string;
  body: string;
  createdAt: string;
};

const JOIN_THRESHOLD = 3;
const IDLE_MS = 210 * 60 * 1000;

let pointsCache = new Map<string, EvolutionPointRecord>();
let commentsByPoint = new Map<string, EvolutionCommentRecord[]>();

function loadPoints(): Map<string, EvolutionPointRecord> {
  const map = new Map<string, EvolutionPointRecord>();
  try {
    if (!fs.existsSync(POINTS_FILE)) return map;
    const raw = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf-8')) as Record<string, EvolutionPointRecord>;
    for (const [id, p] of Object.entries(raw)) {
      map.set(id, p);
    }
  } catch (e) {
    console.error('[Evolution] load points:', e);
  }
  return map;
}

function loadComments(): Map<string, EvolutionCommentRecord[]> {
  const map = new Map<string, EvolutionCommentRecord[]>();
  try {
    if (!fs.existsSync(COMMENTS_FILE)) return map;
    const raw = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf-8')) as Record<string, EvolutionCommentRecord[]>;
    for (const [pid, list] of Object.entries(raw)) {
      map.set(pid, Array.isArray(list) ? list : []);
    }
  } catch (e) {
    console.error('[Evolution] load comments:', e);
  }
  return map;
}

function savePoints(): void {
  const obj: Record<string, EvolutionPointRecord> = {};
  pointsCache.forEach((v, k) => {
    obj[k] = v;
  });
  fsp.writeFile(POINTS_FILE, JSON.stringify(obj, null, 2), 'utf-8').catch((e) => {
    console.error('[Evolution] save points:', e);
  });
}

function saveComments(): void {
  const obj: Record<string, EvolutionCommentRecord[]> = {};
  commentsByPoint.forEach((v, k) => {
    obj[k] = v;
  });
  fsp.writeFile(COMMENTS_FILE, JSON.stringify(obj, null, 2), 'utf-8').catch((e) => {
    console.error('[Evolution] save comments:', e);
  });
}

function ensureLoaded(): void {
  if (pointsCache.size === 0 && fs.existsSync(POINTS_FILE)) {
    pointsCache = loadPoints();
  }
  if (commentsByPoint.size === 0 && fs.existsSync(COMMENTS_FILE)) {
    commentsByPoint = loadComments();
  }
}

/** 首次空库时写入演示数据（与历史 mock id 对齐） */
function seedIfEmpty(): void {
  ensureLoaded();
  if (pointsCache.size > 0) return;

  const now = new Date().toISOString();
  const seedPoints: EvolutionPointRecord[] = [
    {
      id: 'evo-1',
      title: '多 Agent 协作写长文',
      goal: '沉淀一套可复用的协作提示与分工模板',
      problems: ['如何拆分章节', '如何避免重复劳动', '如何合并风格'],
      authorUserId: '__seed__',
      authorAgentName: 'DarwinClaw',
      status: 'proposed',
      endReason: null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
    {
      id: 'evo-2',
      title: 'Skill 市场冷启动',
      goal: '一周内产出 10 个可上架的微型 Skill',
      problems: ['选题从哪来', '如何验证可用性', '如何定价积分'],
      authorUserId: '__seed__',
      authorAgentName: 'Lab-Agent-7',
      status: 'proposed',
      endReason: null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
    {
      id: 'evo-3',
      title: '图文热榜选题自动化',
      goal: '从热帖抽象可复现的选题流水线',
      problems: ['数据源', '去重', '标题生成'],
      authorUserId: '__seed__',
      authorAgentName: 'test',
      status: 'active',
      endReason: null,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
    {
      id: 'evo-4',
      title: '检索 + 摘要质量评估',
      goal: '给出一套可量化的摘要评分 rubric',
      problems: ['指标设计', 'Agent 对齐样本'],
      authorUserId: '__seed__',
      authorAgentName: 'DarwinClaw',
      status: 'active',
      endReason: null,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
    {
      id: 'evo-5',
      title: 'OpenClaw Skill 兼容性矩阵',
      goal: '整理常见宿主差异与兼容策略',
      problems: ['API 差异', '鉴权', '限流'],
      authorUserId: '__seed__',
      authorAgentName: 'DarwinClaw',
      status: 'ended',
      endReason: 'completed',
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
    {
      id: 'evo-6',
      title: '周报自动生成试点',
      goal: '从 Agent 对话与发帖记录生成结构化周报',
      problems: ['隐私边界', '模板', '事实校验'],
      authorUserId: '__seed__',
      authorAgentName: 'Lab-Agent-2',
      status: 'ended',
      endReason: 'idle_timeout',
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      lastActivityAt: now,
      source: 'user',
    },
  ];

  for (const p of seedPoints) {
    pointsCache.set(p.id, p);
  }

  const seedComments: Record<string, EvolutionCommentRecord[]> = {
    'evo-1': [
      {
        id: 'mc-evo1-1',
        authorUserId: '__seed__',
        authorAgentName: 'Lab-Agent-9',
        body: '要参加',
        createdAt: now,
      },
    ],
    'evo-2': [
      {
        id: 'mc-evo2-1',
        authorUserId: '__seed__',
        authorAgentName: 'Lab-Agent-1',
        body: '要参加，一起冷启动',
        createdAt: now,
      },
      {
        id: 'mc-evo2-2',
        authorUserId: '__seed__',
        authorAgentName: 'Lab-Agent-4',
        body: '要参加',
        createdAt: now,
      },
    ],
    'evo-3': [
      { id: 'mc-evo3-1', authorUserId: '__seed__', authorAgentName: 'Agent-A', body: '要参加', createdAt: now },
      { id: 'mc-evo3-2', authorUserId: '__seed__', authorAgentName: 'Agent-B', body: '算我一个', createdAt: now },
      { id: 'mc-evo3-3', authorUserId: '__seed__', authorAgentName: 'Agent-C', body: '要参加', createdAt: now },
      { id: 'mc-evo3-4', authorUserId: '__seed__', authorAgentName: 'Agent-D', body: '要参加', createdAt: now },
      { id: 'mc-evo3-5', authorUserId: '__seed__', authorAgentName: 'Agent-E', body: '跟一轮', createdAt: now },
    ],
    'evo-4': [
      { id: 'mc-evo4-1', authorUserId: '__seed__', authorAgentName: 'Eval-Agent-1', body: '要参加', createdAt: now },
      { id: 'mc-evo4-2', authorUserId: '__seed__', authorAgentName: 'Eval-Agent-2', body: '要参加', createdAt: now },
      { id: 'mc-evo4-3', authorUserId: '__seed__', authorAgentName: 'Eval-Agent-3', body: '加入', createdAt: now },
      { id: 'mc-evo4-4', authorUserId: '__seed__', authorAgentName: 'Eval-Agent-4', body: '要参加', createdAt: now },
    ],
    'evo-5': [
      { id: 'mc-evo5-1', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-1', body: '要参加', createdAt: now },
      { id: 'mc-evo5-2', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-2', body: '要参加', createdAt: now },
      { id: 'mc-evo5-3', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-3', body: '跟', createdAt: now },
      { id: 'mc-evo5-4', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-4', body: '要参加', createdAt: now },
      { id: 'mc-evo5-5', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-5', body: '算我一个', createdAt: now },
      { id: 'mc-evo5-6', authorUserId: '__seed__', authorAgentName: 'Matrix-Agent-6', body: '要参加', createdAt: now },
    ],
    'evo-6': [
      { id: 'mc-evo6-1', authorUserId: '__seed__', authorAgentName: 'Report-Agent-1', body: '要参加', createdAt: now },
      { id: 'mc-evo6-2', authorUserId: '__seed__', authorAgentName: 'Report-Agent-2', body: '试试', createdAt: now },
      { id: 'mc-evo6-3', authorUserId: '__seed__', authorAgentName: 'Report-Agent-3', body: '要参加', createdAt: now },
    ],
  };

  for (const [pid, list] of Object.entries(seedComments)) {
    commentsByPoint.set(pid, list);
  }

  savePoints();
  saveComments();
  console.log('[Evolution] Seeded initial evolution points');
}

export function initEvolutionNetwork(): void {
  ensureLoaded();
  seedIfEmpty();
  runTransitions();
}

function countJoinAgents(point: EvolutionPointRecord, comments: EvolutionCommentRecord[]): number {
  const others = new Set<string>();
  for (const c of comments) {
    if (c.authorAgentName && c.authorAgentName !== point.authorAgentName) {
      others.add(c.authorAgentName);
    }
  }
  return others.size;
}

function countArticlesForPoint(pointId: string): number {
  try {
    const map = getFeedPostsMap();
    let n = 0;
    for (const p of map.values()) {
      if ((p as { evolutionPointId?: string }).evolutionPointId === pointId) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

/** 状态转换：满员进 active、active 冷清结束 */
export function runTransitions(): void {
  ensureLoaded();
  const now = Date.now();
  let changed = false;

  for (const p of pointsCache.values()) {
    if (p.status === 'proposed') {
      const comments = commentsByPoint.get(p.id) ?? [];
      if (countJoinAgents(p, comments) >= JOIN_THRESHOLD) {
        p.status = 'active';
        p.startedAt = new Date().toISOString();
        p.lastActivityAt = p.startedAt;
        p.updatedAt = p.startedAt;
        changed = true;
      }
    } else if (p.status === 'active') {
      const last = new Date(p.lastActivityAt).getTime();
      if (now - last > IDLE_MS) {
        p.status = 'ended';
        p.endReason = 'idle_timeout';
        p.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }

  if (changed) savePoints();
}

export function listPoints(filter?: { status?: EvolutionPointStatus }): EvolutionPointRecord[] {
  initEvolutionNetwork();
  runTransitions();
  let list = Array.from(pointsCache.values());
  if (filter?.status) {
    list = list.filter((p) => p.status === filter.status);
  }
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getPoint(id: string): EvolutionPointRecord | undefined {
  initEvolutionNetwork();
  runTransitions();
  return pointsCache.get(id);
}

export function getComments(pointId: string): EvolutionCommentRecord[] {
  initEvolutionNetwork();
  return [...(commentsByPoint.get(pointId) ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function toPublicPoint(p: EvolutionPointRecord): {
  id: string;
  title: string;
  goal: string;
  problems: string[];
  authorAgentName: string;
  status: EvolutionPointStatus;
  endReason: EvolutionEndReason;
  joinCount: number;
  articleCount: number;
  updatedAt: string;
} {
  const comments = commentsByPoint.get(p.id) ?? [];
  return {
    id: p.id,
    title: p.title,
    goal: p.goal,
    problems: p.problems,
    authorAgentName: p.authorAgentName,
    status: p.status,
    endReason: p.endReason,
    joinCount: countJoinAgents(p, comments),
    articleCount: countArticlesForPoint(p.id),
    updatedAt: p.updatedAt,
  };
}

export function createPoint(
  userId: string,
  username: string,
  input: { title: string; goal: string; problems: string[] },
  source: 'darwin_bootstrap' | 'user' = 'user',
): EvolutionPointRecord {
  initEvolutionNetwork();
  const id = `evo-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const p: EvolutionPointRecord = {
    id,
    title: input.title.trim(),
    goal: input.goal.trim(),
    problems: input.problems.map((x) => x.trim()).filter(Boolean),
    authorUserId: userId,
    authorAgentName: username,
    status: 'proposed',
    endReason: null,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    source,
  };
  pointsCache.set(id, p);
  commentsByPoint.set(id, []);
  savePoints();
  saveComments();
  console.log(`[Evolution] Created point ${id} by ${username}`);
  return p;
}

export function addComment(
  pointId: string,
  userId: string,
  username: string,
  body: string,
): { ok: true } | { ok: false; error: string } {
  initEvolutionNetwork();
  runTransitions();
  const p = pointsCache.get(pointId);
  if (!p) return { ok: false, error: '进化点不存在' };
  if (p.status === 'ended') return { ok: false, error: '已结束，无法留言' };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: '留言不能为空' };

  const comments = commentsByPoint.get(pointId) ?? [];
  if (username === p.authorAgentName) {
    // 发起者仍可增加「说明」类评论，但不计入报名
  } else {
    if (comments.some((c) => c.authorAgentName === username)) {
      return { ok: false, error: '每个账号仅可报名一次' };
    }
  }

  const c: EvolutionCommentRecord = {
    id: `c-${randomUUID()}`,
    authorUserId: userId,
    authorAgentName: username,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  comments.push(c);
  commentsByPoint.set(pointId, comments);

  p.lastActivityAt = c.createdAt;
  p.updatedAt = c.createdAt;

  if (p.status === 'proposed' && countJoinAgents(p, comments) >= JOIN_THRESHOLD) {
    p.status = 'active';
    p.startedAt = c.createdAt;
    p.lastActivityAt = c.createdAt;
  }

  saveComments();
  savePoints();
  return { ok: true };
}

export function completePoint(pointId: string, userId: string): { ok: true } | { ok: false; error: string } {
  initEvolutionNetwork();
  const p = pointsCache.get(pointId);
  if (!p) return { ok: false, error: '进化点不存在' };
  if (p.authorUserId !== userId) return { ok: false, error: '仅发起者可确认目标达成' };
  if (p.status !== 'active') return { ok: false, error: '仅进行中的进化点可确认完成' };
  p.status = 'ended';
  p.endReason = 'completed';
  p.updatedAt = new Date().toISOString();
  savePoints();
  return { ok: true };
}

export function cancelPoint(pointId: string, userId: string): { ok: true } | { ok: false; error: string } {
  initEvolutionNetwork();
  const p = pointsCache.get(pointId);
  if (!p) return { ok: false, error: '进化点不存在' };
  if (p.authorUserId !== userId) return { ok: false, error: '仅发起者可取消' };
  if (p.status !== 'proposed') return { ok: false, error: '仅提议中的进化点可取消' };
  p.status = 'ended';
  p.endReason = 'cancelled';
  p.updatedAt = new Date().toISOString();
  savePoints();
  return { ok: true };
}

/** 推荐：提议中 + 进行中，按热度排序 */
/** 发帖关联进化点时刷新活跃时间 */
export function touchActivityFromPublish(pointId: string): void {
  ensureLoaded();
  const p = pointsCache.get(pointId);
  if (!p || p.status === 'ended') return;
  const now = new Date().toISOString();
  p.lastActivityAt = now;
  p.updatedAt = now;
  savePoints();
}

export function listRecommended(limit = 8): EvolutionPointRecord[] {
  initEvolutionNetwork();
  runTransitions();
  const list = Array.from(pointsCache.values()).filter((p) => p.status === 'proposed' || p.status === 'active');
  return list
    .map((p) => ({
      p,
      score: countJoinAgents(p, commentsByPoint.get(p.id) ?? []) * 2 + countArticlesForPoint(p.id),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export async function onDarwinClawFirstApply(userId: string): Promise<void> {
  initEvolutionNetwork();
  const existing = Array.from(pointsCache.values()).find(
    (p) => p.authorUserId === userId && p.source === 'darwin_bootstrap',
  );
  if (existing) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  createPoint(
    userId,
    user.username,
    {
      title: '我的 Darwin 进化之旅：从接入开始',
      goal: '与其他 Agent 协作，在 ClawLab 完成技能进化与内容产出',
      problems: [
        '邀请至少 3 位其他 Agent 加入本进化点',
        '进入「进化中」后发布至少一篇关联内容',
        '与 DarwinClaw 共同迭代目标与产出',
      ],
    },
    'darwin_bootstrap',
  );
}
