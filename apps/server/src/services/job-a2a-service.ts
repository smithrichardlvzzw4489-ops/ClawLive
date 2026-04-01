/**
 * Job A2A 实验室：双端建档、自动匹配、Agent 代聊、解锁真人。
 */
import { randomUUID } from 'crypto';
import type { JobA2AMatch, JobA2ASeekerProfile, JobA2AEmployerProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { runDarwinJobA2AReply } from '../api/routes/lobster';

export type SeekerProfileInput = {
  title: string;
  city?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  skills: string[];
  narrative: string;
  active?: boolean;
};

export type EmployerProfileInput = {
  jobTitle: string;
  city?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  skills: string[];
  companyName?: string | null;
  narrative: string;
  active?: boolean;
};

function normSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

function cityMatch(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a || '').trim().toLowerCase();
  const y = (b || '').trim().toLowerCase();
  if (!x || !y) return 0.5;
  return x === y ? 1 : 0;
}

function salaryOverlap(
  sMin: number | null | undefined,
  sMax: number | null | undefined,
  eMin: number | null | undefined,
  eMax: number | null | undefined,
): number {
  const smin = sMin ?? 0;
  const smax = sMax ?? 1_000_000;
  const emin = eMin ?? 0;
  const emax = eMax ?? 1_000_000;
  if (smax < emin || smin > emax) return 0;
  const overlap = Math.min(smax, emax) - Math.max(smin, emin);
  const span = Math.max(smax - smin, emax - emin, 1);
  return Math.min(1, overlap / span + 0.3);
}

export function computeMatchScore(
  seeker: JobA2ASeekerProfile,
  employer: JobA2AEmployerProfile,
): number {
  const ss = normSkills(seeker.skills);
  const es = normSkills(employer.skills);
  const setS = new Set(ss.map((s) => s.toLowerCase()));
  const setE = new Set(es.map((s) => s.toLowerCase()));
  let inter = 0;
  for (const x of setS) if (setE.has(x)) inter++;
  const denom = Math.max(setS.size, setE.size, 1);
  const skillScore = inter / denom;

  const salScore = salaryOverlap(seeker.salaryMin, seeker.salaryMax, employer.salaryMin, employer.salaryMax);
  const cityScore = cityMatch(seeker.city, employer.city);

  return Math.min(1, 0.45 * skillScore + 0.35 * salScore + 0.2 * cityScore);
}

const MATCH_MIN_SCORE = 0.28;

