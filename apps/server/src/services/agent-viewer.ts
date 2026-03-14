/**
 * Agent Viewer Service
 * Manages AI agents that subscribe to live streams and works to learn from content.
 */

import crypto from 'crypto';

// Agent registration: agentId -> { apiKey, name, createdAt }
const agentRegistrations = new Map<string, {
  apiKey: string;
  name?: string;
  webhookUrl?: string;
  createdAt: Date;
}>();

// Subscriptions: agentId -> Set of roomIds or workIds
const roomSubscriptions = new Map<string, Set<string>>();
const workSubscriptions = new Map<string, Set<string>>();

function generateApiKey(): string {
  return 'av_' + crypto.randomBytes(24).toString('hex');
}

export function registerAgent(agentId: string, options?: { name?: string; webhookUrl?: string }): { apiKey: string } {
  const existing = agentRegistrations.get(agentId);
  const apiKey = existing?.apiKey ?? generateApiKey();

  agentRegistrations.set(agentId, {
    apiKey,
    name: options?.name,
    webhookUrl: options?.webhookUrl,
    createdAt: existing?.createdAt ?? new Date(),
  });

  if (!roomSubscriptions.has(agentId)) {
    roomSubscriptions.set(agentId, new Set());
  }
  if (!workSubscriptions.has(agentId)) {
    workSubscriptions.set(agentId, new Set());
  }

  return { apiKey };
}

export function verifyAgentApiKey(apiKey: string): string | null {
  for (const [agentId, reg] of agentRegistrations) {
    if (reg.apiKey === apiKey) return agentId;
  }
  return null;
}

export function subscribeToRoom(agentId: string, roomId: string): void {
  const set = roomSubscriptions.get(agentId) ?? new Set();
  set.add(roomId);
  roomSubscriptions.set(agentId, set);
}

export function unsubscribeFromRoom(agentId: string, roomId: string): void {
  roomSubscriptions.get(agentId)?.delete(roomId);
}

export function subscribeToWork(agentId: string, workId: string): void {
  const set = workSubscriptions.get(agentId) ?? new Set();
  set.add(workId);
  workSubscriptions.set(agentId, set);
}

export function unsubscribeFromWork(agentId: string, workId: string): void {
  workSubscriptions.get(agentId)?.delete(workId);
}

export function getAgentSubscriptions(agentId: string): { roomIds: string[]; workIds: string[] } {
  return {
    roomIds: Array.from(roomSubscriptions.get(agentId) ?? []),
    workIds: Array.from(workSubscriptions.get(agentId) ?? []),
  };
}

export function getAgentWebhookUrl(agentId: string): string | undefined {
  return agentRegistrations.get(agentId)?.webhookUrl;
}
