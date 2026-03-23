/**
 * 官方 Skill 配置文件加载
 * 路径优先级：PERSISTENT_DATA_PATH/official-skills.json > 项目 data/official-skills.json
 * 编辑配置后需重启服务生效
 */
import * as fs from 'fs';
import * as path from 'path';
import { getDataFilePath } from '../lib/data-path';
import { isValidPartition, DEFAULT_PARTITION } from '../lib/work-partitions';

export interface OfficialSkillItem {
  id: string;
  title: string;
  description?: string;
  skillMarkdown: string;
  partition: string;
  tags?: string[];
  sortOrder?: number;
}

const OFFICIAL_PREFIX = 'official-';

function getConfigPaths(): string[] {
  const dataPath = getDataFilePath('official-skills.json');
  const repoPath = path.join(process.cwd(), 'data', 'official-skills.json');
  return [dataPath, repoPath];
}

export function loadOfficialSkills(): OfficialSkillItem[] {
  for (const p of getConfigPaths()) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        const skills: OfficialSkillItem[] = [];
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          if (!item?.id || !item?.title || !item?.skillMarkdown) {
            console.warn(`[OfficialSkills] 跳过无效项 index=${i}`);
            continue;
          }
          const id = String(item.id).startsWith(OFFICIAL_PREFIX)
            ? String(item.id)
            : `${OFFICIAL_PREFIX}${item.id}`;
          skills.push({
            id,
            title: String(item.title).trim(),
            description: item.description ? String(item.description).trim() : undefined,
            skillMarkdown: String(item.skillMarkdown).trim(),
            partition: isValidPartition(item.partition) ? item.partition : DEFAULT_PARTITION,
            tags: Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === 'string') : [],
            sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : i,
          });
        }
        console.log(`📂 Loaded ${skills.length} official skills from ${p}`);
        return skills.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      }
    } catch (err) {
      console.warn(`[OfficialSkills] 读取 ${p} 失败:`, err);
    }
  }
  return [];
}
