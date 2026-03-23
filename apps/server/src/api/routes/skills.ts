/**
 * Skill 市场 API
 * 支持从作品上架、列表、详情、复制
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getHostInfo, getHostInfoBatch } from './rooms-simple';
import { SkillsPersistence, type Skill } from '../../services/skills-persistence';
import { isValidPartition, DEFAULT_PARTITION } from '../../lib/work-partitions';

const skills = new Map<string, Skill>();
const loaded = SkillsPersistence.loadAll();
loaded.forEach((s, k) => skills.set(k, s));

function saveSkills(): void {
  SkillsPersistence.saveAll(skills);
}

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

  // GET /api/skills - 列表，支持 partition、search
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { partition, search } = req.query;
      let list = Array.from(skills.values());

      if (partition && typeof partition === 'string' && isValidPartition(partition)) {
        list = list.filter((s) => s.partition === partition);
      }

      if (search && typeof search === 'string') {
        const q = search.toLowerCase().trim();
        list = list.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.description?.toLowerCase().includes(q) ||
            s.tags.some((t) => t.toLowerCase().includes(q))
        );
      }

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const authorIds = [...new Set(list.map((s) => s.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);

      const skillsList = list.map((skill) => {
        const author = authorMap.get(skill.authorId);
        return {
          id: skill.id,
          title: skill.title,
          description: skill.description,
          partition: skill.partition,
          sourceWorkId: skill.sourceWorkId,
          tags: skill.tags,
          viewCount: skill.viewCount,
          useCount: skill.useCount,
          createdAt: skill.createdAt,
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: skill.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      res.json({ skills: skillsList, total: skillsList.length });
    } catch (error) {
      console.error('Error fetching skills:', error);
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
  });

  // GET /api/skills/:skillId - 详情，增加 viewCount
  router.get('/:skillId', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;
      const skill = skills.get(skillId);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      skill.viewCount += 1;
      skill.updatedAt = new Date();
      saveSkills();

      const author = await getHostInfo(skill.authorId);
      res.json({
        ...skill,
        author: {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl,
        },
      });
    } catch (error) {
      console.error('Error fetching skill:', error);
      res.status(500).json({ error: 'Failed to fetch skill' });
    }
  });

  // POST /api/skills/:skillId/use - 复制时调用，增加 useCount
  router.post('/:skillId/use', async (req: Request, res: Response) => {
    try {
      const { skillId } = req.params;
      const skill = skills.get(skillId);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
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
