/**
 * 与 apps/server/src/lib/vibekids-design-md.ts 的预设 id 保持一致。
 * 更多完整 DESIGN.md 模板见：https://github.com/VoltAgent/awesome-design-md
 */
export type VibekidsDesignPresetId =
  | "none"
  | "notion-warm"
  | "linear-purple"
  | "vercel-mono"
  | "stripe-elegant";

export const AWESOME_DESIGN_MD_REPO =
  "https://github.com/VoltAgent/awesome-design-md";

export const VIBEKIDS_DESIGN_PRESETS: {
  id: VibekidsDesignPresetId;
  label: string;
  hint: string;
}[] = [
  { id: "none", label: "不使用预设", hint: "仅按形态与风格标签生成" },
  {
    id: "notion-warm",
    label: "Notion 感 · 暖色文档",
    hint: "浅色、柔和分区、笔记工作台气质",
  },
  {
    id: "linear-purple",
    label: "Linear 感 · 紫标极简",
    hint: "工程感、紫色强调、深色或中性底",
  },
  {
    id: "vercel-mono",
    label: "Vercel 感 · 黑白精确",
    hint: "高对比、少色、工具站气质",
  },
  {
    id: "stripe-elegant",
    label: "Stripe 感 · 优雅金融",
    hint: "浅底、紫渐变、柔和阴影与圆角",
  },
];

export function parseDesignPresetId(raw: unknown): VibekidsDesignPresetId {
  const s = typeof raw === "string" ? raw : "";
  const ok = VIBEKIDS_DESIGN_PRESETS.some((p) => p.id === s);
  return ok ? (s as VibekidsDesignPresetId) : "none";
}
