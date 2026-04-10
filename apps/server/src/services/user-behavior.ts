/**
 * 用户行为采集与兴趣画像服务（双轨版）
 *
 * 人轨：基于隐式反馈（浏览、点赞、收藏）构建用户兴趣画像，用于个性化推荐
 * Agent轨：记录虾米行为（安装技能、引用内容、完成任务），计算内容"实用热度"
 */

import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { getDataFilePath } from '../lib/data-path';

const MAX_BEHAVIORS_PER_USER = 500;  // 单用户保留最近 N 条行为
const INTEREST_DECAY_DAYS = 30;     // 兴趣衰减周期（天）
const TOP_INTERESTS = 10;           // 取前 N 个兴趣维度参与个性化

// ─── Agent 行为层 ─────────────────────────────────────────────────────────────

/** Agent 行为类型 */
export type AgentBehaviorType =
  | 'agent_skill_install'       // 虾米安装了某技能（skillId）
  | 'agent_skill_used'          // 虾米用某技能完成任务（skillId）
  | 'agent_content_referenced'  // 虾米搜索平台并实际引用某文章（postId）
  | 'agent_search_query';       // 虾米在平台搜索了某关键词（query）

interface AgentBehavior {
  /** 行为所属用户（即该虾米的主人） */
  ownerUserId: string;
  type: AgentBehaviorType;
  /** skillId / postId / query 字符串 */
  targetId: string;
  /** 附加信息（如 query 文本、技能名称等） */
  extra?: string;
  timestamp: string;
}

const AGENT_FILE = getDataFilePath('agent-behaviors.json');
const MAX_AGENT_RECORDS = 10000; // 全局最近 N 条

/** 全局 agent 行为列表（新的在前） */
let agentBehaviorList: AgentBehavior[] = [];
let agentSaveTimer: ReturnType<typeof setTimeout> | null = null;

function loadAgentBehaviors(): void {
  try {
    if (!fs.existsSync(AGENT_FILE)) return;
    agentBehaviorList = JSON.parse(fs.readFileSync(AGENT_FILE, 'utf-8')) as AgentBehavior[];
  } catch { /* ignore */ }
}

function scheduleAgentSave(): void {
  if (agentSaveTimer) clearTimeout(agentSaveTimer);
  agentSaveTimer = setTimeout(() => {
    agentSaveTimer = null;
    fsp.writeFile(AGENT_FILE, JSON.stringify(agentBehaviorList, null, 2), 'utf-8').catch(() => {});
  }, 5000);
}

loadAgentBehaviors();

/** 记录虾米行为（公开 API） */
export function recordAgentBehavior(
  ownerUserId: string,
  type: AgentBehaviorType,
  targetId: string,
  extra?: string,
): void {
  agentBehaviorList.unshift({ ownerUserId, type, targetId, extra, timestamp: new Date().toISOString() });
  if (agentBehaviorList.length > MAX_AGENT_RECORDS) {
    agentBehaviorList.length = MAX_AGENT_RECORDS;
  }
  scheduleAgentSave();
}

// ─── Agent 热度查询 ───────────────────────────────────────────────────────────

export interface SkillAgentHeat {
  installCount: number;    // 被安装次数
  usedCount: number;       // 被使用次数
  uniqueAgents: number;    // 不同用户虾米安装/使用数
}

export interface PostAgentHeat {
  referenceCount: number;  // 被虾米引用次数
  uniqueAgents: number;    // 不同用户虾米引用数
  /** 综合实用热度分（0-100） */
  utilityScore: number;
}

/** 获取某技能的 Agent 热度 */
export function getSkillAgentHeat(skillId: string): SkillAgentHeat {
  const installs = agentBehaviorList.filter(
    (b) => b.targetId === skillId && b.type === 'agent_skill_install',
  );
  const uses = agentBehaviorList.filter(
    (b) => b.targetId === skillId && b.type === 'agent_skill_used',
  );
  const uniqueInstall = new Set(installs.map((b) => b.ownerUserId)).size;
  const uniqueUse = new Set(uses.map((b) => b.ownerUserId)).size;
  return {
    installCount: installs.length,
    usedCount: uses.length,
    uniqueAgents: Math.max(uniqueInstall, uniqueUse),
  };
}

/** 获取某 feed post 的 Agent 热度 */
export function getPostAgentHeat(postId: string): PostAgentHeat {
  const refs = agentBehaviorList.filter(
    (b) => b.targetId === postId && b.type === 'agent_content_referenced',
  );
  const uniqueAgents = new Set(refs.map((b) => b.ownerUserId)).size;
  // 实用热度：总引用 × 0.4 + 独立用户数 × 5（去重更可信）
  const utilityScore = Math.min(100, refs.length * 0.4 + uniqueAgents * 5);
  return { referenceCount: refs.length, uniqueAgents, utilityScore };
}

