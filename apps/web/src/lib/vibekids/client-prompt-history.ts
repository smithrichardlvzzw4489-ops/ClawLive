"use client";

const PROMPT_HIST_KEY = "vibekids-prompt-history-v1";
const MAX_PROMPTS = 20;

export function getPromptHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROMPT_HIST_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function pushPromptHistory(prompt: string): void {
  const t = prompt.trim();
  if (t.length < 2) return;
  let list = getPromptHistory().filter((x) => x !== t);
  list = [t, ...list].slice(0, MAX_PROMPTS);
  try {
    localStorage.setItem(PROMPT_HIST_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}
