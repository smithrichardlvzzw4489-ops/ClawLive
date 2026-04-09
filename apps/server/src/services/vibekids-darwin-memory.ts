import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type VibekidsMemoryEntry = {
  at: string;
  intent: 'create' | 'refine';
  snippet: string;
  kind?: string;
};

const MAX_ENTRIES = 28;

function normalizeEntries(raw: unknown): VibekidsMemoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: VibekidsMemoryEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const intent = o.intent === 'refine' ? 'refine' : o.intent === 'create' ? 'create' : null;
    const snippet = typeof o.snippet === 'string' ? o.snippet.trim() : '';
    if (!intent || snippet.length < 2) continue;
    const at = typeof o.at === 'string' ? o.at : new Date().toISOString();
    const kind = typeof o.kind === 'string' ? o.kind : undefined;
    out.push({ at, intent, snippet: snippet.slice(0, 220), kind });
  }
  return out;
}

/** 供 LLM 用户消息前缀：近期创作线索（不注入 Darwin 聊天正文） */
export async function formatVibekidsDarwinMemoryBlock(userId: string): Promise<string> {
  const row = await prisma.vibekidsDarwinMemory.findUnique({
    where: { userId },
    select: { entries: true },
  });
  const list = normalizeEntries(row?.entries).slice(0, 14);
  if (list.length === 0) return '';
  const lines = list.map((e) => {
    const tag = e.intent === 'refine' ? '修改' : '生成';
    const k = e.kind ? ` · ${e.kind}` : '';
    return `- 曾${tag}${k}：${e.snippet}`;
  });
  return `【GITLINK 同步的近期创作线索（勿复述原文，仅作主题与风格连贯参考）】\n${lines.join('\n')}`;
}

export async function appendVibekidsDarwinMemory(
  userId: string,
  partial: Omit<VibekidsMemoryEntry, 'at'> & { at?: string },
): Promise<void> {
  const snippet = partial.snippet.trim().slice(0, 220);
  if (snippet.length < 2) return;
  const row = await prisma.vibekidsDarwinMemory.findUnique({
    where: { userId },
    select: { entries: true },
  });
  const prev = normalizeEntries(row?.entries);
  const entry: VibekidsMemoryEntry = {
    at: partial.at ?? new Date().toISOString(),
    intent: partial.intent,
    snippet,
    kind: partial.kind,
  };
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  await prisma.vibekidsDarwinMemory.upsert({
    where: { userId },
    create: {
      userId,
      entries: next as unknown as Prisma.InputJsonValue,
    },
    update: {
      entries: next as unknown as Prisma.InputJsonValue,
    },
  });
}
