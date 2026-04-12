/**
 * Token 用量追踪：记录每次 LLM 调用的 token 消耗，按 feature / model / 时间聚合。
 *
 * 存储采用内存 + 定期持久化到 JSON 文件（轻量，无需额外数据库表）。
 * 生产环境可替换为 Redis / DB 实现。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export type TokenFeature =
  | 'profile_analysis'
  | 'developer_search'
  | 'search_rerank'
  | 'outreach_message'
  | 'outreach_preview'
  | 'connect_agent'
  | 'result_summary'
  | 'feed_excerpt'
  | 'evolver_assessment'
  | 'evolution_acceptance'
  | 'github_graph_blurb'
  | 'jd_resume_match'
  | 'llm_test'
  | 'other';

export interface TokenUsageRecord {
  id: string;
  timestamp: number;
  feature: TokenFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  metadata?: Record<string, string>;
}

export interface TokenUsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  avgTokensPerCall: number;
  avgDurationMs: number;
  byFeature: Record<string, FeatureStats>;
  byModel: Record<string, ModelStats>;
  byHour: HourlyStats[];
  recentCalls: TokenUsageRecord[];
}

interface FeatureStats {
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number;
}

interface ModelStats {
  calls: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface HourlyStats {
  hour: string;
  calls: number;
  tokens: number;
  cost: number;
}

/* ══════════════════════════════════════════════════════════════
   Cost Estimation (per 1M tokens, approximate)
   ══════════════════════════════════════════════════════════════ */

const COST_PER_1M: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o': { prompt: 2.5, completion: 10 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-4-turbo': { prompt: 10, completion: 30 },
  'gpt-4': { prompt: 30, completion: 60 },
  'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
  'claude-3-opus': { prompt: 15, completion: 75 },
  'claude-3.5-sonnet': { prompt: 3, completion: 15 },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
  'anthropic/claude-opus-4.6': { prompt: 15, completion: 75 },
  'anthropic/claude-3.5-sonnet': { prompt: 3, completion: 15 },
  'deepseek/deepseek-chat': { prompt: 0.14, completion: 0.28 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = COST_PER_1M[model] ||
    Object.entries(COST_PER_1M).find(([k]) => model.includes(k))?.[1] ||
    { prompt: 1, completion: 3 };

  return (promptTokens * pricing.prompt + completionTokens * pricing.completion) / 1_000_000;
}

/* ══════════════════════════════════════════════════════════════
   Storage
   ══════════════════════════════════════════════════════════════ */

const MAX_RECORDS = 5000;
const PERSIST_INTERVAL_MS = 60_000;
const DATA_DIR = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'token-usage.json');

let records: TokenUsageRecord[] = [];
let dirty = false;
let persistTimer: ReturnType<typeof setInterval> | null = null;
let idCounter = 0;

function loadFromDisk(): void {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.records)) {
        records = data.records.slice(-MAX_RECORDS);
        idCounter = data.idCounter || records.length;
      }
    }
  } catch {
    records = [];
  }
}

function saveToDisk(): void {
  if (!dirty) return;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(DATA_FILE, JSON.stringify({ records: records.slice(-MAX_RECORDS), idCounter }, null, 0));
    dirty = false;
  } catch (err) {
    console.warn('[TokenTracker] failed to persist:', err);
  }
}

function ensureTimer(): void {
  if (persistTimer) return;
  loadFromDisk();
  persistTimer = setInterval(saveToDisk, PERSIST_INTERVAL_MS);
  if (typeof persistTimer === 'object' && 'unref' in persistTimer) {
    (persistTimer as NodeJS.Timeout).unref();
  }
}

/* ══════════════════════════════════════════════════════════════
   Public API
   ══════════════════════════════════════════════════════════════ */

export function trackTokenUsage(params: {
  feature: TokenFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  metadata?: Record<string, string>;
}): TokenUsageRecord {
  ensureTimer();

  const record: TokenUsageRecord = {
    id: `tok_${Date.now()}_${++idCounter}`,
    timestamp: Date.now(),
    feature: params.feature,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.totalTokens,
    estimatedCostUsd: estimateCost(params.model, params.promptTokens, params.completionTokens),
    durationMs: params.durationMs,
    metadata: params.metadata,
  };

  records.push(record);
  if (records.length > MAX_RECORDS) {
    records = records.slice(-MAX_RECORDS);
  }
  dirty = true;

  return record;
}

