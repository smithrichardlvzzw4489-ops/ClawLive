function norm(s: string): string {
  return s.trim().toLowerCase();
}

function parseJsonStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/** 从 codernetAnalysis 取技术标签（与站内 JD 自动通知逻辑一致） */
export function userTechTagsFromAnalysis(analysis: unknown): string[] {
  if (!analysis || typeof analysis !== "object") return [];
  const o = analysis as Record<string, unknown>;
  const raw = o.techTags ?? o.tech_tags;
  return parseJsonStringArray(raw);
}

export type TagMatchLine = {
  jobTag: string;
  bodyHit: boolean;
  userMatch?: string;
  points: number;
};

/**
 * 与 `job-plaza-notify` 历史实现相同的打分：每个 JD 标签最多 +1（JD 正文命中）+2（用户画像标签命中）。
 */
export function computeTagMatchPreview(jobTags: string[], userTags: string[], titleBody: string): {
  rawScore: number;
  maxScore: number;
  percent: number;
  lines: TagMatchLine[];
} {
  const hay = norm(titleBody);
  const lines: TagMatchLine[] = [];
  let rawScore = 0;
  let maxScore = 0;

  for (const jt of jobTags) {
    const j = norm(jt);
    if (!j) continue;
    maxScore += 3;
    let points = 0;
    const bodyHit = hay.includes(j);
    if (bodyHit) points += 1;
    let userMatch: string | undefined;
    for (const ut of userTags) {
      const u = norm(ut);
      if (!u) continue;
      if (u === j || u.includes(j) || j.includes(u)) {
        points += 2;
        userMatch = ut.trim();
        break;
      }
    }
    rawScore += points;
    lines.push({ jobTag: jt.trim(), bodyHit, userMatch, points });
  }

  const percent =
    maxScore === 0 ? 0 : Math.min(100, Math.round((100 * rawScore) / maxScore));

  return { rawScore, maxScore, percent, lines };
}

/** @deprecated 使用 computeTagMatchPreview；保留同名函数供通知服务按原算法取总分 */
export function scoreMatch(jobTags: string[], userTags: string[], titleBody: string): number {
  return computeTagMatchPreview(jobTags, userTags, titleBody).rawScore;
}
