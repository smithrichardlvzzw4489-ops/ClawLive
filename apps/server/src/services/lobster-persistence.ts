/**
 * 虾米 Nanobot — 持久化层（PostgreSQL / Railway，无本地 JSON）
 * 每位用户分配一只虾米实例，对话历史独立存储。
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** 每用户每日最多发起多少次 DarwinClaw 对话（用户消息计 1 次） */
export const DARWIN_DAILY_CHAT_LIMIT = 100;

export interface LobsterInstance {
  userId: string;
  /** 用户给虾米起的名字 */
  name?: string;
  appliedAt: string;
  lastActiveAt: string;
  messageCount: number;
  /** UTC 日期 YYYY-MM-DD，与 darwinDailyUserMessagesToday 配套 */
  darwinDailyChatDate?: string;
  /** 当日已消耗的对话次数（仅用户消息） */
  darwinDailyUserMessagesToday?: number;
  /** 用户自带的个人 API Key（OpenRouter 或 OpenAI 兼容），加密明文存储 */
  personalApiKey?: string;
  /** 个人 Key 对应的 base URL（如 https://openrouter.ai/api/v1） */
  personalApiBaseUrl?: string;
  /** Curator 检测到的技能缺口，下次对话时提示主人是否学习 */
  pendingSkillSuggestion?: string;
}

export interface LobsterMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface LobsterConversation {
  userId: string;
  messages: LobsterMessage[];
  updatedAt: string;
}

const MAX_MESSAGES_PER_USER = 60;

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class DarwinDailyLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`今日 DarwinClaw 对话次数已达上限（${limit} 次），请明天再试`);
    this.name = 'DarwinDailyLimitExceededError';
  }
}

