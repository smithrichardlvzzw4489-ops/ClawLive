/**
 * 首页推荐算法服务
 *
 * 正在直播：热度 + 开播新鲜度 + 用户偏好（主播匹配）
 * 推荐作品：综合热度 + 时间衰减 + 用户偏好（作者/标签/类型）
 *
 * 参考抖音/快手：exploitation（兴趣匹配）与 exploration（多样性）平衡，
 * 新用户/冷启动用热度算法，有行为后加权个性化
 */

import { roomInfo, userProfiles, works } from '../api/routes/rooms-simple';
import {
  getUserInterestProfile,
  getLiveRoomPersonalizationBoost,
  getWorkPersonalizationBoost,
} from './user-behavior';

const LIVE_TOP_N = 8;
const WORKS_TOP_N = 12;
const MAX_WORKS_PER_AUTHOR = 2;
const PERSONALIZATION_WEIGHT = 0.4; // 个性化占总分的 40%，避免信息茧房

interface RoomWithScore {
  id: string;
  title: string;
  lobsterName: string;
  description?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt?: Date;
  host: { id: string; username: string; avatarUrl?: string | null };
  score: number;
}

interface WorkWithScore {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  coverImage?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt?: Date;
  author: { id: string; username: string; avatarUrl?: string | null };
  score: number;
}

function scoreLiveRoom(room: {
  viewerCount: number;
  startedAt?: Date;
}): number {
  const viewerScore = Math.log1p(room.viewerCount) * 10;
  let recencyBonus = 0;
  if (room.startedAt) {
    const minutesAgo = (Date.now() - new Date(room.startedAt).getTime()) / 60000;
    recencyBonus = Math.max(0, 120 - minutesAgo);
  }
  return viewerScore + recencyBonus;
}

function scoreWork(work: {
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt?: Date;
}): number {
  const engagement = work.viewCount + work.likeCount * 3 + work.messageCount * 0.5;
  const hoursSincePublish = work.publishedAt
    ? (Date.now() - new Date(work.publishedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  const decay = Math.pow(hoursSincePublish / 24 + 2, 1.2);
  const baseScore = Math.max(engagement, 1) / decay;
  const daysSincePublish = hoursSincePublish / 24;
  const noveltyBonus = daysSincePublish < 7 ? 1 + (7 - daysSincePublish) * 0.1 : 1;
  return baseScore * noveltyBonus;
}

/**
 * 获取首页推荐的正在直播房间（支持用户个性化）
 */
export function getRecommendedLiveRooms(userId?: string): RoomWithScore[] {
  const profile = userId ? getUserInterestProfile(userId) : null;
  const hasEnoughBehavior = profile && profile.behaviorCount >= 3;

  const liveRooms = Array.from(roomInfo.values())
    .filter(r => r.isLive)
    .map(room => {
      const host = userProfiles.get(room.hostId);
      let baseScore = scoreLiveRoom(room);

      let personalBoost = 1;
      if (hasEnoughBehavior && profile) {
        personalBoost = getLiveRoomPersonalizationBoost(room.hostId, profile);
      }
      // 混合：60% 热度 + 40% 个性化加成（避免过度个性化）
      const finalScore = baseScore * (1 - PERSONALIZATION_WEIGHT + PERSONALIZATION_WEIGHT * personalBoost);

      return {
        id: room.id,
        title: room.title,
        lobsterName: room.lobsterName,
        description: room.description,
        viewerCount: room.viewerCount,
        isLive: room.isLive,
        startedAt: room.startedAt,
        host: host
          ? { id: host.id, username: host.username, avatarUrl: host.avatarUrl }
          : { id: room.hostId, username: 'Unknown', avatarUrl: null },
        score: finalScore,
      };
    });

  liveRooms.sort((a, b) => b.score - a.score);
  return liveRooms.slice(0, LIVE_TOP_N).map(({ score, ...rest }) => ({ ...rest, score }));
}

/**
 * 获取首页推荐作品（支持用户个性化）
 */
export function getRecommendedWorks(userId?: string): WorkWithScore[] {
  const profile = userId ? getUserInterestProfile(userId) : null;
  const hasEnoughBehavior = profile && profile.behaviorCount >= 3;

  const publishedWorks = Array.from(works.values())
    .filter(w => w.status === 'published')
    .map(work => {
      const author = userProfiles.get(work.authorId);
      let baseScore = scoreWork({
        viewCount: work.viewCount,
        likeCount: work.likeCount,
        messageCount: work.messages?.length ?? 0,
        publishedAt: work.publishedAt,
      });

      let personalBoost = 1;
      if (hasEnoughBehavior && profile) {
        personalBoost = getWorkPersonalizationBoost(
          work.authorId,
          work.tags || [],
          work.lobsterName,
          profile
        );
      }
      const finalScore = baseScore * (1 - PERSONALIZATION_WEIGHT + PERSONALIZATION_WEIGHT * personalBoost);

      return {
        id: work.id,
        title: work.title,
        description: work.description,
        lobsterName: work.lobsterName,
        coverImage: work.coverImage,
        tags: work.tags || [],
        viewCount: work.viewCount,
        likeCount: work.likeCount,
        messageCount: work.messages?.length ?? 0,
        publishedAt: work.publishedAt,
        author: author
          ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
          : { id: work.authorId, username: 'Unknown', avatarUrl: null },
        score: finalScore,
      };
    });

  publishedWorks.sort((a, b) => b.score - a.score);

  const authorCount = new Map<string, number>();
  const result: WorkWithScore[] = [];
  for (const work of publishedWorks) {
    if (result.length >= WORKS_TOP_N) break;
    const count = authorCount.get(work.author.id) ?? 0;
    if (count < MAX_WORKS_PER_AUTHOR) {
      result.push(work);
      authorCount.set(work.author.id, count + 1);
    }
  }

  return result.map(({ score, ...rest }) => ({ ...rest, score }));
}
