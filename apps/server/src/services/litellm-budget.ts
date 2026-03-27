import { config } from '../config';

export class LitellmNotConfiguredError extends Error {
  constructor() {
    super('LITELLM_NOT_CONFIGURED');
    this.name = 'LitellmNotConfiguredError';
  }
}

function requireLitellm(): { base: string; masterKey: string } {
  const base = config.litellm.baseUrl;
  const masterKey = config.litellm.masterKey;
  if (!base || !masterKey) {
    throw new LitellmNotConfiguredError();
  }
  return { base, masterKey };
}

type KeyInfoShape = {
  key?: string;
  info?: {
    max_budget?: number;
    spend?: number;
    token?: string;
  };
};

export type SpendLog = {
  request_id?: string;
  model?: string;
  spend?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  startTime?: string;
  endTime?: string;
};

export type KeyStats = {
  maxBudgetUsd: number | null;
  spendUsd: number;
  remainingUsd: number | null;
  usageLogs: SpendLog[];
};

export async function fetchKeyStats(virtualKey: string): Promise<KeyStats> {
  const { base, masterKey } = requireLitellm();

  const [infoData, logsData] = await Promise.allSettled([
    fetchKeyInfo(virtualKey),
    (async () => {
      const url = new URL(`${base}/spend/logs`);
      url.searchParams.set('api_key', virtualKey);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${masterKey}` },
      });
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? (parsed as SpendLog[]) : [];
      } catch {
        return [];
      }
    })(),
  ]);

  const info = infoData.status === 'fulfilled' ? infoData.value?.info : undefined;
  const maxBudgetUsd = typeof info?.max_budget === 'number' ? info.max_budget : null;
  const spendUsd = typeof info?.spend === 'number' ? info.spend : 0;
  const remainingUsd = maxBudgetUsd !== null ? Math.max(0, maxBudgetUsd - spendUsd) : null;
  const usageLogs = logsData.status === 'fulfilled' ? logsData.value : [];

  return { maxBudgetUsd, spendUsd, remainingUsd, usageLogs };
}

export async function generateVirtualKey(params: {
  userId: string;
  maxBudgetUsd: number;
  models: string[];
}): Promise<{ key: string }> {
  const { base, masterKey } = requireLitellm();
  const body: Record<string, unknown> = {
    user_id: params.userId,
    max_budget: params.maxBudgetUsd,
  };
  if (params.models.length > 0) {
    body.models = params.models;
  }
  const res = await fetch(`${base}/key/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LiteLLM /key/generate ${res.status}: ${text.slice(0, 500)}`);
  }
  let data: { key?: string; token?: string };
  try {
    data = JSON.parse(text) as { key?: string; token?: string };
  } catch {
    throw new Error('LiteLLM /key/generate: invalid JSON');
  }
  const key = data.key ?? data.token;
  if (!key || typeof key !== 'string') {
    throw new Error('LiteLLM /key/generate: missing key in response');
  }
  return { key };
}

async function fetchKeyInfo(virtualKey: string): Promise<KeyInfoShape> {
  const { base, masterKey } = requireLitellm();
  const url = new URL(`${base}/key/info`);
  url.searchParams.set('key', virtualKey);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${masterKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LiteLLM /key/info ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as KeyInfoShape;
  } catch {
    throw new Error('LiteLLM /key/info: invalid JSON');
  }
}

/**
 * 在已有虚拟 Key 上追加 USD 预算（优先调高 max_budget；失败则退回临时加额）。
 */
export async function increaseVirtualKeyBudget(virtualKey: string, addUsd: number): Promise<void> {
  const { base, masterKey } = requireLitellm();
  if (addUsd <= 0) return;

  let info: KeyInfoShape;
  try {
    info = await fetchKeyInfo(virtualKey);
  } catch {
    info = {};
  }
  const currentMax =
    typeof info.info?.max_budget === 'number' && !Number.isNaN(info.info.max_budget)
      ? info.info.max_budget
      : 0;
  const newMax = currentMax + addUsd;

  const tryUpdate = async (payload: Record<string, unknown>) => {
    const res = await fetch(`${base}/key/update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: virtualKey, ...payload }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status}: ${text.slice(0, 400)}`);
    }
  };

  try {
    await tryUpdate({ max_budget: newMax });
  } catch (e1) {
    try {
      await tryUpdate({
        temp_budget_increase: addUsd,
        temp_budget_expiry: '365d',
      });
    } catch (e2) {
      const m1 = e1 instanceof Error ? e1.message : String(e1);
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`LiteLLM /key/update failed: ${m1} | fallback: ${m2}`);
    }
  }
}

/** 清除虚拟 Key 的模型限制，使其可访问所有模型 */
export async function clearVirtualKeyModelRestrictions(virtualKey: string): Promise<void> {
  const { base, masterKey } = requireLitellm();
  const res = await fetch(`${base}/key/update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: virtualKey, models: [] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM /key/update (clear models) ${res.status}: ${text.slice(0, 300)}`);
  }
}

export function isLitellmConfigured(): boolean {
  return Boolean(config.litellm.baseUrl && config.litellm.masterKey);
}
