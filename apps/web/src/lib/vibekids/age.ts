/** primary/middle 仅用于历史作品展示；创作室默认 unified */
export type AgeBand = "primary" | "middle" | "unified";

export function parseAgeBand(value: string | null | undefined): AgeBand {
  if (value === "middle" || value === "primary") return "unified";
  if (value === "unified") return "unified";
  return "unified";
}

export function ageLabel(band: AgeBand): string {
  if (band === "unified") return "通用";
  return band === "middle" ? "初中" : "小学";
}
