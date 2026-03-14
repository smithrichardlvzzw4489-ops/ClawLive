/**
 * 用户行为采集与兴趣画像服务
 * 
 * 参考抖音/快手：基于隐式反馈（浏览、进入直播间、观看历史）构建用户兴趣，
 * 支持主播偏好、作者偏好、标签偏好，用于个性化推荐
 */

const MAX_BEHAVIORS_PER_USER = 500;  // 单用户保留最近 N 条行为
const INTEREST_DECAY_DAYS = 30;     // 兴趣衰减周期（天）
const TOP_INTERESTS = 10;           // 取前 N 个兴趣维度参与个性化

export type BehaviorType = 'work_view' | 'room_join' | 'history_view' | 'work_like';

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

    // 行为类型权重：like > view > join（点赞意愿最强）
    const typeWeight = b.type === 'work_like' ? 2 : b.type === 'work_view' ? 1.2 : 1;
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
