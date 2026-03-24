/**
 * Skill 市场 API
 * 支持：官方推荐（配置文件）、用户添加（作品/直接）、Skill AI 健康检测
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getHostInfo, getHostInfoBatch, userProfiles } from './rooms-simple';
import { getFollowerCount } from '../../services/user-follows';
import { CommunityPersistence } from '../../services/community-persistence';
import { SkillsPersistence, type Skill } from '../../services/skills-persistence';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { isValidPartition, DEFAULT_PARTITION } from '../../lib/work-partitions';
import { checkSkillHealth } from '../../services/skill-health-check';

export type SkillSourceType = 'official' | 'user-work' | 'user-direct';

const skills = new Map<string, Skill>();
const loaded = SkillsPersistence.loadAll();
loaded.forEach((s, k) => skills.set(k, s));

function saveSkills(): void {
  SkillsPersistence.saveAll(skills);
}

function getSourceType(skill: Skill): SkillSourceType {
  if (skill.id.startsWith('official-')) return 'official';
  return skill.sourceWorkId ? 'user-work' : 'user-direct';
}

const OFFICIAL_AUTHOR = { id: 'official', username: '官方', avatarUrl: undefined };

export function createSkillFromWork(params: {
  authorId: string;
  title: string;
  description?: string;
  skillMarkdown: string;
  partition: string;
  sourceWorkId: string;
  tags?: string[];
}): Skill {
  const id = `skill-${uuidv4().slice(0, 8)}`;
  const now = new Date();
  const skill: Skill = {
    id,
    authorId: params.authorId,
    title: params.title,
    description: params.description,
    skillMarkdown: params.skillMarkdown,
    partition: isValidPartition(params.partition) ? params.partition : DEFAULT_PARTITION,
    sourceWorkId: params.sourceWorkId,
    tags: params.tags || [],
    viewCount: 0,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  skills.set(id, skill);
  saveSkills();
  console.log(`📦 Skill listed to market: ${id} from work ${params.sourceWorkId}`);
  return skill;
}

export function skillsRoutes(): Router {
  const router = Router();

  // GET /api/skills - 列表，支持 sourceType、partition、search、tags
  // sourceType: official | user | user-work | user-direct | all
  // tags: 逗号分隔，筛选包含任一标签的 Skill
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { partition, search, sourceType, tags: tagsParam, authorId: authorIdParam, sourceWorkId: sourceWorkIdParam } = req.query;
      const filterByAuthor = authorIdParam && typeof authorIdParam === 'string' && authorIdParam.trim();
      const filterBySourceWork = sourceWorkIdParam && typeof sourceWorkIdParam === 'string' && sourceWorkIdParam.trim();
      const wantOfficial = !filterByAuthor && !filterBySourceWork && !['user', 'user-work', 'user-direct'].includes(String(sourceType || ''));
      const wantUser = !['official'].includes(String(sourceType || '')) || filterByAuthor || filterBySourceWork;
      const userFilter = sourceType === 'user-work' ? 'user-work' : sourceType === 'user-direct' ? 'user-direct' : null;
      const filterTags: string[] =
        typeof tagsParam === 'string' && tagsParam.trim()
          ? tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
          : [];
      const matchesTags = (skillTags: string[]) => {
        if (filterTags.length === 0) return true;
        const lower = skillTags.map((t) => t.toLowerCase());
        return filterTags.some((ft) => lower.includes(ft));
      };

      const result: Array<{
        id: string;
        title: string;
        description?: string;
        partition: string;
        sourceType: SkillSourceType;
        sourceWorkId?: string;
        tags: string[];
        viewCount: number;
        useCount: number;
        createdAt: string;
        author: { id: string; username: string; avatarUrl?: string };
      }> = [];

      if (wantOfficial) {
        const officialList = loadOfficialSkills();
        for (const s of officialList) {
          if (partition && typeof partition === 'string' && isValidPartition(partition) && s.partition !== partition) continue;
          if (search && typeof search === 'string') {
            const q = search.toLowerCase().trim();
            if (
              !s.title.toLowerCase().includes(q) &&
              !s.description?.toLowerCase().includes(q) &&
              !(s.tags || []).some((t) => t.toLowerCase().includes(q))
            ) continue;
          }
          if (!matchesTags(s.tags || [])) continue;
          result.push({
            id: s.id,
            title: s.title,
            description: s.description,
            partition: s.partition,
            sourceType: 'official',
            tags: s.tags || [],
            viewCount: 0,
            useCount: 0,
            createdAt: new Date(0).toISOString(),
            author: OFFICIAL_AUTHOR,
          });
        }
      }

      if (wantUser) {
        let userList = Array.from(skills.values());
        if (partition && typeof partition === 'string' && isValidPartition(partition)) {
          userList = userList.filter((s) => s.partition === partition);
        }
        if (search && typeof search === 'string') {
          const q = search.toLowerCase().trim();
          userList = userList.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.description?.toLowerCase().includes(q) ||
              s.tags.some((t) => t.toLowerCase().includes(q))
          );
        }
        if (userFilter) {
          userList = userList.filter((s) => getSourceType(s) === userFilter);
        }
        if (filterTags.length > 0) {
          userList = userList.filter((s) => matchesTags(s.tags));
        }
        if (authorIdParam && typeof authorIdParam === 'string' && authorIdParam.trim()) {
          userList = userList.filter((s) => s.authorId === authorIdParam.trim());
        }
        if (filterBySourceWork) {
          userList = userList.filter((s) => s.sourceWorkId === sourceWorkIdParam!.trim());
        }
        userList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const authorIds = [...new Set(userList.map((s) => s.authorId))];
        const authorMap = await getHostInfoBatch(authorIds);

        for (const skill of userList) {
          const author = authorMap.get(skill.authorId);
          result.push({
            id: skill.id,
            title: skill.title,
            description: skill.description,
            partition: skill.partition,
            sourceType: getSourceType(skill),
            sourceWorkId: skill.sourceWorkId,
            tags: skill.tags,
            viewCount: skill.viewCount,
            useCount: skill.useCount,
            createdAt: skill.createdAt.toISOString(),
            author: author
              ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl ?? undefined }
              : { id: skill.authorId, username: 'Unknown', avatarUrl: undefined },
          });
        }
      }

      res.json({ skills: result, total: result.length });
    } catch (error) {
      console.error('Error fetching skills:', error);
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
  });

  // GET /api/skills/tags - 返回所有 Skill 使用的标签（去重）
  router.get('/tags', async (_req: Request, res: Response) => {
    try {
      const officialList = loadOfficialSkills();
      const tags = new Set<string>();
      for (const s of officialList) {
        (s.tags || []).forEach((t) => t.trim() && tags.add(t));
      }
      for (const s of skills.values()) {
        s.tags.forEach((t) => t.trim() && tags.add(t));
      }
      res.json({ tags: Array.from(tags).sort() });
    } catch (error) {
      console.error('Error fetching skill tags:', error);
      res.status(500).json({ error: 'Failed to fetch tags' });
    }
  });

  // POST /api/skills/health-check - Skill AI 健康检测（平台 Skill / 外部链接 / 直接文本）
  router.post('/health-check', async (req: Request, res: Response) => {
    try {
      const { content, url, skillId } = req.body || {};
      let text = '';

      if (content && typeof content === 'string') {
        text = content.trim();
      } else if (url && typeof url === 'string') {
        const targetUrl = url.trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
          return res.status(400).json({ error: 'URL must start with http:// or https://' });
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'ClawLive-SkillHealthCheck/1.0' },
          });
          clearTimeout(timeout);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const body = await resp.text();
          if (body.length > 500000) {
            return res.status(400).json({ error: 'Content too large (max 500KB)' });
          }
          text = body;
        } catch (err) {
          console.warn('[SkillHealthCheck] Fetch URL failed:', targetUrl, err);
          return res.status(400).json({ error: 'Failed to fetch URL' });
        }
      } else if (skillId && typeof skillId === 'string') {
        const id = skillId.trim();
        if (id.startsWith('official-')) {
          const officialList = loadOfficialSkills();
          const o = officialList.find((s) => s.id === id);
          if (!o) return res.status(404).json({ error: 'Skill not found' });
          text = o.skillMarkdown || '';
        } else {
          const skill = skills.get(id);
          if (!skill) return res.status(404).json({ error: 'Skill not found' });
          text = skill.skillMarkdown || '';
        }
      } else {
        return res.status(400).json({ error: 'Provide content, url, or skillId' });
      }

      if (!text) {
        return res.status(400).json({ error: 'No content to check' });
      }

      const result = checkSkillHealth(text);
      res.json(result);
    } catch (error) {
      console.error('Skill health check error:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  });

  // GET /api/skills/:skillId/discussions - 与该能力流关联的社区帖子
  router.get('/:skillId/discussions', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;
      const allPosts = CommunityPersistence.loadPosts();
      const filtered = Array.from(allPosts.values())
        .filter((p) => p.skillId === skillId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
      const authorIds = [...new Set(filtered.map((p) => p.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);
      const result = filtered.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        content: p.content,
        tags: p.tags,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        author: (() => {
          const a = authorMap.get(p.authorId);
          return a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl ?? undefined } : { id: p.authorId, username: 'Unknown', avatarUrl: undefined };
        })(),
      }));
      res.json({ posts: result });
    } catch (error) {
      console.error('Error fetching skill discussions:', error);
      res.status(500).json({ error: 'Failed to fetch discussions' });
    }
  });

  // GET /api/skills/:skillId/related - 同类能力流 + 创作者其它能力
  router.get('/:skillId/related', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;
      const limit = Math.min(12, parseInt(String(req.query.limit || 6), 10) || 6);
      const isOfficial = skillId.startsWith('official-');
      const targetSkill = isOfficial ? null : skills.get(skillId);
      const targetOfficial = isOfficial ? loadOfficialSkills().find((s) => s.id === skillId) : null;
      const target = targetSkill || targetOfficial;
      if (!target) return res.status(404).json({ error: 'Skill not found' });
      const partition = target.partition;
      const targetTags = target.tags || [];
      const authorId = targetSkill ? targetSkill.authorId : undefined;

      const similar: Array<{ id: string; title: string; description?: string; partition: string; viewCount: number; useCount: number; author: { id: string; username: string; avatarUrl?: string } }> = [];
      const officialList = loadOfficialSkills().filter((s) => s.id !== skillId);
      const userList = Array.from(skills.values()).filter((s) => s.id !== skillId);
      const byPartitionOrTags = (s: { partition: string; tags?: string[] }) =>
        s.partition === partition || (s.tags || []).some((t) => targetTags.some((tt) => tt.toLowerCase() === t.toLowerCase()));
      for (const s of officialList) {
        if (similar.length >= limit) break;
        if (byPartitionOrTags(s)) {
          similar.push({
            id: s.id,
            title: s.title,
            description: s.description,
            partition: s.partition,
            viewCount: 0,
            useCount: 0,
            author: OFFICIAL_AUTHOR,
          });
        }
      }
      for (const s of userList) {
        if (similar.length >= limit) break;
        if (byPartitionOrTags(s)) {
          const author = await getHostInfo(s.authorId);
          similar.push({
            id: s.id,
            title: s.title,
            description: s.description,
            partition: s.partition,
            viewCount: s.viewCount,
            useCount: s.useCount,
            author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl ?? undefined },
          });
        }
      }

      let authorOtherSkills: typeof similar = [];
      if (authorId) {
        const others = Array.from(skills.values())
          .filter((s) => s.authorId === authorId && s.id !== skillId)
          .sort((a, b) => (b.viewCount + b.useCount * 2) - (a.viewCount + a.useCount * 2))
          .slice(0, 6);
        const authorInfo = await getHostInfo(authorId);
        authorOtherSkills = others.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          partition: s.partition,
          viewCount: s.viewCount,
          useCount: s.useCount,
          author: { id: authorInfo.id, username: authorInfo.username, avatarUrl: authorInfo.avatarUrl ?? undefined },
        }));
      }
      res.json({ similarSkills: similar.slice(0, limit), authorOtherSkills });
    } catch (error) {
      console.error('Error fetching related skills:', error);
      res.status(500).json({ error: 'Failed to fetch related skills' });
    }
  });

  // GET /api/skills/:skillId - 详情；用户 Skill 增加 viewCount，官方 Skill 不统计
  router.get('/:skillId', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;

      if (skillId.startsWith('official-')) {
        const officialList = loadOfficialSkills();
        const o = officialList.find((s) => s.id === skillId);
        if (!o) return res.status(404).json({ error: 'Skill not found' });
        return res.json({
          ...o,
          viewCount: 0,
          useCount: 0,
          updatedAt: new Date(),
          author: OFFICIAL_AUTHOR,
          authorTagline: undefined,
          authorFollowerCount: 0,
          discussionCount: 0,
        });
      }

      const skill = skills.get(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });

      skill.viewCount += 1;
      skill.updatedAt = new Date();
      saveSkills();

      const author = await getHostInfo(skill.authorId);
      const bio = userProfiles.get(skill.authorId)?.bio;
      const tagline = bio ? (bio.includes('\n') ? bio.split('\n')[0].trim() : bio.trim()).slice(0, 80) : undefined;
      const followerCount = getFollowerCount(skill.authorId);
      const allPosts = CommunityPersistence.loadPosts();
      const discussionCount = Array.from(allPosts.values()).filter((p) => p.skillId === skillId).length;

      res.json({
        ...skill,
        sourceType: getSourceType(skill),
        author: {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl ?? undefined,
        },
        authorTagline: tagline,
        authorFollowerCount: followerCount,
        discussionCount,
      });
    } catch (error) {
      console.error('Error fetching skill:', error);
      res.status(500).json({ error: 'Failed to fetch skill' });
    }
  });

  // POST /api/skills/:skillId/use - 复制时调用，增加 useCount（官方 Skill 不统计）
  router.post('/:skillId/use', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;
      if (skillId.startsWith('official-')) {
        return res.json({ success: true, useCount: 0 });
      }
      const skill = skills.get(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      skill.useCount += 1;
      skill.updatedAt = new Date();
      saveSkills();
      res.json({ success: true, useCount: skill.useCount });
    } catch (error) {
      console.error('Error recording skill use:', error);
      res.status(500).json({ error: 'Failed to record use' });
    }
  });

  // POST /api/skills - 单独创建 Skill（无作品来源）
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, description, skillMarkdown, partition, tags } = req.body || {};

      if (!title?.trim() || !skillMarkdown?.trim()) {
        return res.status(400).json({ error: 'title 和 skillMarkdown 必填' });
      }

      const id = `skill-${uuidv4().slice(0, 8)}`;
      const now = new Date();
      const skill: Skill = {
        id,
        authorId: userId,
        title: String(title).trim(),
        description: description?.trim() || undefined,
        skillMarkdown: String(skillMarkdown).trim(),
        partition: isValidPartition(partition) ? partition : DEFAULT_PARTITION,
        tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [],
        viewCount: 0,
        useCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      skills.set(id, skill);
      saveSkills();

      console.log(`📦 Skill created by user ${userId}: ${id}`);
      res.status(201).json(skill);
    } catch (error) {
      console.error('Error creating skill:', error);
      res.status(500).json({ error: 'Failed to create skill' });
    }
  });

  return router;
}
