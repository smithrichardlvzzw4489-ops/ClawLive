import { Prisma, type PrismaClient } from "@prisma/client";

const MAX_NOTIFY_PER_POST = 120;
const MAX_SITE_MESSAGE_BODY = 19_000;
const MAX_SITE_SUBJECT = 300;
const JD_EXCERPT_CHARS = 4_000;

function publicWebBase(): string {
  const u = (process.env.SERVER_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  return u || "https://clawlab.live";
}

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

function buildAutoMatchSubject(title: string): string {
  const prefix = "【GITLINK 招聘广场】";
  const rest = title.trim().slice(0, Math.max(0, MAX_SITE_SUBJECT - prefix.length));
  return `${prefix}${rest}`.slice(0, MAX_SITE_SUBJECT);
}

function buildAutoMatchBody(
  jobPostingId: string,
  authorLabel: string,
  opts: {
    title: string;
    companyName: string | null;
    location: string | null;
    body: string;
    matchTags: string[];
  },
): string {
  const base = publicWebBase();
  const detailUrl = `${base}/job-plaza/${jobPostingId}`;
  const tags = opts.matchTags.map((t) => t.trim()).filter(Boolean).join("、");
  const excerpt = opts.body.replace(/\r\n/g, "\n").trim().slice(0, JD_EXCERPT_CHARS);
  const lines = [
    "您好，",
    "",
    "根据您在 GITLINK 上的公开技术画像标签，系统判断该职位与您的方向可能相关（自动匹配，由招聘方账号发出）。",
    "",
    `【职位】${opts.title.trim()}`,
    `【公司】${opts.companyName?.trim() || "（未填）"}`,
    `【地点】${opts.location?.trim() || "（未填）"}`,
    `【匹配标签】${tags || "—"}`,
    "",
    "【职位说明（节选）】",
    excerpt || "（无正文节选）",
    "",
    "查看详情：",
    detailUrl,
    "",
    "---",
    `发件人：${authorLabel}`,
    "如对职位不感兴趣，可忽略本信；可在个人资料中调整求职意向与公开画像。",
  ];
  const body = lines.join("\n");
  return body.length <= MAX_SITE_MESSAGE_BODY ? body : body.slice(0, MAX_SITE_MESSAGE_BODY);
}

/**
 * 向尚未记过该 JD 的用户：写入去重记录（job_posting_notifications），并发送站内信（同一事务）。
 * 匹配按画像标签与 matchTags 重叠打分，取前 N。
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
  },
): Promise<{ sent: number }> {
  const jobTags = opts.matchTags.map((t) => t.trim()).filter(Boolean);
  if (jobTags.length === 0) return { sent: 0 };

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { username: true },
  });
  const authorLabel = author?.username ? `@${author.username}` : "招聘方";

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

  const subject = buildAutoMatchSubject(opts.title);
  const body = buildAutoMatchBody(jobPostingId, authorLabel, opts);

  let sent = 0;
  for (const p of picks) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.jobPostingNotification.create({
          data: { jobPostingId, recipientId: p.id },
        });
        await tx.siteMessage.create({
          data: {
            senderId: authorId,
            recipientId: p.id,
            subject,
            body,
          },
        });
      });
      sent += 1;
    } catch {
      continue;
    }
  }

  return { sent };
}
