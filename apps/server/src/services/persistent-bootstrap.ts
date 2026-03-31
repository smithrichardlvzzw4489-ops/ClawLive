/**
 * 启动时从 PostgreSQL（Railway DATABASE_URL）加载 Darwin / 进化网络 / Feed 等状态；
 * 若表为空且存在旧版 JSON 文件，则一次性导入后不再读本地文件。
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { getDataFilePath, DATA_DIR } from '../lib/data-path';
import { prisma } from '../lib/prisma';
import {
  bootstrapLobsterFromPostgres,
  hydrateDarwinInstancesFromDatabase,
} from './lobster-persistence';
import { bootstrapEvolutionFromPostgres } from './evolution-network-service';
import {
  bootstrapFeedPostsFromPostgres,
  importFeedPostsFromLegacyJsonIfEmpty,
} from './feed-posts-store';
import { bootstrapFeedReactionsFromPostgres } from './feed-post-reactions-store';
import { bootstrapUserSkillsFromPostgres } from './lobster-user-skills';

async function importLegacyLobsterJsonIfEmpty(): Promise<void> {
  const instPath = getDataFilePath('lobster-instances.json');
  const convPath = getDataFilePath('lobster-conversations.json');
  const nInst = await prisma.lobsterInstanceRow.count();
  if (nInst > 0 || !existsSync(instPath)) return;
  try {
    const arr = JSON.parse(readFileSync(instPath, 'utf8')) as Array<{
      userId: string;
      name?: string;
      appliedAt: string;
      lastActiveAt: string;
      messageCount: number;
      darwinDailyChatDate?: string;
      darwinDailyUserMessagesToday?: number;
      personalApiKey?: string;
      personalApiBaseUrl?: string;
      pendingSkillSuggestion?: string;
    }>;
    for (const i of arr) {
      const u = await prisma.user.findUnique({ where: { id: i.userId } });
      if (!u) continue;
      await prisma.lobsterInstanceRow.upsert({
        where: { userId: i.userId },
        create: {
          userId: i.userId,
          name: i.name ?? null,
          appliedAt: new Date(i.appliedAt),
          lastActiveAt: new Date(i.lastActiveAt),
          messageCount: i.messageCount ?? 0,
          darwinDailyChatDate: i.darwinDailyChatDate ?? null,
          darwinDailyUserMessagesToday: i.darwinDailyUserMessagesToday ?? null,
          personalApiKey: i.personalApiKey ?? null,
          personalApiBaseUrl: i.personalApiBaseUrl ?? null,
          pendingSkillSuggestion: i.pendingSkillSuggestion ?? null,
        },
        update: {
          name: i.name ?? null,
          appliedAt: new Date(i.appliedAt),
          lastActiveAt: new Date(i.lastActiveAt),
          messageCount: i.messageCount ?? 0,
          darwinDailyChatDate: i.darwinDailyChatDate ?? null,
          darwinDailyUserMessagesToday: i.darwinDailyUserMessagesToday ?? null,
          personalApiKey: i.personalApiKey ?? null,
          personalApiBaseUrl: i.personalApiBaseUrl ?? null,
          pendingSkillSuggestion: i.pendingSkillSuggestion ?? null,
        },
      });
    }
    console.log(`[Bootstrap] Imported ${arr.length} lobster instance row(s) from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy lobster-instances import:', e);
  }
  const nConv = await prisma.lobsterConversationRow.count();
  if (nConv > 0 || !existsSync(convPath)) return;
  try {
    const arr = JSON.parse(readFileSync(convPath, 'utf8')) as Array<{
      userId: string;
      messages: unknown;
      updatedAt: string;
    }>;
    for (const c of arr) {
      const u = await prisma.user.findUnique({ where: { id: c.userId } });
      if (!u) continue;
      await prisma.lobsterConversationRow.upsert({
        where: { userId: c.userId },
        create: {
          userId: c.userId,
          messages: c.messages as Prisma.InputJsonValue,
          updatedAt: new Date(c.updatedAt),
        },
        update: {
          messages: c.messages as Prisma.InputJsonValue,
          updatedAt: new Date(c.updatedAt),
        },
      });
    }
    console.log(`[Bootstrap] Imported ${arr.length} lobster conversation row(s) from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy lobster-conversations import:', e);
  }
}

async function importLegacyEvolutionJsonIfEmpty(): Promise<void> {
  const pPath = getDataFilePath('evolution-points.json');
  const cPath = getDataFilePath('evolution-comments.json');
  const nP = await prisma.evolutionPoint.count();
  if (nP > 0 || !existsSync(pPath)) return;
  try {
    const raw = JSON.parse(readFileSync(pPath, 'utf-8')) as Record<string, Record<string, unknown>>;
    for (const [id, p] of Object.entries(raw)) {
      const authorUserId = String(p.authorUserId ?? '');
      if (!authorUserId) continue;
      const u = await prisma.user.findUnique({ where: { id: authorUserId } });
      if (!u) continue;
      const problems = Array.isArray(p.problems) ? p.problems : [];
      await prisma.evolutionPoint.upsert({
        where: { id },
        create: {
          id,
          title: String(p.title ?? ''),
          goal: String(p.goal ?? ''),
          problems: problems as Prisma.InputJsonValue,
          authorUserId,
          authorAgentName: String(p.authorAgentName ?? ''),
          status: String(p.status ?? 'active'),
          endReason: p.endReason != null ? String(p.endReason) : null,
          createdAt: new Date(String(p.createdAt ?? new Date().toISOString())),
          updatedAt: new Date(String(p.updatedAt ?? new Date().toISOString())),
          startedAt: p.startedAt ? new Date(String(p.startedAt)) : null,
          lastActivityAt: new Date(String(p.lastActivityAt ?? p.updatedAt ?? new Date().toISOString())),
          source: p.source != null ? String(p.source) : null,
        },
        update: {
          title: String(p.title ?? ''),
          goal: String(p.goal ?? ''),
          problems: problems as Prisma.InputJsonValue,
          authorUserId,
          authorAgentName: String(p.authorAgentName ?? ''),
          status: String(p.status ?? 'active'),
          endReason: p.endReason != null ? String(p.endReason) : null,
          createdAt: new Date(String(p.createdAt ?? new Date().toISOString())),
          updatedAt: new Date(String(p.updatedAt ?? new Date().toISOString())),
          startedAt: p.startedAt ? new Date(String(p.startedAt)) : null,
          lastActivityAt: new Date(String(p.lastActivityAt ?? p.updatedAt ?? new Date().toISOString())),
          source: p.source != null ? String(p.source) : null,
        },
      });
    }
    console.log(`[Bootstrap] Imported evolution points from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy evolution-points import:', e);
  }
  const nC = await prisma.evolutionComment.count();
  if (nC > 0 || !existsSync(cPath)) return;
  try {
    const raw = JSON.parse(readFileSync(cPath, 'utf-8')) as Record<string, unknown[]>;
    for (const [pointId, list] of Object.entries(raw)) {
      const ep = await prisma.evolutionPoint.findUnique({ where: { id: pointId } });
      if (!ep) continue;
      if (!Array.isArray(list)) continue;
      for (const c of list) {
        const o = c as Record<string, unknown>;
        const id = String(o.id ?? '');
        if (!id) continue;
        await prisma.evolutionComment.upsert({
          where: { id },
          create: {
            id,
            pointId,
            authorUserId: String(o.authorUserId ?? ''),
            authorAgentName: String(o.authorAgentName ?? ''),
            body: String(o.body ?? ''),
            createdAt: new Date(String(o.createdAt ?? new Date().toISOString())),
          },
          update: {
            pointId,
            authorUserId: String(o.authorUserId ?? ''),
            authorAgentName: String(o.authorAgentName ?? ''),
            body: String(o.body ?? ''),
            createdAt: new Date(String(o.createdAt ?? new Date().toISOString())),
          },
        });
      }
    }
    console.log(`[Bootstrap] Imported evolution comments from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy evolution-comments import:', e);
  }
}

async function importLegacyFeedReactionsIfEmpty(): Promise<void> {
  const path = getDataFilePath('feed-post-reactions.json');
  const n = await prisma.feedPostReaction.count();
  if (n > 0 || !existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<
      string,
      { likes?: string[]; favorites?: string[] }
    >;
    for (const [postId, v] of Object.entries(raw)) {
      const post = await prisma.feedPost.findUnique({ where: { id: postId } });
      if (!post) continue;
      for (const userId of v?.likes ?? []) {
        await prisma.feedPostReaction.upsert({
          where: {
            postId_userId_kind: { postId, userId, kind: 'like' },
          },
          create: { postId, userId, kind: 'like' },
          update: { kind: 'like' },
        });
      }
      for (const userId of v?.favorites ?? []) {
        await prisma.feedPostReaction.upsert({
          where: {
            postId_userId_kind: { postId, userId, kind: 'favorite' },
          },
          create: { postId, userId, kind: 'favorite' },
          update: { kind: 'favorite' },
        });
      }
    }
    console.log(`[Bootstrap] Imported feed reactions from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy feed-post-reactions import:', e);
  }
}

async function importLegacyFeedCommentsIfEmpty(): Promise<void> {
  const path = getDataFilePath('feed-post-comments.json');
  const n = await prisma.feedPostComment.count();
  if (n > 0 || !existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown[]>;
    for (const [postId, list] of Object.entries(raw)) {
      const post = await prisma.feedPost.findUnique({ where: { id: postId } });
      if (!post) continue;
      if (!Array.isArray(list)) continue;
      for (const c of list) {
        const o = c as Record<string, unknown>;
        const id = String(o.id ?? '');
        if (!id) continue;
        await prisma.feedPostComment.upsert({
          where: { id },
          create: {
            id,
            postId,
            authorId: String(o.authorId ?? ''),
            content: String(o.content ?? ''),
            createdAt: o.createdAt ? new Date(String(o.createdAt)) : new Date(),
          },
          update: {
            postId,
            authorId: String(o.authorId ?? ''),
            content: String(o.content ?? ''),
            createdAt: o.createdAt ? new Date(String(o.createdAt)) : new Date(),
          },
        });
      }
    }
    console.log(`[Bootstrap] Imported feed comments from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy feed-post-comments import:', e);
  }
}

async function importLegacyUserSkillsIfEmpty(): Promise<void> {
  const n = await prisma.userInstalledSkill.count();
  if (n > 0) return;
  const base = join(DATA_DIR, 'lobster-user-skills');
  if (!existsSync(base)) return;
  let imported = 0;
  try {
    for (const userId of readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      const file = join(base, userId, 'skills.json');
      if (!existsSync(file)) continue;
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (!u) continue;
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Record<string, unknown>>;
      for (const [skillId, s] of Object.entries(raw)) {
        await prisma.userInstalledSkill.upsert({
          where: { userId_skillId: { userId, skillId } },
          create: {
            id: randomUUID(),
            userId,
            skillId,
            title: String(s.title ?? ''),
            description: String(s.description ?? ''),
            skillMarkdown: String(s.skillMarkdown ?? ''),
            source: String(s.source ?? 'platform'),
            installedAt: s.installedAt ? new Date(String(s.installedAt)) : new Date(),
          },
          update: {
            title: String(s.title ?? ''),
            description: String(s.description ?? ''),
            skillMarkdown: String(s.skillMarkdown ?? ''),
            source: String(s.source ?? 'platform'),
          },
        });
        imported++;
      }
    }
    if (imported > 0) console.log(`[Bootstrap] Imported ${imported} user skill row(s) from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy user skills import:', e);
  }
}

/**
 * 在 listen 回调中、注册业务路由之前调用，保证内存态与 PostgreSQL 一致。
 */
export async function bootstrapPersistentStateFromPostgres(): Promise<void> {
  await importFeedPostsFromLegacyJsonIfEmpty();
  await importLegacyLobsterJsonIfEmpty();
  await importLegacyEvolutionJsonIfEmpty();
  await importLegacyFeedCommentsIfEmpty();
  await importLegacyFeedReactionsIfEmpty();
  await importLegacyUserSkillsIfEmpty();

  await bootstrapFeedPostsFromPostgres();
  await bootstrapFeedReactionsFromPostgres();
  await bootstrapEvolutionFromPostgres();
  await bootstrapLobsterFromPostgres();
  await bootstrapUserSkillsFromPostgres();
  await hydrateDarwinInstancesFromDatabase();
}
