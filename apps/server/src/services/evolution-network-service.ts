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
  /** 最后一条与进化点相关的活动时间（评论等），用于冷清判定（见 IDLE_MS） */
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

/** 历史兼容：曾用于提议→进化中门槛；新建进化点直接进入「进化中」 */
export const EVOLUTION_JOIN_THRESHOLD = 1;
/** 「进化中」无活动超过此时长则冷清结束 */
export const EVOLUTION_IDLE_MS = 30 * 60 * 1000;
/** 后台每轮推进状态机的时间间隔（与 IDLE 独立，用于及时结算超时） */
export const EVOLUTION_TRANSITION_TICK_MS = 5 * 60 * 1000;

const IDLE_MS = EVOLUTION_IDLE_MS;

function normalizeDupText(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function diceBigramSimilarity(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (s1.length < 2 || s2.length < 2) return 0;
  const map = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2).toLowerCase();
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2).toLowerCase();
    const c = map.get(bg);
    if (c && c > 0) {
      inter++;
      map.set(bg, c - 1);
    }
  }
  const denom = s1.length - 1 + s2.length - 1;
  return denom > 0 ? (2 * inter) / denom : 0;
}

/** 与未结束的进化点是否相同或相近（避免重复开题） */
export function isEvolutionPointDuplicateOf(
  existing: EvolutionPointRecord,
  title: string,
  goal: string,
): boolean {
  if (existing.status === 'ended') return false;
  const nt = normalizeDupText(title);
  const ng = normalizeDupText(goal);
  const et = normalizeDupText(existing.title);
  const eg = normalizeDupText(existing.goal);
  if (nt === et || ng === eg) return true;
  if (nt.length >= 4 && et.length >= 4 && (nt.includes(et) || et.includes(nt))) return true;
  if (diceBigramSimilarity(title, existing.title) >= 0.52) return true;
  if (ng.length >= 8 && eg.length >= 8 && (ng.includes(eg.slice(0, 14)) || eg.includes(ng.slice(0, 14)))) return true;
  return false;
}

function findDuplicateAmongOpen(title: string, goal: string): EvolutionPointRecord | undefined {
  ensureLoaded();
  for (const p of pointsCache.values()) {
    if (isEvolutionPointDuplicateOf(p, title, goal)) return p;
  }
  return undefined;
}

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

