import { Prisma, type PrismaClient } from "@prisma/client";

const MAX_NOTIFY_PER_POST = 120;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function parseJsonStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/** 从 codernetAnalysis 取技术标签 */
function userTechTagsFromAnalysis(analysis: unknown): string[] {
  if (!analysis || typeof analysis !== "object") return [];
  const o = analysis as Record<string, unknown>;
  const raw = o.techTags ?? o.tech_tags;
  return parseJsonStringArray(raw);
}

function scoreMatch(jobTags: string[], userTags: string[], titleBody: string): number {
  const hay = norm(titleBody);
  let score = 0;
  for (const jt of jobTags) {
    const j = norm(jt);
    if (!j) continue;
    if (hay.includes(j)) score += 1;
    for (const ut of userTags) {
      const u = norm(ut);
      if (!u) continue;
      if (u === j || u.includes(j) || j.includes(u)) {
        score += 2;
        break;
      }
    }
  }
  return score;
}

/**
 * 向尚未记过该 JD 推送的用户写入去重记录（按画像标签与 matchTags 重叠打分，取前 N）。
 * 匹配通知写入 job_posting_notifications；用户间私信见 /api/site-messages。
 */
export async function notifyMatchedUsersForJobPosting(
  prisma: PrismaClient,
  jobPostingId: string,
  authorId: string,
  opts: {
    title: string;
    companyName: string | null;
    location: string | null;
    body: string;
    matchTags: string[];
  }
): Promise<{ sent: number }> {
  const jobTags = opts.matchTags.map((t) => t.trim()).filter(Boolean);
  if (jobTags.length === 0) return { sent: 0 };

  const titleBody = `${opts.title}\n${opts.body}`;

  const already = await prisma.jobPostingNotification.findMany({
    where: { jobPostingId },
    select: { recipientId: true },
  });
  const skip = new Set(already.map((r) => r.recipientId));
  skip.add(authorId);

  const users = await prisma.user.findMany({
    where: {
      id: { not: authorId },
      codernetAnalysis: { not: Prisma.DbNull },
    },
    select: {
      id: true,
      codernetAnalysis: true,
      openToOpportunities: true,
    },
    take: 8000,
  });

  type Row = { id: string; score: number; open: boolean };
  const scored: Row[] = [];
  for (const u of users) {
    if (skip.has(u.id)) continue;
    const userTags = userTechTagsFromAnalysis(u.codernetAnalysis);
    const s = scoreMatch(jobTags, userTags, titleBody);
    if (s < 1) continue;
    if (!u.openToOpportunities && s < 3) continue;
    scored.push({ id: u.id, score: s, open: !!u.openToOpportunities });
  }

  scored.sort((a, b) => b.score - a.score || (b.open ? 1 : 0) - (a.open ? 1 : 0));
  const picks = scored.slice(0, MAX_NOTIFY_PER_POST);

  let sent = 0;
  for (const p of picks) {
    try {
      await prisma.jobPostingNotification.create({
        data: { jobPostingId, recipientId: p.id },
      });
      sent += 1;
    } catch {
      continue;
    }
  }

  return { sent };
}
