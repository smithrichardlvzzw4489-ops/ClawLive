/**
 * Darwin 公开展示：已安装技能（量化）、进化点、进化器轮次摘要。
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { listEvolverRounds } from './darwin-evolver-service';
import {
  initEvolutionNetwork,
  listEvolutionPointsForUser,
  toPublicPoint,
} from './evolution-network-service';
import { getLobsterInstance } from './lobster-persistence';
import { getUserInstalledSkills, installSkillForUser } from './lobster-user-skills';

export type DarwinDirectoryUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  updatedAt: string;
  skillCount: number;
  evolutionPointCount: number;
  darwinDisplayName: string | null;
};

export async function listDarwinDirectory(limit: number, offset: number): Promise<{
  users: DarwinDirectoryUser[];
  total: number;
}> {
  const where = { darwinOnboarding: { not: Prisma.DbNull } as const };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
      select: { id: true, username: true, avatarUrl: true, bio: true, updatedAt: true },
    }),
  ]);

  const users: DarwinDirectoryUser[] = await Promise.all(
    rows.map(async (u) => {
      const skills = getUserInstalledSkills(u.id);
      initEvolutionNetwork();
      const points = listEvolutionPointsForUser(u.id);
      const inst = getLobsterInstance(u.id);
      return {
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        updatedAt: u.updatedAt.toISOString(),
        skillCount: skills.length,
        evolutionPointCount: points.length,
        darwinDisplayName: inst?.name?.trim() || null,
      };
    }),
  );

  return { users, total };
}

export type DarwinPublicSkillItem = {
  skillId: string;
  title: string;
  description: string;
  source: 'platform' | 'web-learned';
  installedAt: string;
};

export type DarwinPublicProfile = {
  user: { id: string; username: string; avatarUrl: string | null; bio: string | null };
  darwin: { displayName: string; appliedAt: string | null };
  skills: { count: number; items: DarwinPublicSkillItem[] };
  evolutionPoints: ReturnType<typeof toPublicPoint>[];
  evolverRounds: Array<{
    id: string;
    roundNo: number;
    status: string;
    summary: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
};

export async function getDarwinPublicProfile(username: string): Promise<DarwinPublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, avatarUrl: true, bio: true, darwinOnboarding: true },
  });
  if (!user || user.darwinOnboarding == null) return null;

  const rawSkills = getUserInstalledSkills(user.id);
  initEvolutionNetwork();
  const points = listEvolutionPointsForUser(user.id).map(toPublicPoint);
  const rounds = await listEvolverRounds(user.id, 20);
  const inst = getLobsterInstance(user.id);

  const items: DarwinPublicSkillItem[] = rawSkills.map((s) => ({
    skillId: s.skillId,
    title: s.title,
    description: s.description.slice(0, 500),
    source: s.source,
    installedAt: s.installedAt,
  }));

  return {
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
    },
    darwin: {
      displayName: inst?.name?.trim() || user.username,
      appliedAt: inst?.appliedAt ?? null,
    },
    skills: { count: rawSkills.length, items },
    evolutionPoints: points,
    evolverRounds: rounds.map((r) => ({
      id: r.id,
      roundNo: r.roundNo,
      status: r.status,
      summary: r.summary,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  };
}

/** 将源用户已安装技能复制到当前用户（覆盖同 skillId） */
export async function cloneInstalledSkillsFromUser(
  targetUserId: string,
  sourceUserId: string,
): Promise<{ copied: number }> {
  if (targetUserId === sourceUserId) {
    throw new Error('不能克隆自己的技能');
  }
  const skills = getUserInstalledSkills(sourceUserId);
  if (!skills.length) {
    return { copied: 0 };
  }
  for (const s of skills) {
    await installSkillForUser(targetUserId, {
      skillId: s.skillId,
      title: s.title,
      description: s.description,
      skillMarkdown: s.skillMarkdown,
      source: s.source,
    });
  }
  return { copied: skills.length };
}
