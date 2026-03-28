/**
 * 虾米 Nanobot — 持久化层
 * 每位用户分配一只虾米实例，对话历史独立存储。
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { dirname } from 'path';
import { getDataFilePath } from '../lib/data-path';

export interface LobsterInstance {
  userId: string;
  /** 用户给虾米起的名字 */
  name?: string;
  appliedAt: string;
  lastActiveAt: string;
  messageCount: number;
  /** 用户自带的个人 API Key（OpenRouter 或 OpenAI 兼容），加密明文存储 */
  personalApiKey?: string;
  /** 个人 Key 对应的 base URL（如 https://openrouter.ai/api/v1） */
  personalApiBaseUrl?: string;
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
    await Promise.all([saveInstances(), saveConversations()]);
  } else {
    await saveConversations();
  }
}

export async function clearLobsterConversation(userId: string): Promise<void> {
  conversations.delete(userId);
  await saveConversations();
}

export async function setPersonalApiKey(
  userId: string,
  key: string,
  baseUrl: string,
): Promise<void> {
  const inst = instances.get(userId);
  if (!inst) throw new Error('请先申请虾米');
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
