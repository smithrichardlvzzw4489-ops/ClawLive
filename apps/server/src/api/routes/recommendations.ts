import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getRecommendedLiveRooms, getRecommendedWorks, getRecommendedSkills } from '../../services/recommendation';
import { CommunityPersistence } from '../../services/community-persistence';
import { getHostInfoBatch } from './rooms-simple';
import { getFollowerCount } from '../../services/user-follows';
import { SkillsPersistence } from '../../services/skills-persistence';
import { works } from './rooms-simple';
import { getFeedPostsSortedNewest } from '../../services/feed-posts-store';

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

      const feedSlice = getFeedPostsSortedNewest().slice(0, 12);
      const feedAuthorIds = [...new Set(feedSlice.map((p) => p.authorId))];
      const feedAuthorMap = await getHostInfoBatch(feedAuthorIds);
      const feedPosts = feedSlice.map((p) => {
        const a = feedAuthorMap.get(p.authorId);
        return {
          id: p.id,
          kind: p.kind ?? 'article',
          title: p.title,
          content: p.content,
          imageUrls: p.imageUrls,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      res.json({
        liveRooms: liveRooms.map(({ score, ...r }) => r),
        recommendedWorks: recommendedWorks.map(({ score, ...w }) => w),
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