/**
 * 从 OpenAI SDK response.usage 自动提取 token 数据并记录。
 */
export function trackFromResponse(
  feature: TokenFeature,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined,
  durationMs: number,
  metadata?: Record<string, string>,
): TokenUsageRecord | null {
  if (!usage) return null;

  return trackTokenUsage({
    feature,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    durationMs,
    metadata,
  });
}

export function getTokenUsageSummary(options?: {
  since?: number;
  feature?: TokenFeature;
  limit?: number;
}): TokenUsageSummary {
  ensureTimer();

  const since = options?.since || 0;
  const featureFilter = options?.feature;
  const limit = options?.limit || 50;

  let filtered = records.filter((r) => r.timestamp >= since);
  if (featureFilter) {
    filtered = filtered.filter((r) => r.feature === featureFilter);
  }

  const totalCalls = filtered.length;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalEstimatedCostUsd = 0;
  let totalDuration = 0;

  const byFeature: Record<string, FeatureStats> = {};
  const byModel: Record<string, ModelStats> = {};
  const hourlyMap = new Map<string, { calls: number; tokens: number; cost: number }>();

  for (const r of filtered) {
    totalPromptTokens += r.promptTokens;
    totalCompletionTokens += r.completionTokens;
    totalTokens += r.totalTokens;
    totalEstimatedCostUsd += r.estimatedCostUsd;
    totalDuration += r.durationMs;

    if (!byFeature[r.feature]) {
      byFeature[r.feature] = { calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, avgDurationMs: 0 };
    }
    const f = byFeature[r.feature];
    f.calls++;
    f.totalTokens += r.totalTokens;
    f.promptTokens += r.promptTokens;
    f.completionTokens += r.completionTokens;
    f.estimatedCostUsd += r.estimatedCostUsd;
    f.avgDurationMs = (f.avgDurationMs * (f.calls - 1) + r.durationMs) / f.calls;

    if (!byModel[r.model]) {
      byModel[r.model] = { calls: 0, totalTokens: 0, estimatedCostUsd: 0 };
    }
    const m = byModel[r.model];
    m.calls++;
    m.totalTokens += r.totalTokens;
    m.estimatedCostUsd += r.estimatedCostUsd;

    const hourKey = new Date(r.timestamp).toISOString().slice(0, 13) + ':00';
    const h = hourlyMap.get(hourKey) || { calls: 0, tokens: 0, cost: 0 };
    h.calls++;
    h.tokens += r.totalTokens;
    h.cost += r.estimatedCostUsd;
    hourlyMap.set(hourKey, h);
  }

  const byHour = Array.from(hourlyMap.entries())
    .map(([hour, stats]) => ({ hour, ...stats }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .slice(-48);

  return {
    totalCalls,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 10000) / 10000,
    avgTokensPerCall: totalCalls ? Math.round(totalTokens / totalCalls) : 0,
    avgDurationMs: totalCalls ? Math.round(totalDuration / totalCalls) : 0,
    byFeature,
    byModel,
    byHour,
    recentCalls: filtered.slice(-limit).reverse(),
  };
}

/**
 * 获取生成某个用户画像所消耗的 token 概要。
 */
export function getProfileTokenCost(username: string): {
  totalTokens: number;
  estimatedCostUsd: number;
  callCount: number;
  features: string[];
} {
  ensureTimer();

  const relevant = records.filter(
    (r) => r.metadata?.username === username &&
      ['profile_analysis', 'developer_search', 'search_rerank'].includes(r.feature),
  );

  const features = [...new Set(relevant.map((r) => r.feature))];
  return {
    totalTokens: relevant.reduce((s, r) => s + r.totalTokens, 0),
    estimatedCostUsd: Math.round(relevant.reduce((s, r) => s + r.estimatedCostUsd, 0) * 10000) / 10000,
    callCount: relevant.length,
    features,
  };
}
