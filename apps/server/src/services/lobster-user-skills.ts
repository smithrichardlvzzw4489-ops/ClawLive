/**
 * 虾米 — 用户级 Skill 安装（每位用户独立的技能扩展）
 * 持久化：PostgreSQL（Railway），启动时载入内存缓存。
 */
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';

export interface UserInstalledSkill {
  skillId: string;
  title: string;
  description: string;
  skillMarkdown: string;
  source: 'platform' | 'web-learned';
  installedAt: string;
}

const cache = new Map<string, Map<string, UserInstalledSkill>>();

export async function bootstrapUserSkillsFromPostgres(): Promise<void> {
  cache.clear();
  const rows = await prisma.userInstalledSkill.findMany();
  for (const r of rows) {
    let m = cache.get(r.userId);
    if (!m) {
      m = new Map();
      cache.set(r.userId, m);
    }
    m.set(r.skillId, {
      skillId: r.skillId,
      title: r.title,
      description: r.description,
      skillMarkdown: r.skillMarkdown,
      source: r.source as UserInstalledSkill['source'],
      installedAt: r.installedAt.toISOString(),
    });
  }
  console.log(`[Lobster] Loaded ${rows.length} user skill row(s) from PostgreSQL`);
}

function ensureUserMap(userId: string): Map<string, UserInstalledSkill> {
  let m = cache.get(userId);
  if (!m) {
    m = new Map();
    cache.set(userId, m);
  }
  return m;
}

/** 获取用户已安装的所有技能 */
export function getUserInstalledSkills(userId: string): UserInstalledSkill[] {
  return Array.from(ensureUserMap(userId).values());
}

/** 安装一个技能到用户实例 */
export async function installSkillForUser(
  userId: string,
  skill: Omit<UserInstalledSkill, 'installedAt'>,
): Promise<void> {
  const installedAt = new Date().toISOString();
  await prisma.userInstalledSkill.upsert({
    where: { userId_skillId: { userId, skillId: skill.skillId } },
    create: {
      id: randomUUID(),
      userId,
      skillId: skill.skillId,
      title: skill.title,
      description: skill.description,
      skillMarkdown: skill.skillMarkdown,
      source: skill.source,
    },
    update: {
      title: skill.title,
      description: skill.description,
      skillMarkdown: skill.skillMarkdown,
      source: skill.source,
    },
  });
  ensureUserMap(userId).set(skill.skillId, {
    ...skill,
    installedAt,
  });
}

/** 卸载用户已安装的技能 */
export async function uninstallSkillForUser(userId: string, skillId: string): Promise<boolean> {
  try {
    await prisma.userInstalledSkill.delete({
      where: { userId_skillId: { userId, skillId } },
    });
  } catch {
    return false;
  }
  cache.get(userId)?.delete(skillId);
  return true;
}

/** 检查用户是否已安装某技能 */
export function isSkillInstalled(userId: string, skillId: string): boolean {
  return Boolean(ensureUserMap(userId).get(skillId));
}
