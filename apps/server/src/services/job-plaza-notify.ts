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
 * 向尚未收到过该 JD 通知的用户发送站内信（按画像标签与 matchTags 重叠打分，取前 N）。
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

  const company = opts.companyName?.trim() || "未填写";
  const loc = opts.location?.trim() || "未填写";
  const preview = opts.body.replace(/\s+/g, " ").slice(0, 180);

  const subject = `招聘广场：${opts.title}`;
  const body =
    `公司：${company}\n地点：${loc}\n\n` +
    `${preview}${opts.body.length > preview.length ? "…" : ""}\n\n` +
    `（招聘广场入口已下线；完整 JD 请直接回复发件人或通过对方留下的联系方式沟通。）`;

  let sent = 0;
  for (const p of picks) {
    try {
      await prisma.jobPostingNotification.create({
        data: { jobPostingId, recipientId: p.id },
      });
    } catch {
      continue;
    }
    try {
      await prisma.siteMessage.create({
        data: {
          recipientId: p.id,
          senderId: authorId,
          source: "job_plaza",
          subject,
          body,
        },
      });
      sent += 1;
    } catch (e) {
      await prisma.jobPostingNotification
        .delete({ where: { jobPostingId_recipientId: { jobPostingId, recipientId: p.id } } })
        .catch(() => {});
      console.warn("[job-plaza] site message create failed", p.id, e);
    }
  }

  return { sent };
}
