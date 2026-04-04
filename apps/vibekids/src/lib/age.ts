export type AgeBand = "primary" | "middle";

export function parseAgeBand(value: string | null | undefined): AgeBand {
  return value === "middle" ? "middle" : "primary";
}

export function ageLabel(band: AgeBand): string {
  return band === "middle" ? "初中" : "小学";
}