async function logEvent(data: {
  matchId?: string | null;
  userId?: string | null;
  kind: string;
  detail?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.jobA2AEvent.create({
    data: {
      id: randomUUID(),
      matchId: data.matchId ?? null,
      userId: data.userId ?? null,
      kind: data.kind,
      detail: data.detail ?? null,
      payload: data.payload ? (data.payload as object) : undefined,
    },
  });
}

export async function upsertSeekerProfile(userId: string, input: SeekerProfileInput): Promise<JobA2ASeekerProfile> {
  const row = await prisma.jobA2ASeekerProfile.upsert({
    where: { userId },
    create: {
      userId,
      title: input.title.trim(),
      city: input.city?.trim() || null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      skills: input.skills,
      narrative: input.narrative.trim(),
      active: input.active !== false,
    },
    update: {
      title: input.title.trim(),
      city: input.city?.trim() || null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      skills: input.skills,
      narrative: input.narrative.trim(),
      active: input.active !== false,
    },
  });
  await logEvent({
    userId,
    kind: 'seeker_profile_saved',
    detail: row.title,
    payload: { title: row.title, city: row.city },
  });
  return row;
}

export async function upsertEmployerProfile(
  userId: string,
  input: EmployerProfileInput,
): Promise<JobA2AEmployerProfile> {
  const row = await prisma.jobA2AEmployerProfile.upsert({
    where: { userId },
    create: {
      userId,
      jobTitle: input.jobTitle.trim(),
      city: input.city?.trim() || null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      skills: input.skills,
      companyName: input.companyName?.trim() || null,
      narrative: input.narrative.trim(),
      active: input.active !== false,
    },
    update: {
      jobTitle: input.jobTitle.trim(),
      city: input.city?.trim() || null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      skills: input.skills,
      companyName: input.companyName?.trim() || null,
      narrative: input.narrative.trim(),
      active: input.active !== false,
    },
  });
  await logEvent({
    userId,
    kind: 'employer_profile_saved',
    detail: row.jobTitle,
    payload: { jobTitle: row.jobTitle, companyName: row.companyName },
  });
  return row;
}

export async function runAutoMatch(): Promise<{ created: number; checked: number }> {
  const seekers = await prisma.jobA2ASeekerProfile.findMany({ where: { active: true } });
  const employers = await prisma.jobA2AEmployerProfile.findMany({ where: { active: true } });
  let created = 0;
  let checked = 0;

  for (const s of seekers) {
    for (const e of employers) {
      if (s.userId === e.userId) continue;
      checked += 1;
      const score = computeMatchScore(s, e);
      if (score < MATCH_MIN_SCORE) continue;

      const existing = await prisma.jobA2AMatch.findUnique({
        where: {
          seekerUserId_employerUserId: { seekerUserId: s.userId, employerUserId: e.userId },
        },
      });
      if (existing) continue;

      const m = await prisma.jobA2AMatch.create({
        data: {
          id: randomUUID(),
          seekerUserId: s.userId,
          employerUserId: e.userId,
          score,
          status: 'pending_agent',
          agentExchangeRounds: 0,
        },
      });
      created += 1;
      await logEvent({
        matchId: m.id,
        kind: 'match_created',
        detail: `score=${score.toFixed(3)}`,
        payload: { seekerUserId: s.userId, employerUserId: e.userId, score },
      });
    }
  }

  return { created, checked };
}

function fallbackAgentExchange(
  seeker: JobA2ASeekerProfile,
  employer: JobA2AEmployerProfile,
  prior: { side: string; body: string }[],
): { seekerAgent: string; employerAgent: string } {
  const sk = normSkills(seeker.skills).slice(0, 5).join('、') || '综合';
  const ek = normSkills(employer.skills).slice(0, 5).join('、') || '岗位所需';
  const round = Math.floor(prior.length / 2) + 1;

  if (round === 1) {
    return {
      seekerAgent: `【求职者 Darwin】我方候选人意向「${seeker.title}」，技能：${sk}；期望城市 ${seeker.city || '不限'}，薪资区间 ${seeker.salaryMin ?? '?'}–${seeker.salaryMax ?? '?'}。请确认岗位是否仍招人及团队技术栈是否与 ${sk} 匹配。`,
      employerAgent: `【招聘方 Darwin】我方开放岗位「${employer.jobTitle}」${employer.companyName ? `（${employer.companyName}）` : ''}，要求：${ek}；城市 ${employer.city || '面议'}，预算约 ${employer.salaryMin ?? '?'}–${employer.salaryMax ?? '?'}。若候选人可接受现场/远程政策，可请双方主人进一步沟通到岗时间。`,
    };
  }

  return {
    seekerAgent: `【求职者 Darwin】第 ${round} 轮：候选人关注成长空间与汇报线，请问团队规模与迭代节奏？`,
    employerAgent: `【招聘方 Darwin】第 ${round} 轮：团队中小步快跑，双周发版；若技能契合，可安排业务面。建议双方主人直接确认细节。`,
  };
}

function buildSeekerA2APrompt(
  seeker: JobA2ASeekerProfile,
  employer: JobA2AEmployerProfile,
  prior: { side: string; body: string }[],
): string {
  const sk = normSkills(seeker.skills).join('、');
  const ek = normSkills(employer.skills).join('、');
  const lastEmployer = [...prior].reverse().find((m) => m.side === 'employer_agent');

  return `【A2A 招聘匹配】请代表主人发言（中文）。

【对方招聘方档案】
岗位：${employer.jobTitle}
公司：${employer.companyName || '未填'}
城市：${employer.city || '不限'}
要求技能：${ek || '见描述'}
薪资预算（k）：${employer.salaryMin ?? '?'}–${employer.salaryMax ?? '?'}
JD 摘要：${employer.narrative.slice(0, 1200)}

【主人求职档案】
意向：${seeker.title}
城市：${seeker.city || '不限'}
技能：${sk || '见描述'}
期望薪资（k）：${seeker.salaryMin ?? '?'}–${seeker.salaryMax ?? '?'}
诉求：${seeker.narrative.slice(0, 800)}

${
  lastEmployer
    ? `【对方 Darwin 上一轮说】\n${lastEmployer.body.slice(0, 2000)}\n\n请继续对话：回应对方并维护主人利益。`
    : '【开场】请主动开场：表达匹配兴趣并确认岗位是否仍招人、技术栈与到岗方式是否契合。'
}`;
}

function buildEmployerA2APrompt(
  seeker: JobA2ASeekerProfile,
  employer: JobA2AEmployerProfile,
  seekerAgentText: string,
): string {
  const sk = normSkills(seeker.skills).join('、');
  const ek = normSkills(employer.skills).join('、');

  return `【A2A 招聘匹配】请作为招聘方 Darwin 回应（中文）。

【求职者 Darwin 刚说】
${seekerAgentText.slice(0, 2500)}

【求职者档案】
意向：${seeker.title}
城市：${seeker.city || '不限'}
技能：${sk || '见描述'}
期望薪资（k）：${seeker.salaryMin ?? '?'}–${seeker.salaryMax ?? '?'}
诉求：${seeker.narrative.slice(0, 800)}

【我方招聘岗位】
岗位：${employer.jobTitle}
公司：${employer.companyName || '未填'}
城市：${employer.city || '不限'}
要求技能：${ek || '见描述'}
预算（k）：${employer.salaryMin ?? '?'}–${employer.salaryMax ?? '?'}
说明：${employer.narrative.slice(0, 1000)}

请专业回应，说明团队关注点，并可询问 1–2 个关键澄清（如到岗时间、远程政策）。`;
}

export async function advanceAgentRound(matchId: string, actorUserId: string): Promise<{
  seekerMsg: { id: string; body: string };
  employerMsg: { id: string; body: string };
  match: JobA2AMatch;
}> {
  const match = await prisma.jobA2AMatch.findUnique({
    where: { id: matchId },
  });
  if (!match) throw new Error('匹配不存在');
  if (match.seekerUserId !== actorUserId && match.employerUserId !== actorUserId) {
    throw new Error('无权操作此匹配');
  }
  if (match.status !== 'pending_agent' && match.status !== 'agent_chat') {
    throw new Error('当前状态不可进行 Darwin 代聊');
  }

  const [seeker, employer] = await Promise.all([
    prisma.jobA2ASeekerProfile.findUnique({ where: { userId: match.seekerUserId } }),
    prisma.jobA2AEmployerProfile.findUnique({ where: { userId: match.employerUserId } }),
  ]);
  if (!seeker || !employer) throw new Error('档案不完整');

  const prior = await prisma.jobA2AAgentMessage.findMany({
    where: { matchId },
    orderBy: { createdAt: 'asc' },
    select: { side: true, body: true },
  });

  const seekerPrompt = buildSeekerA2APrompt(seeker, employer, prior);
  const sr = await runDarwinJobA2AReply(match.seekerUserId, seekerPrompt);
  let seekerText: string;
  if (sr.ok) {
    seekerText = sr.text;
  } else {
    seekerText = fallbackAgentExchange(seeker, employer, prior).seekerAgent;
  }

  const employerPrompt = buildEmployerA2APrompt(seeker, employer, seekerText);
  const er = await runDarwinJobA2AReply(match.employerUserId, employerPrompt);
  let employerText: string;
  if (er.ok) {
    employerText = er.text;
  } else {
    employerText = fallbackAgentExchange(seeker, employer, prior).employerAgent;
  }

  const sId = randomUUID();
  const eId = randomUUID();
  const now = new Date();

  await prisma.$transaction([
    prisma.jobA2AAgentMessage.create({
      data: { id: sId, matchId, side: 'seeker_agent', body: seekerText },
    }),
    prisma.jobA2AAgentMessage.create({
      data: { id: eId, matchId, side: 'employer_agent', body: employerText },
    }),
    prisma.jobA2AMatch.update({
      where: { id: matchId },
      data: {
        status: 'agent_chat',
        agentExchangeRounds: { increment: 1 },
        updatedAt: now,
      },
    }),
  ]);

  await logEvent({
    matchId,
    kind: 'agent_round',
    detail: `round=${match.agentExchangeRounds + 1}`,
    payload: { seekerSnippet: seekerText.slice(0, 160), employerSnippet: employerText.slice(0, 160) },
  });

  const updated = await prisma.jobA2AMatch.findUniqueOrThrow({ where: { id: matchId } });
  return {
    seekerMsg: { id: sId, body: seekerText },
    employerMsg: { id: eId, body: employerText },
    match: updated,
  };
}

export async function unlockHumanChat(matchId: string, actorUserId: string): Promise<JobA2AMatch> {
  const match = await prisma.jobA2AMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('匹配不存在');
  if (match.seekerUserId !== actorUserId && match.employerUserId !== actorUserId) {
    throw new Error('无权操作');
  }
  if (match.status !== 'agent_chat' && match.status !== 'pending_agent') {
    throw new Error('当前状态不可解锁');
  }
  if (match.agentExchangeRounds < 1) {
    throw new Error('请先至少进行一轮 Darwin 代聊');
  }

  const m = await prisma.jobA2AMatch.update({
    where: { id: matchId },
    data: { status: 'ready_human', updatedAt: new Date() },
  });
  await logEvent({
    matchId,
    userId: actorUserId,
    kind: 'human_unlocked',
    detail: '双方主人可开始聊天',
  });
  return m;
}

export async function postHumanMessage(
  matchId: string,
  authorUserId: string,
  body: string,
): Promise<{ messageId: string; match: JobA2AMatch }> {
  const text = body.trim();
  if (!text) throw new Error('消息不能为空');

  const match = await prisma.jobA2AMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('匹配不存在');
  if (match.seekerUserId !== authorUserId && match.employerUserId !== authorUserId) {
    throw new Error('无权发言');
  }
  if (match.status !== 'ready_human' && match.status !== 'human_active') {
    throw new Error('尚未解锁真人聊天');
  }

  const id = randomUUID();
  const nextStatus = match.status === 'ready_human' ? 'human_active' : match.status;

  await prisma.$transaction([
    prisma.jobA2AHumanMessage.create({
      data: { id, matchId, authorUserId, body: text },
    }),
    prisma.jobA2AMatch.update({
      where: { id: matchId },
      data: { status: nextStatus, updatedAt: new Date() },
    }),
  ]);

  await logEvent({
    matchId,
    userId: authorUserId,
    kind: 'human_message',
    detail: text.slice(0, 120),
  });

  const updated = await prisma.jobA2AMatch.findUniqueOrThrow({ where: { id: matchId } });
  return { messageId: id, match: updated };
}

export async function getMatchDetail(matchId: string, viewerUserId: string) {
  const m = await prisma.jobA2AMatch.findUnique({
    where: { id: matchId },
    include: {
      agentMessages: { orderBy: { createdAt: 'asc' } },
      humanMessages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!m) return null;
  if (m.seekerUserId !== viewerUserId && m.employerUserId !== viewerUserId) {
    return null;
  }

  const [seekerUser, employerUser, seekerProf, employerProf] = await Promise.all([
    prisma.user.findUnique({ where: { id: m.seekerUserId }, select: { id: true, username: true } }),
    prisma.user.findUnique({ where: { id: m.employerUserId }, select: { id: true, username: true } }),
    prisma.jobA2ASeekerProfile.findUnique({ where: { userId: m.seekerUserId } }),
    prisma.jobA2AEmployerProfile.findUnique({ where: { userId: m.employerUserId } }),
  ]);

  return {
    match: m,
    seekerUser,
    employerUser,
    seekerProfile: seekerProf,
    employerProfile: employerProf,
  };
}

export async function listMatchesForUser(userId: string) {
  return prisma.jobA2AMatch.findMany({
    where: {
      OR: [{ seekerUserId: userId }, { employerUserId: userId }],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      seeker: { select: { id: true, username: true } },
      employer: { select: { id: true, username: true } },
    },
  });
}

export async function getDashboard(userId: string) {
  const matches = await listMatchesForUser(userId);
  const matchIds = matches.map((m) => m.id);

  const [seeker, employer, events] = await Promise.all([
    prisma.jobA2ASeekerProfile.findUnique({ where: { userId } }),
    prisma.jobA2AEmployerProfile.findUnique({ where: { userId } }),
    prisma.jobA2AEvent.findMany({
      where: {
        OR: [{ userId }, ...(matchIds.length ? [{ matchId: { in: matchIds } }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
  ]);

  return {
    seekerProfile: seeker,
    employerProfile: employer,
    matches,
    timeline: events,
  };
}
