/**
 * User-level Agent Connections（永久保存、可复用）
 * 用户级龙虾连接池：一次配置，多处复用
 * - 直播间、作品创作等所有需配置 Agent 的地方均可从此选择并应用
 * - 退出登录等任何情况下均保留，仅用户主动删除连接时才会移除
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR, getDataFilePath } from '../lib/data-path';

const CONFIG_FILE = getDataFilePath('user-agent-connections.json');

export interface UserAgentConnection {
  id: string;
  userId: string;
  name: string;
  agentType: 'telegram-mtproto' | 'telegram-bot';
  sessionString?: string;  // MTProto 用
  botToken?: string;      // Bot 模式用
  agentChatId: string;
  phone?: string;
  createdAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAll(): Record<string, UserAgentConnection> {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveAll(connections: Record<string, UserAgentConnection>) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(connections, null, 2));
}

export function listByUser(userId: string): Omit<UserAgentConnection, 'sessionString' | 'botToken'>[] {
  const all = loadAll();
  return Object.values(all)
    .filter((c) => c.userId === userId)
    .map(({ sessionString, botToken, ...rest }) => ({
      ...rest,
      hasSession: !!sessionString,
      hasBotToken: !!botToken,
    }));
}

export function getById(connectionId: string): UserAgentConnection | null {
  const all = loadAll();
  return all[connectionId] || null;
}

export function getByIdForUser(connectionId: string, userId: string): UserAgentConnection | null {
  const conn = getById(connectionId);
  if (!conn || conn.userId !== userId) return null;
  return conn;
}

export function create(
  userId: string,
  data: {
    name: string;
    agentType: 'telegram-mtproto' | 'telegram-bot';
    sessionString?: string;
    botToken?: string;
    agentChatId: string;
    phone?: string;
  }
): UserAgentConnection {
  const all = loadAll();
  const id = randomUUID();
  const conn: UserAgentConnection = {
    id,
    userId,
    name: data.name,
    agentType: data.agentType,
    sessionString: data.sessionString,
    botToken: data.botToken,
    agentChatId: data.agentChatId,
    phone: data.phone,
    createdAt: new Date().toISOString(),
  };
  all[id] = conn;
  saveAll(all);
  return conn;
}

export function deleteConnection(connectionId: string, userId: string): boolean {
  const all = loadAll();
  const conn = all[connectionId];
  if (!conn || conn.userId !== userId) return false;
  delete all[connectionId];
  saveAll(all);
  return true;
}

export function updateName(connectionId: string, userId: string, name: string): boolean {
  const all = loadAll();
  const conn = all[connectionId];
  if (!conn || conn.userId !== userId) return false;
  conn.name = name;
  saveAll(all);
  return true;
}
