/**
 * 虾米 Nanobot — 持久化层
 * 每位用户分配一只虾米实例，对话历史独立存储。
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { dirname } from 'path';
import { getDataFilePath } from '../lib/data-path';

/** 每用户每日最多发起多少次 Darwin 对话（用户消息计 1 次） */
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

const INSTANCES_FILE = getDataFilePath('lobster-instances.json');
const CONVERSATIONS_FILE = getDataFilePath('lobster-conversations.json');
const MAX_MESSAGES_PER_USER = 60;

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class DarwinDailyLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`今日 Darwin 对话次数已达上限（${limit} 次），请明天再试`);
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

function ensureDir(file: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadLobsterData(): void {
  ensureDir(INSTANCES_FILE);
  try {
    if (existsSync(INSTANCES_FILE)) {
      const arr: LobsterInstance[] = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
      instances = new Map(arr.map((i) => [i.userId, i]));
      console.log(`[Lobster] Loaded ${instances.size} lobster instances`);
    }
  } catch {
    instances = new Map();
  }
  try {
    if (existsSync(CONVERSATIONS_FILE)) {
      const arr: LobsterConversation[] = JSON.parse(readFileSync(CONVERSATIONS_FILE, 'utf8'));
      conversations = new Map(arr.map((c) => [c.userId, c]));
    }
  } catch {
    conversations = new Map();
  }
}

async function saveInstances(): Promise<void> {
  await writeFileAsync(INSTANCES_FILE, JSON.stringify(Array.from(instances.values()), null, 2), 'utf8');
}

async function saveConversations(): Promise<void> {
  await writeFileAsync(CONVERSATIONS_FILE, JSON.stringify(Array.from(conversations.values()), null, 2), 'utf8');
}

export function getLobsterInstance(userId: string): LobsterInstance | null {
  return instances.get(userId) ?? null;
}

export function getAllInstances(): LobsterInstance[] {
  return Array.from(instances.values());
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
  await saveInstances();
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
    await Promise.all([saveInstances(), saveConversations()]);
  } else {
    await saveConversations();
  }
}

export async function clearLobsterConversation(userId: string): Promise<void> {
  conversations.delete(userId);
  await saveConversations();
}

export async function renameLobster(userId: string, name: string): Promise<LobsterInstance> {
  const inst = instances.get(userId);
  if (!inst) throw new Error('请先申请 Darwin');
  inst.name = name.trim() || undefined;
  await saveInstances();
  return inst;
}

export async function setPendingSkillSuggestion(userId: string, skill: string | undefined): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) return;
  inst.pendingSkillSuggestion = skill;
  await saveInstances();
}

export async function setPersonalApiKey(
  userId: string,
  key: string,
  baseUrl: string,
): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) throw new Error('请先申请 Darwin');
  inst.personalApiKey = key;
  inst.personalApiBaseUrl = baseUrl;
  await saveInstances();
}

export async function clearPersonalApiKey(userId: string): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) return;
  delete inst.personalApiKey;
  delete inst.personalApiBaseUrl;
  await saveInstances();
}

loadLobsterData();
