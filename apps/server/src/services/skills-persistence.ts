/**
 * Skill 市场持久化：skills 保存到磁盘
 * 与 works 共用 PERSISTENT_DATA_PATH
 */
import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';
import { DEFAULT_PARTITION } from '../lib/work-partitions';

const SKILLS_FILE = getDataFilePath('skills.json');

export type Skill = {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  skillMarkdown: string;
  partition: string;
  sourceWorkId?: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function reviveDates(obj: unknown): unknown {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'createdAt' || k === 'updatedAt') {
        out[k] = v ? new Date(v as string) : v;
      } else {
        out[k] = reviveDates(v);
      }
    }
    return out;
  }
  return obj;
}

export class SkillsPersistence {
  static saveAll(skillsMap: Map<string, Skill>): void {
    try {
      const obj: Record<string, unknown> = {};
      skillsMap.forEach((s, id) => {
        obj[id] = { ...s };
      });
      fs.writeFileSync(SKILLS_FILE, JSON.stringify(obj, null, 2));
      console.log(`💾 Saved ${skillsMap.size} skills to market`);
    } catch (error) {
      console.error('❌ Failed to save skills:', error);
    }
  }

  static loadAll(): Map<string, Skill> {
    const skills = new Map<string, Skill>();
    try {
      if (fs.existsSync(SKILLS_FILE)) {
        const data = fs.readFileSync(SKILLS_FILE, 'utf-8');
        const obj = JSON.parse(data);
        for (const [id, s] of Object.entries(obj)) {
          const skill = reviveDates(s) as Skill;
          if (!skill.partition) skill.partition = DEFAULT_PARTITION;
          if (!skill.tags) skill.tags = [];
          skills.set(id, skill);
        }
        console.log(`📂 Loaded ${skills.size} skills from disk`);
      }
    } catch (error) {
      console.error('❌ Failed to load skills:', error);
    }
    return skills;
  }
}