/** 获取全平台技能的 Agent 热度排行（按 uniqueAgents 降序） */
export function getTopSkillsByAgentHeat(limit = 20): Array<{ skillId: string; heat: SkillAgentHeat }> {
  const skillIds = new Set(
    agentBehaviorList
      .filter((b) => b.type === 'agent_skill_install' || b.type === 'agent_skill_used')
      .map((b) => b.targetId),
  );
  return Array.from(skillIds)
    .map((skillId) => ({ skillId, heat: getSkillAgentHeat(skillId) }))
    .sort((a, b) => b.heat.uniqueAgents - a.heat.uniqueAgents)
    .slice(0, limit);
}

/** 获取全平台 feed post 的实用热度排行（按 utilityScore 降序） */
export function getTopPostsByAgentHeat(limit = 20): Array<{ postId: string; heat: PostAgentHeat }> {
  const postIds = new Set(
    agentBehaviorList
      .filter((b) => b.type === 'agent_content_referenced')
      .map((b) => b.targetId),
  );
  return Array.from(postIds)
    .map((postId) => ({ postId, heat: getPostAgentHeat(postId) }))
    .sort((a, b) => b.heat.utilityScore - a.heat.utilityScore)
    .slice(0, limit);
}

/** Agent 最近搜索的热门关键词（平台内容缺口洞察） */
export function getAgentTopSearchKeywords(limit = 10): Array<{ keyword: string; count: number }> {
  const freq = new Map<string, number>();
  agentBehaviorList
    .filter((b) => b.type === 'agent_search_query' && b.extra)
    .forEach((b) => {
      const kw = (b.extra || '').toLowerCase().trim();
      if (kw) freq.set(kw, (freq.get(kw) || 0) + 1);
    });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

const FILE = getDataFilePath('user-behaviors.json');

export type BehaviorType =
  | 'work_view'
  | 'room_join'
  | 'history_view'
  | 'work_like'
  | 'feed_post_view'
  | 'feed_post_like'
  | 'feed_post_collect';

interface UserBehavior {
  userId: string;
  type: BehaviorType;
  targetId: string;
  /** 附加上下文，用于兴趣提取 */
  authorId?: string;
  hostId?: string;
  tags?: string[];
  lobsterName?: string;
  timestamp: Date;
}

// userId -> 行为列表（按时间倒序，新的在前）
const userBehaviors = new Map<string, UserBehavior[]>();

// ── 持久化 ──────────────────────────────────────────────────────────────────

type SerializedBehavior = Omit<UserBehavior, 'timestamp'> & { timestamp: string };

function loadBehaviors(): void {
  try {
    if (!fs.existsSync(FILE)) return;
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Record<string, SerializedBehavior[]>;
    for (const [userId, list] of Object.entries(raw)) {
      userBehaviors.set(
        userId,
        list.map((b) => ({ ...b, timestamp: new Date(b.timestamp) })),
      );
    }
  } catch (e) {
    console.error('Failed to load user-behaviors:', e);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const obj: Record<string, SerializedBehavior[]> = {};
    userBehaviors.forEach((list, userId) => {
      obj[userId] = list.map((b) => ({ ...b, timestamp: b.timestamp.toISOString() }));
    });
    fsp.writeFile(FILE, JSON.stringify(obj, null, 2), 'utf-8').catch((e: unknown) => {
      console.error('Failed to save user-behaviors:', e);
    });
  }, 5000); // 5 秒防抖，合并高频写操作
}

loadBehaviors();

// ── 行为记录 ─────────────────────────────────────────────────────────────────

/**
 * 记录用户行为（隐式反馈）
 */
export function recordBehavior(behavior: Omit<UserBehavior, 'timestamp'>): void {
  const full: UserBehavior = { ...behavior, timestamp: new Date() };
  const list = userBehaviors.get(behavior.userId) || [];
  list.unshift(full);
  if (list.length > MAX_BEHAVIORS_PER_USER) {
    list.length = MAX_BEHAVIORS_PER_USER;
  }
  userBehaviors.set(behavior.userId, list);
  scheduleSave();
}

/**
 * 用户兴趣画像（基于行为统计，带时间衰减）
 * 参考快手 TWIN 等：近期行为权重更高
 */
export interface UserInterestProfile {
  preferredHosts: Map<string, number>;   // hostId -> 加权得分
  preferredAuthors: Map<string, number>; // authorId -> 加权得分
  preferredTags: Map<string, number>;    // tag -> 加权得分
  preferredLobsters: Map<string, number>; // lobsterName -> 加权得分（内容类型偏好）
  behaviorCount: number;
}

