"use client";

import type { AgeBand } from "@/lib/vibekids/age";
import type { CreativeKind, VibeStyle } from "@/lib/vibekids/creative";

const DRAFT_KEY = "vibekids-draft-v1";

export type StudioDraft = {
  prompt: string;
  kind: CreativeKind;
  styles: VibeStyle[];
  age: AgeBand;
  saveTitle: string;
  refinePrompt: string;
  lockHint: string;
  /** 最多保留 2 份 html 草稿，控制体积 */
  versList: string[];
  versIndex: number;
};

const MAX_DRAFT_BYTES = 350_000;

export function loadDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    if (!d.versList || !Array.isArray(d.versList)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: StudioDraft): void {
  try {
    const json = JSON.stringify(d);
    if (json.length > MAX_DRAFT_BYTES) {
      const one = d.versList[d.versIndex];
      if (one) {
        d = { ...d, versList: [one], versIndex: 0 };
      }
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* quota */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* */
  }
}