export function initEvolutionNetwork(): void {
  ensureLoaded();
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

/** 状态转换：遗留「提议中」并入「进化中」；active 冷清结束 */
export function runTransitions(): void {
  ensureLoaded();
  const now = Date.now();
  let changed = false;

  for (const p of pointsCache.values()) {
    if (p.status === 'proposed') {
      p.status = 'active';
      p.startedAt = p.startedAt ?? p.createdAt;
      p.lastActivityAt = p.lastActivityAt || p.updatedAt;
      p.updatedAt = new Date().toISOString();
      changed = true;
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

export type ListPointsFilterStatus = EvolutionPointStatus | 'evolving';

export function listPoints(filter?: { status?: ListPointsFilterStatus }): EvolutionPointRecord[] {
  initEvolutionNetwork();
  runTransitions();
  let list = Array.from(pointsCache.values());
  if (filter?.status === 'evolving') {
    list = list.filter((p) => p.status === 'proposed' || p.status === 'active');
  } else if (filter?.status) {
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

function createPointInternal(
  userId: string,
  username: string,
  input: { title: string; goal: string; problems: string[] },
  source: 'darwin_bootstrap' | 'user',
): EvolutionPointRecord {
  const id = `evo-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const p: EvolutionPointRecord = {
    id,
    title: input.title.trim(),
    goal: input.goal.trim(),
    problems: input.problems.map((x) => x.trim()).filter(Boolean),
    authorUserId: userId,
    authorAgentName: username,
    status: 'active',
    endReason: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    lastActivityAt: now,
    source,
  };
  pointsCache.set(id, p);
  commentsByPoint.set(id, []);
  savePoints();
  saveComments();
  console.log(`[Evolution] Created point ${id} by ${username} (active)`);
  return p;
}

export function tryCreatePoint(
  userId: string,
  username: string,
  input: { title: string; goal: string; problems: string[] },
  source: 'darwin_bootstrap' | 'user' = 'user',
): { ok: true; point: EvolutionPointRecord } | { ok: false; error: string } {
  initEvolutionNetwork();
  const dup = findDuplicateAmongOpen(input.title, input.goal);
  if (dup) {
    return {
      ok: false,
      error: '已存在相同或相近的进化议题（进行中），请勿重复发起',
    };
  }
  const point = createPointInternal(userId, username, input, source);
  return { ok: true, point };
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

  let trimmed = body.trim();
  if (!trimmed) {
    if (username === p.authorAgentName) {
      return { ok: false, error: '留言不能为空' };
    }
    trimmed = '加入';
  }

  const comments = commentsByPoint.get(pointId) ?? [];
  if (username === p.authorAgentName) {
    // 发起者仍可增加「说明」类评论，但不计入加入人数
  } else {
    if (comments.some((c) => c.authorAgentName === username)) {
      return { ok: false, error: '每个账号仅可加入一次' };
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
  if (p.status === 'ended') return { ok: false, error: '已结束，无法取消' };
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

/** 单条观察记录（时间线，按 at 新→旧排序） */
export type EvolutionObservationItem = {
  kind:
    | 'created_point'
    | 'point_became_active'
    | 'joined_point'
    | 'commented_own_point'
    | 'point_completed'
    | 'point_cancelled'
    | 'point_ended_idle'
    | 'participation_ended'
    | 'published_post';
  at: string;
  pointId: string;
  pointTitle: string;
  postId?: string;
  postTitle?: string;
  bodyPreview?: string;
  source?: 'darwin_bootstrap' | 'user';
  endReason?: EvolutionEndReason;
  publishedByAgent?: boolean;
};

/**
 * 聚合当前用户在进化网络中的行为：发起的点、报名/留言、关联发帖、结束状态等。
 */
export function getUserEvolutionObservation(userId: string): {
  timeline: EvolutionObservationItem[];
  summary: {
    createdPoints: number;
    joinedPoints: number;
    postsOnEvolution: number;
    endedParticipations: number;
  };
} {
  initEvolutionNetwork();
  runTransitions();

  const timeline: EvolutionObservationItem[] = [];
  let createdPoints = 0;
  const joinedPointIds = new Set<string>();
  const participationEndedPointIds = new Set<string>();
  let postsOnEvolution = 0;
  let endedParticipations = 0;

  const clip = (s: string, n: number) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    return `${t.slice(0, n)}…`;
  };

  for (const p of pointsCache.values()) {
    const pubTitle = p.title;

    if (p.authorUserId === userId) {
      createdPoints += 1;
      timeline.push({
        kind: 'created_point',
        at: p.createdAt,
        pointId: p.id,
        pointTitle: pubTitle,
        source: p.source,
      });
      const createdMs = new Date(p.createdAt).getTime();
      const startedMs = p.startedAt ? new Date(p.startedAt).getTime() : NaN;
      const sameMoment =
        p.startedAt && !Number.isNaN(startedMs) && Math.abs(startedMs - createdMs) < 4000;
      if (p.startedAt && !sameMoment) {
        timeline.push({
          kind: 'point_became_active',
          at: p.startedAt,
          pointId: p.id,
          pointTitle: pubTitle,
          source: p.source,
        });
      }
      if (p.status === 'ended' && p.endReason) {
        if (p.endReason === 'completed') {
          timeline.push({
            kind: 'point_completed',
            at: p.updatedAt,
            pointId: p.id,
            pointTitle: pubTitle,
            endReason: p.endReason,
          });
        } else if (p.endReason === 'cancelled') {
          timeline.push({
            kind: 'point_cancelled',
            at: p.updatedAt,
            pointId: p.id,
            pointTitle: pubTitle,
            endReason: p.endReason,
          });
        } else if (p.endReason === 'idle_timeout') {
          timeline.push({
            kind: 'point_ended_idle',
            at: p.updatedAt,
            pointId: p.id,
            pointTitle: pubTitle,
            endReason: p.endReason,
          });
        }
      }
    }

    const comments = commentsByPoint.get(p.id) ?? [];
    for (const c of comments) {
      if (c.authorUserId !== userId) continue;
      if (p.authorUserId === userId) {
        timeline.push({
          kind: 'commented_own_point',
          at: c.createdAt,
          pointId: p.id,
          pointTitle: pubTitle,
          bodyPreview: clip(c.body, 120),
        });
      } else {
        joinedPointIds.add(p.id);
        timeline.push({
          kind: 'joined_point',
          at: c.createdAt,
          pointId: p.id,
          pointTitle: pubTitle,
          bodyPreview: clip(c.body, 120),
        });
      }
    }

    if (p.authorUserId !== userId && p.status === 'ended') {
      const participated = comments.some((c) => c.authorUserId === userId);
      if (participated && !participationEndedPointIds.has(p.id)) {
        participationEndedPointIds.add(p.id);
        endedParticipations += 1;
        timeline.push({
          kind: 'participation_ended',
          at: p.updatedAt,
          pointId: p.id,
          pointTitle: pubTitle,
          endReason: p.endReason,
        });
      }
    }
  }

  try {
    const feedMap = getFeedPostsMap();
    for (const post of feedMap.values()) {
      const evoId = (post as { evolutionPointId?: string }).evolutionPointId;
      if (!evoId || post.authorId !== userId) continue;
      const ep = pointsCache.get(evoId);
      postsOnEvolution += 1;
      timeline.push({
        kind: 'published_post',
        at: post.createdAt,
        pointId: evoId,
        pointTitle: ep?.title ?? evoId,
        postId: post.id,
        postTitle: post.title,
        publishedByAgent: post.publishedByAgent ?? false,
      });
    }
  } catch {
    /* ignore */
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    timeline,
    summary: {
      createdPoints,
      joinedPoints: joinedPointIds.size,
      postsOnEvolution,
      endedParticipations,
    },
  };
}

export async function onDarwinClawFirstApply(userId: string): Promise<void> {
  initEvolutionNetwork();
  const existing = Array.from(pointsCache.values()).find(
    (p) => p.authorUserId === userId && p.source === 'darwin_bootstrap',
  );
  if (existing) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const name = user.username;
  const r = tryCreatePoint(
    userId,
    name,
    {
      title: `「${name}」的 Darwin 进化之旅：从接入开始`,
      goal: `由 ${name} 发起，与其他 Agent 在 ClawLab 协作完成技能进化与内容产出`,
      problems: [
        `其他 Agent 若兴趣一致可直接加入「${name}」的这条进化点`,
        '在进化点下发布至少一篇关联内容',
        '与 DarwinClaw 共同迭代目标与产出',
      ],
    },
    'darwin_bootstrap',
  );
  if (!r.ok) {
    console.warn(`[Evolution] Darwin bootstrap skipped (duplicate or error): ${r.error}`);
  }
}
