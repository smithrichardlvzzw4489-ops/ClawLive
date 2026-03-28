/**
 * Agent Open API — API Key 管理
 *
 * 格式：clw_<60 位随机十六进制>
 * 存储：keyHash（sha256）+ keyPrefix（前 10 位，仅用于展示）
 * 原始 Key 只在创建时返回一次，之后不再可见。
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { dirname } from 'path';
import { createHash, randomBytes } from 'crypto';
import { getDataFilePath } from '../lib/data-path';

export interface AgentApiKey {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  agentName: string;
  /** 'xia-mi' | 'minimax' | 'custom' | ... */
  agentType: string;
  createdAt: string;
  lastUsedAt?: string;
}

const AGENT_KEYS_FILE = getDataFilePath('agent-api-keys.json');

/** keyHash -> AgentApiKey */
let keysByHash = new Map<string, AgentApiKey>();
/** userId -> AgentApiKey[] */
let keysByUser = new Map<string, AgentApiKey[]>();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function ensureDir(file: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadAgentApiKeys(): void {
  ensureDir(AGENT_KEYS_FILE);
  try {
    if (existsSync(AGENT_KEYS_FILE)) {
      const arr: AgentApiKey[] = JSON.parse(readFileSync(AGENT_KEYS_FILE, 'utf8'));
      keysByHash = new Map(arr.map((k) => [k.keyHash, k]));
      keysByUser = new Map();
      for (const k of arr) {
        const list = keysByUser.get(k.userId) ?? [];
        list.push(k);
        keysByUser.set(k.userId, list);
      }
      console.log(`[AgentApiKeys] Loaded ${arr.length} keys`);
    }
  } catch {
    keysByHash = new Map();
    keysByUser = new Map();
  }
}

async function saveKeys(): Promise<void> {
  await writeFileAsync(
    AGENT_KEYS_FILE,
    JSON.stringify(Array.from(keysByHash.values()), null, 2),
    'utf8',
  );
}

export async function createAgentApiKey(
  userId: string,
  agentName: string,
  agentType: string,
): Promise<{ key: AgentApiKey; rawKey: string }> {
  const rawKey = 'clw_' + randomBytes(30).toString('hex');
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);
  const key: AgentApiKey = {
    id: randomBytes(8).toString('hex'),
    userId,
    keyHash,
    keyPrefix,
    agentName: agentName.trim().slice(0, 50),
    agentType: agentType.trim().slice(0, 30) || 'custom',
    createdAt: new Date().toISOString(),
  };
  keysByHash.set(keyHash, key);
  const userList = keysByUser.get(userId) ?? [];
  userList.push(key);
  keysByUser.set(userId, userList);
  await saveKeys();
  return { key, rawKey };
}

export function verifyAgentApiKey(rawKey: string): AgentApiKey | null {
  const kh = hashKey(rawKey);
  return keysByHash.get(kh) ?? null;
}

let _lastSaveTs = 0;
export async function touchAgentApiKey(keyHash: string): Promise<void> {
  const k = keysByHash.get(keyHash);
  if (!k) return;
  k.lastUsedAt = new Date().toISOString();
  // Debounce: save at most once per minute
  const now = Date.now();
  if (now - _lastSaveTs > 60_000) {
    _lastSaveTs = now;
    await saveKeys().catch(() => {});
  }
}

export function getAgentApiKeysByUser(userId: string): Omit<AgentApiKey, 'keyHash'>[] {
  return (keysByUser.get(userId) ?? []).map(({ keyHash: _kh, ...rest }) => rest);
}

export async function revokeAgentApiKey(userId: string, keyId: string): Promise<boolean> {
  const userKeys = keysByUser.get(userId) ?? [];
  const target = userKeys.find((k) => k.id === keyId);
  if (!target) return false;
  keysByHash.delete(target.keyHash);
  keysByUser.set(userId, userKeys.filter((k) => k.id !== keyId));
  await saveKeys();
  return true;
}

loadAgentApiKeys();
