/**
 * Skill 市场 API
 * 支持：官方推荐（配置文件）、用户添加（作品/直接）
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getHostInfo, getHostInfoBatch } from './rooms-simple';
import { SkillsPersistence, type Skill } from '../../services/skills-persistence';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { isValidPartition, DEFAULT_PARTITION } from '../../lib/work-partitions';

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

  // GET /api/skills - 列表，支持 sourceType、partition、search
  // sourceType: official | user | user-work | user-direct | all
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { partition, search, sourceType } = req.query;
      const wantOfficial = !['user', 'user-work', 'user-direct'].includes(String(sourceType || ''));
      const wantUser = !['official'].includes(String(sourceType || ''));
      const userFilter = sourceType === 'user-work' ? 'user-work' : sourceType === 'user-direct' ? 'user-direct' : null;

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
          author: OFFICIAL_AUTHOR,
        });
      }

      const skill = skills.get(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });

      skill.viewCount += 1;
      skill.updatedAt = new Date();
      saveSkills();

      const author = await getHostInfo(skill.authorId);
      res.json({
        ...skill,
        sourceType: getSourceType(skill),
        author: {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl ?? undefined,
        },
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
