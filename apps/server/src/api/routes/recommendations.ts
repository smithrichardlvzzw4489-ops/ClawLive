import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getRecommendedLiveRooms, getRecommendedWorks, getRecommendedSkills } from '../../services/recommendation';
import { CommunityPersistence } from '../../services/community-persistence';
import { getHostInfoBatch } from './rooms-simple';
import { getFollowerCount } from '../../services/user-follows';
import { SkillsPersistence } from '../../services/skills-persistence';
import { works } from './rooms-simple';
import { getFeedPostsScoredByCES, getFeedPostsMap } from '../../services/feed-posts-store';
import { getUserInterestProfile, getFeedPostPersonalizationBoost } from '../../services/user-behavior';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function recommendationRoutes(): Router {
  const router = Router();

  /**
   * GET /api/recommendations/home
   * 首页推荐：直播、作品、能力流、最新问题、资讯、热门创作者、热门讨论
   */
  router.get('/home', async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
          userId = decoded.userId;
        } catch (_) {}
      }

      const posts = CommunityPersistence.loadPosts();
      const allPosts = Array.from(posts.values());
      const news = CommunityPersistence.loadNews();
      const skillsMap = SkillsPersistence.loadAll();

      const [liveRooms, recommendedWorks, recommendedSkills] = await Promise.all([
        getRecommendedLiveRooms(userId),
        getRecommendedWorks(userId),
        getRecommendedSkills(),
      ]);

      const latestQuestions = allPosts
        .filter((p) => p.type === 'question')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6);
      const authorIdsQ = [...new Set(latestQuestions.map((p) => p.authorId))];
      const authorMapQ = await getHostInfoBatch(authorIdsQ);
      const questionsWithAuthor = latestQuestions.map((p) => {
        const a = authorMapQ.get(p.authorId);
        return {
          id: p.id,
          type: p.type,
          title: p.title,
          content: p.content,
          tags: p.tags,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          solved: p.solved,
          createdAt: p.createdAt,
          author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      const authorPostCount = new Map<string, number>();
      allPosts.forEach((p) => authorPostCount.set(p.authorId, (authorPostCount.get(p.authorId) || 0) + 1));
      const hotAuthorIds = Array.from(authorPostCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);
      const hotCreatorsMap = await getHostInfoBatch(hotAuthorIds);
      const hotCreators = hotAuthorIds.map((id) => {
        const author = hotCreatorsMap.get(id);
        const postCount = authorPostCount.get(id) || 0;
        const workCount = Array.from(works.values()).filter((w) => w.authorId === id && w.status === 'published').length;
        const skillCount = Array.from(skillsMap.values()).filter((s) => s.authorId === id).length;
        const followerCount = getFollowerCount(id);
        return author
          ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl, postCount, workCount, skillCount, followerCount }
          : { id, username: 'Unknown', avatarUrl: null, postCount: 0, workCount: 0, skillCount: 0, followerCount: 0 };
      });

      const hotDiscussions = allPosts
        .sort((a, b) => (b.likeCount + b.commentCount * 2 + Math.log1p(b.viewCount)) - (a.likeCount + a.commentCount * 2 + Math.log1p(a.viewCount)))
        .slice(0, 6);
      const authorIdsD = [...new Set(hotDiscussions.map((p) => p.authorId))];
      const authorMapD = await getHostInfoBatch(authorIdsD);
      const discussionsWithAuthor = hotDiscussions.map((p) => {
        const a = authorMapD.get(p.authorId);
        return {
          id: p.id,
          type: p.type,
          title: p.title,
          content: p.content,
          tags: p.tags,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      // ── Feed posts：CES + 时间衰减 + 个性化 + 多样性 ───────────────────────
      const FEED_CANDIDATES = 100; // 候选池
      const FEED_RESULT = 40;      // 最终返回条数
      const MAX_PER_AUTHOR = 2;   // 同作者最多出现次数（多样性控制）

      const profile = userId ? getUserInterestProfile(userId) : null;
      const hasEnoughBehavior = profile && profile.behaviorCount >= 3;

      // 1. CES 打分排序（已含时间衰减 + 黄金时段）
      const cesCandidates = getFeedPostsScoredByCES().slice(0, FEED_CANDIDATES);

      // 2. 叠加个性化加成
      const scored = cesCandidates.map(({ post, score }) => {
        const personalBoost =
          hasEnoughBehavior && profile
            ? getFeedPostPersonalizationBoost(post.authorId, profile)
            : 1;
        return { post, finalScore: score * personalBoost };
      });
      scored.sort((a, b) => b.finalScore - a.finalScore);

      // 3. 多样性去重：同一作者最多 MAX_PER_AUTHOR 条
      const authorCount = new Map<string, number>();
      const diverseSlice = scored
        .filter(({ post }) => {
          const cnt = authorCount.get(post.authorId) ?? 0;
          if (cnt >= MAX_PER_AUTHOR) return false;
          authorCount.set(post.authorId, cnt + 1);
          return true;
        })
        .slice(0, FEED_RESULT);

      const feedAuthorIds = [...new Set(diverseSlice.map(({ post }) => post.authorId))];
      const feedAuthorMap = await getHostInfoBatch(feedAuthorIds);
      const feedPosts = diverseSlice.map(({ post: p }) => {
        const a = feedAuthorMap.get(p.authorId);
        return {
          id: p.id,
          kind: p.kind ?? 'article',
          title: p.title,
          content: p.content,
          excerpt: p.excerpt,
          imageUrls: p.imageUrls,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          favoriteCount: p.favoriteCount ?? 0,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          publishedByAgent: p.publishedByAgent ?? false,
          author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      const totalPublishedWorks = Array.from(works.values()).filter(
        (w) => w.status === 'published',
      ).length;
      const totalFeedPosts = getFeedPostsMap().size;

      res.json({
        liveRooms: liveRooms.map(({ score, ...r }) => r),
        recommendedWorks: recommendedWorks.map(({ score, ...w }) => w),
        totalWorks: totalPublishedWorks,
        totalFeedPosts,
        recommendedSkills,
        latestQuestions: questionsWithAuthor,
        news: news.slice(0, 5),
        hotCreators,
        hotDiscussions: discussionsWithAuthor,
        feedPosts,
      });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  return router;
}