export function getUserInterestProfile(userId: string): UserInterestProfile {
  const profile: UserInterestProfile = {
    preferredHosts: new Map(),
    preferredAuthors: new Map(),
    preferredTags: new Map(),
    preferredLobsters: new Map(),
    behaviorCount: 0,
  };

  const list = userBehaviors.get(userId) || [];
  const now = Date.now();
  const decayFactor = (daysAgo: number) => Math.exp(-daysAgo / INTEREST_DECAY_DAYS);

  for (const b of list) {
    const daysAgo = (now - new Date(b.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const weight = decayFactor(daysAgo);

    // 行为类型权重：收藏 > 点赞 > 浏览（收藏意愿最强）
    const typeWeight =
      b.type === 'feed_post_collect' ? 3
      : b.type === 'feed_post_like' || b.type === 'work_like' ? 2
      : b.type === 'work_view' || b.type === 'feed_post_view' ? 1.2
      : 1;
    const score = weight * typeWeight;

    if (b.hostId) {
      profile.preferredHosts.set(b.hostId, (profile.preferredHosts.get(b.hostId) || 0) + score);
    }
    if (b.authorId) {
      profile.preferredAuthors.set(b.authorId, (profile.preferredAuthors.get(b.authorId) || 0) + score);
    }
    if (b.tags?.length) {
      for (const t of b.tags) {
        profile.preferredTags.set(t, (profile.preferredTags.get(t) || 0) + score);
      }
    }
    if (b.lobsterName) {
      profile.preferredLobsters.set(b.lobsterName, (profile.preferredLobsters.get(b.lobsterName) || 0) + score);
    }
    profile.behaviorCount++;
  }

  return profile;
}

/**
 * 取 Top-K 兴趣（用于个性化打分）
 */
function getTopK<K>(map: Map<K, number>, k: number): Map<K, number> {
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, k);
  return new Map(entries);
}

/**
 * 计算直播间的个性化加成系数（1.0 = 无加成，最高约 1.5）
 * 参考抖音： exploitation + exploration 平衡
 */
export function getLiveRoomPersonalizationBoost(
  hostId: string,
  profile: UserInterestProfile
): number {
  if (profile.behaviorCount < 3) return 1;
  const topHosts = getTopK(profile.preferredHosts, TOP_INTERESTS);
  const hostScore = topHosts.get(hostId) || 0;
  const maxScore = Math.max(...topHosts.values(), 1);
  const boost = 0.5 * (hostScore / maxScore); // 最多 +50%
  return 1 + boost;
}

/**
 * 计算 feed post 的个性化加成系数（基于作者偏好）
 * 作者匹配最多 +40%，总加成上限 40%
 */
export function getFeedPostPersonalizationBoost(
  authorId: string,
  profile: UserInterestProfile,
): number {
  if (profile.behaviorCount < 3) return 1;
  const topAuthors = getTopK(profile.preferredAuthors, TOP_INTERESTS);
  const authorScore = topAuthors.get(authorId) || 0;
  const maxAuthor = Math.max(...topAuthors.values(), 1);
  const boost = 0.4 * (authorScore / maxAuthor);
  return 1 + Math.min(boost, 0.4);
}

/**
 * 计算作品的个性化加成系数
 */
export function getWorkPersonalizationBoost(
  authorId: string,
  tags: string[],
  lobsterName: string,
  profile: UserInterestProfile
): number {
  if (profile.behaviorCount < 3) return 1;

  let boost = 0;
  const topAuthors = getTopK(profile.preferredAuthors, TOP_INTERESTS);
  const topTags = getTopK(profile.preferredTags, TOP_INTERESTS);
  const topLobsters = getTopK(profile.preferredLobsters, TOP_INTERESTS);

  const authorScore = topAuthors.get(authorId) || 0;
  const maxAuthor = Math.max(...topAuthors.values(), 1);
  boost += 0.3 * (authorScore / maxAuthor); // 作者匹配最多 +30%

  let tagMatch = 0;
  const tagSet = new Set(tags);
  for (const [tag, score] of topTags) {
    if (tagSet.has(tag)) tagMatch += score;
  }
  const maxTag = Math.max(...topTags.values(), 1);
  boost += 0.2 * Math.min(tagMatch / maxTag, 1); // 标签匹配最多 +20%

  const lobsterScore = topLobsters.get(lobsterName) || 0;
  const maxLobster = Math.max(...topLobsters.values(), 1);
  boost += 0.1 * (lobsterScore / maxLobster); // 龙虾类型最多 +10%

  return 1 + Math.min(boost, 0.5); // 总加成上限 50%
}

/** 人轨：某用户最近行为条数与按类型计数（用于管理端） */
export function getHumanBehaviorStatsForUser(userId: string): { total: number; byType: Record<string, number> } {
  const list = userBehaviors.get(userId) || [];
  const byType: Record<string, number> = {};
  for (const b of list) {
    byType[b.type] = (byType[b.type] || 0) + 1;
  }
  return { total: list.length, byType };
}

/** Agent 轨：某用户关联的虾米行为计数（用于管理端） */
export function getAgentBehaviorStatsForUser(userId: string): { total: number; byType: Record<string, number> } {
  const list = agentBehaviorList.filter((b) => b.ownerUserId === userId);
  const byType: Record<string, number> = {};
  for (const b of list) {
    byType[b.type] = (byType[b.type] || 0) + 1;
  }
  return { total: list.length, byType };
}
