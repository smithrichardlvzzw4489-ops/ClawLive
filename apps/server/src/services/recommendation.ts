/**
 * 首页推荐算法服务
 *
 * 正在直播：热度 + 开播新鲜度 + 用户偏好（主播匹配）
 * 推荐作品：综合热度 + 时间衰减 + 用户偏好（作者/标签/类型）
 *
 * 参考抖音/快手：exploitation（兴趣匹配）与 exploration（多样性）平衡，
 * 新用户/冷启动用热度算法，有行为后加权个性化
 */

import { getHostInfoBatch, works } from '../api/routes/rooms-simple';
import { DEFAULT_PARTITION } from '../lib/work-partitions';
import { getAllRooms } from '../lib/rooms-store';
import { loadOfficialSkills } from './official-skills-loader';
import { SkillsPersistence } from './skills-persistence';
import {
  getUserInterestProfile,
  getLiveRoomPersonalizationBoost,
  getWorkPersonalizationBoost,
} from './user-behavior';

const LIVE_TOP_N = 8;
const WORKS_TOP_N = 40;
const MAX_WORKS_PER_AUTHOR = 999; // 暂不限制，单作者可生产大量内容
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
  resultSummary?: string;
  partition?: string;
  lobsterName: string;
  coverImage?: string;
  videoUrl?: string;
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
 * 获取首页推荐的正在直播房间（支持用户个性化，支持 Redis 多实例）
 */
export async function getRecommendedLiveRooms(userId?: string): Promise<RoomWithScore[]> {
  const profile = userId ? getUserInterestProfile(userId) : null;
  const hasEnoughBehavior = profile && profile.behaviorCount >= 3;

  const allRooms = await getAllRooms();
  const liveList = allRooms.filter(r => r.isLive);
  const hostIds = [...new Set(liveList.map(r => r.hostId))];
  const hostMap = await getHostInfoBatch(hostIds);

  const liveRooms = liveList.map(room => {
    const host = hostMap.get(room.hostId);
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
export async function getRecommendedWorks(userId?: string): Promise<WorkWithScore[]> {
  const profile = userId ? getUserInterestProfile(userId) : null;
  const hasEnoughBehavior = profile && profile.behaviorCount >= 3;

  const publishedList = Array.from(works.values()).filter(w => w.status === 'published');
  const authorIds = [...new Set(publishedList.map(w => w.authorId))];
  const authorMap = await getHostInfoBatch(authorIds);

  const publishedWorks = publishedList.map(work => {
    const author = authorMap.get(work.authorId);
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
      resultSummary: work.resultSummary,
      partition: work.partition || DEFAULT_PARTITION,
      lobsterName: work.lobsterName,
      coverImage: work.coverImage,
      videoUrl: work.videoUrl,
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

const SKILLS_TOP_N = 6;

/**
 * 获取首页推荐的 Skill（官方 + 热门用户 Skill）
 */
export async function getRecommendedSkills(): Promise<
  Array<{
    id: string;
    title: string;
    description?: string;
    partition: string;
    sourceType: 'official' | 'user-work' | 'user-direct';
    tags: string[];
    viewCount: number;
    useCount: number;
    author: { id: string; username: string; avatarUrl?: string | null };
  }>
> {
  const skillsMap = SkillsPersistence.loadAll();
  const officialList = loadOfficialSkills();
  const result: Array<{
    id: string;
    title: string;
    description?: string;
    partition: string;
    sourceType: 'official' | 'user-work' | 'user-direct';
    tags: string[];
    viewCount: number;
    useCount: number;
    author: { id: string; username: string; avatarUrl?: string | null };
  }> = [];

  for (const s of officialList.slice(0, 3)) {
    result.push({
      id: s.id,
      title: s.title,
      description: s.description,
      partition: s.partition || DEFAULT_PARTITION,
      sourceType: 'official',
      tags: s.tags || [],
      viewCount: 0,
      useCount: 0,
      author: { id: 'official', username: '官方', avatarUrl: null },
    });
  }

  const userSkills = Array.from(skillsMap.values())
    .sort((a, b) => b.viewCount + b.useCount * 2 - (a.viewCount + a.useCount * 2))
    .slice(0, SKILLS_TOP_N - result.length);

  const authorIds = [...new Set(userSkills.map((s) => s.authorId))];
  const authorMap = await getHostInfoBatch(authorIds);

  for (const s of userSkills) {
    const author = authorMap.get(s.authorId);
    result.push({
      id: s.id,
      title: s.title,
      description: s.description,
      partition: s.partition || DEFAULT_PARTITION,
      sourceType: s.sourceWorkId ? 'user-work' : 'user-direct',
      tags: s.tags || [],
      viewCount: s.viewCount,
      useCount: s.useCount,
      author: author
        ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl ?? null }
        : { id: s.authorId, username: 'Unknown', avatarUrl: null },
    });
  }

  return result.slice(0, SKILLS_TOP_N);
}
