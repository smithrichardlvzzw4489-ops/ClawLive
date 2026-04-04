/** 创作形态：帮助模型对齐交互形态，不限制题材 */
export type CreativeKind =
  | "any"
  | "game"
  | "tool"
  | "story"
  | "showcase";

export const CREATIVE_KINDS: { id: CreativeKind; label: string; hint: string }[] = [
  { id: "any", label: "不限", hint: "由模型自由发挥" },
  { id: "game", label: "小游戏", hint: "有规则、得分、操作" },
  { id: "tool", label: "小工具", hint: "换算、计时、记录等" },
  { id: "story", label: "互动故事", hint: "分段、选择、叙事" },
  { id: "showcase", label: "展示页", hint: "介绍、贺卡、作品集" },
];

export type VibeStyle = "cute" | "scifi" | "minimal" | "pixel" | "pastel";

export const VIBE_STYLES: { id: VibeStyle; label: string }[] = [
  { id: "cute", label: "可爱" },
  { id: "scifi", label: "科幻" },
  { id: "minimal", label: "极简" },
  { id: "pixel", label: "像素风" },
  { id: "pastel", label: "马卡龙" },
];

export function parseKind(raw: unknown): CreativeKind {
  const k = typeof raw === "string" ? raw : "any";
  const ok = ["any", "game", "tool", "story", "showcase"].includes(k);
  return ok ? (k as CreativeKind) : "any";
}

export function formatCreativeContext(
  kind: CreativeKind,
  styles: VibeStyle[],
): string {
  const k = CREATIVE_KINDS.find((x) => x.id === kind);
  const kindLine =
    kind === "any"
      ? ""
      : `【形态】${k?.label ?? kind}（${k?.hint ?? ""}）`;

  const styleLabels = styles
    .map((s) => VIBE_STYLES.find((v) => v.id === s)?.label ?? s)
    .filter(Boolean);
  const styleLine =
    styleLabels.length === 0
      ? ""
      : `【风格】${styleLabels.join("、")}`;

  return [kindLine, styleLine].filter(Boolean).join("\n");
}
