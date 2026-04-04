import { CREATIVE_KINDS } from "@/lib/vibekids/creative";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";

/** 卡片上一行「玩法」摘要，帮助观众快速理解作品内容 */
export function playHintLine(w: SavedWorkSummary, maxLen = 44): string {
  const p = w.prompt?.trim();
  if (p && p.length > 0) {
    return p.length <= maxLen ? p : `${p.slice(0, Math.max(0, maxLen - 1))}…`;
  }
  const kind = w.kind && w.kind !== "any" ?
    CREATIVE_KINDS.find((k) => k.id === w.kind)?.label
  : undefined;
  if (kind) return `一件「${kind}」作品，点开试玩`;
  return "点开全屏试玩";
}