/** 当前日已用次数、上限、剩余（用于 /api/lobster/me） */
export function getDarwinDailyChatStats(userId: string): {
  used: number;
  limit: number;
  remaining: number;
} {
  const inst = instances.get(userId);
  const limit = DARWIN_DAILY_CHAT_LIMIT;
  if (!inst) {
    return { used: 0, limit, remaining: limit };
  }
  const today = utcDateString();
  const used =
    inst.darwinDailyChatDate === today ? (inst.darwinDailyUserMessagesToday ?? 0) : 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

function assertDarwinDailyChatAllowed(userId: string): void {
  const inst = instances.get(userId);
  if (!inst) return;
  const today = utcDateString();
  let used = inst.darwinDailyUserMessagesToday ?? 0;
  if (inst.darwinDailyChatDate !== today) {
    used = 0;
  }
  if (used >= DARWIN_DAILY_CHAT_LIMIT) {
    throw new DarwinDailyLimitExceededError(DARWIN_DAILY_CHAT_LIMIT, used);
  }
}

function bumpDarwinDailyUserCount(inst: LobsterInstance): void {
  const today = utcDateString();
  if (inst.darwinDailyChatDate !== today) {
    inst.darwinDailyChatDate = today;
    inst.darwinDailyUserMessagesToday = 1;
  } else {
    inst.darwinDailyUserMessagesToday = (inst.darwinDailyUserMessagesToday ?? 0) + 1;
  }
}

let instances = new Map<string, LobsterInstance>();
let conversations = new Map<string, LobsterConversation>();

function instanceFromRow(r: {
  userId: string;
  name: string | null;
  appliedAt: Date;
  lastActiveAt: Date;
  messageCount: number;
  darwinDailyChatDate: string | null;
  darwinDailyUserMessagesToday: number | null;
  personalApiKey: string | null;
  personalApiBaseUrl: string | null;
  pendingSkillSuggestion: string | null;
}): LobsterInstance {
  return {
    userId: r.userId,
    name: r.name ?? undefined,
    appliedAt: r.appliedAt.toISOString(),
    lastActiveAt: r.lastActiveAt.toISOString(),
    messageCount: r.messageCount,
    darwinDailyChatDate: r.darwinDailyChatDate ?? undefined,
    darwinDailyUserMessagesToday: r.darwinDailyUserMessagesToday ?? undefined,
    personalApiKey: r.personalApiKey ?? undefined,
    personalApiBaseUrl: r.personalApiBaseUrl ?? undefined,
    pendingSkillSuggestion: r.pendingSkillSuggestion ?? undefined,
  };
}

export async function bootstrapLobsterFromPostgres(): Promise<void> {
  const [instRows, convRows] = await Promise.all([
    prisma.lobsterInstanceRow.findMany(),
    prisma.lobsterConversationRow.findMany(),
  ]);
  instances = new Map(instRows.map((r) => [r.userId, instanceFromRow(r)]));
  conversations = new Map(
    convRows.map((r) => [
      r.userId,
      {
        userId: r.userId,
        messages: (r.messages as unknown as LobsterMessage[]) ?? [],
        updatedAt: r.updatedAt.toISOString(),
      },
    ]),
  );
  console.log(
    `[Lobster] Loaded ${instances.size} instance(s), ${conversations.size} conversation(s) from PostgreSQL`,
  );
}

async function persistInstance(inst: LobsterInstance): Promise<void> {
  await prisma.lobsterInstanceRow.upsert({
    where: { userId: inst.userId },
    create: {
      userId: inst.userId,
      name: inst.name ?? null,
      appliedAt: new Date(inst.appliedAt),
      lastActiveAt: new Date(inst.lastActiveAt),
      messageCount: inst.messageCount,
      darwinDailyChatDate: inst.darwinDailyChatDate ?? null,
      darwinDailyUserMessagesToday: inst.darwinDailyUserMessagesToday ?? null,
      personalApiKey: inst.personalApiKey ?? null,
      personalApiBaseUrl: inst.personalApiBaseUrl ?? null,
      pendingSkillSuggestion: inst.pendingSkillSuggestion ?? null,
    },
    update: {
      name: inst.name ?? null,
      appliedAt: new Date(inst.appliedAt),
      lastActiveAt: new Date(inst.lastActiveAt),
      messageCount: inst.messageCount,
      darwinDailyChatDate: inst.darwinDailyChatDate ?? null,
      darwinDailyUserMessagesToday: inst.darwinDailyUserMessagesToday ?? null,
      personalApiKey: inst.personalApiKey ?? null,
      personalApiBaseUrl: inst.personalApiBaseUrl ?? null,
      pendingSkillSuggestion: inst.pendingSkillSuggestion ?? null,
    },
  });
}

async function persistConversation(conv: LobsterConversation): Promise<void> {
  await prisma.lobsterConversationRow.upsert({
    where: { userId: conv.userId },
    create: {
      userId: conv.userId,
      messages: conv.messages as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(conv.updatedAt),
    },
    update: {
      messages: conv.messages as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(conv.updatedAt),
    },
  });
}

async function saveInstances(): Promise<void> {
  await Promise.all(Array.from(instances.values()).map((i) => persistInstance(i)));
}

async function saveConversations(): Promise<void> {
  await Promise.all(Array.from(conversations.values()).map((c) => persistConversation(c)));
}

export function getLobsterInstance(userId: string): LobsterInstance | null {
  return instances.get(userId) ?? null;
}

export function getAllInstances(): LobsterInstance[] {
  return Array.from(instances.values());
}

/**
 * Railway 等环境若 Lobster 表为空但 PostgreSQL 中仍有 Darwin 问卷/进化轮次，
 * 补回内存与 DB 中的实例行，使定时进化器能继续执行。
 */
export async function hydrateDarwinInstancesFromDatabase(): Promise<void> {
  try {
    const [withOnboarding, roundUsers] = await Promise.all([
      prisma.user.findMany({
        where: { darwinOnboarding: { not: Prisma.DbNull } },
        select: { id: true },
      }),
      prisma.evolverRound.findMany({
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    const ids = new Set<string>();
    for (const u of withOnboarding) ids.add(u.id);
    for (const r of roundUsers) ids.add(r.userId);

    const now = new Date().toISOString();
    let added = 0;
    for (const userId of ids) {
      if (!instances.has(userId)) {
        instances.set(userId, {
          userId,
          appliedAt: now,
          lastActiveAt: now,
          messageCount: 0,
        });
        added++;
      }
    }
    if (added > 0) {
      await saveInstances();
      console.log(
        `[Lobster] Hydrated ${added} Darwin instance(s) from PostgreSQL user/evolver data`,
      );
    }
  } catch (e) {
    console.error('[Lobster] hydrateDarwinInstancesFromDatabase:', e);
  }
}

export async function applyLobster(userId: string, name?: string): Promise<LobsterInstance> {
  const existing = instances.get(userId);
  if (existing) return existing;
  const instance: LobsterInstance = {
    userId,
    name: name?.trim() || undefined,
    appliedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    messageCount: 0,
  };
  instances.set(userId, instance);
  await persistInstance(instance);
  return instance;
}

export function getLobsterConversation(userId: string): LobsterConversation {
  return conversations.get(userId) ?? { userId, messages: [], updatedAt: new Date().toISOString() };
}

export async function appendLobsterMessage(userId: string, message: LobsterMessage): Promise<void> {
  if (message.role === 'user') {
    assertDarwinDailyChatAllowed(userId);
  }
  const conv = getLobsterConversation(userId);
  conv.messages.push(message);
  if (conv.messages.length > MAX_MESSAGES_PER_USER) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_USER);
  }
  conv.updatedAt = new Date().toISOString();
  conversations.set(userId, conv);

  const inst = instances.get(userId);
  if (inst && message.role === 'user') {
    inst.lastActiveAt = new Date().toISOString();
    inst.messageCount += 1;
    bumpDarwinDailyUserCount(inst);
    await Promise.all([persistInstance(inst), persistConversation(conv)]);
  } else {
    await persistConversation(conv);
  }
}

export async function clearLobsterConversation(userId: string): Promise<void> {
  conversations.delete(userId);
  try {
    await prisma.lobsterConversationRow.delete({ where: { userId } });
  } catch {
    /* 不存在则忽略 */
  }
}

export async function renameLobster(userId: string, name: string): Promise<LobsterInstance> {
  const inst = instances.get(userId);
  if (!inst) throw new Error('请先申请 DarwinClaw');
  inst.name = name.trim() || undefined;
  await persistInstance(inst);
  return inst;
}

export async function setPendingSkillSuggestion(userId: string, skill: string | undefined): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) return;
  inst.pendingSkillSuggestion = skill;
  await persistInstance(inst);
}

export async function setPersonalApiKey(
  userId: string,
  key: string,
  baseUrl: string,
): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) throw new Error('请先申请 DarwinClaw');
  inst.personalApiKey = key;
  inst.personalApiBaseUrl = baseUrl;
  await persistInstance(inst);
}

export async function clearPersonalApiKey(userId: string): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) return;
  delete inst.personalApiKey;
  delete inst.personalApiBaseUrl;
  await persistInstance(inst);
}
