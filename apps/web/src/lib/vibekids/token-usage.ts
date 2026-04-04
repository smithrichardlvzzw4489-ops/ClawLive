/**
 * 与 OpenAI / OpenRouter chat.completions 的 usage 字段对齐（便于前端展示）。
 */
export type VibekidsTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export function tokenUsageFromOpenAICompat(
  raw: unknown,
): VibekidsTokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as RawUsage;
  const pt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const ct = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const tt =
    typeof u.total_tokens === "number" ? u.total_tokens : pt + ct;
  if (pt === 0 && ct === 0 && tt === 0) return undefined;
  return { promptTokens: pt, completionTokens: ct, totalTokens: tt };
}

export function formatTokenUsageNotice(u: VibekidsTokenUsage): string {
  return `Token：输入 ${u.promptTokens} · 输出 ${u.completionTokens} · 合计 ${u.totalTokens}`;
}
