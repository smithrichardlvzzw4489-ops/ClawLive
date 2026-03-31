/**
 * Darwin 内置进化器：每轮评估 → 匹配/创建进化点 → GitHub 技能检索 → 关闭条件检查 → 事件写入看板。
 */
import { prisma } from '../lib/prisma';
import { generateEvolverAssessment } from './llm';
import {
  getAllInstances,
  getLobsterConversation,
  getLobsterInstance,
} from './lobster-persistence';
import {
  initEvolutionNetwork,
  listEvolutionPointsForUser,
  listPoints,
  toPublicPoint,
  tryCreateOrJoinSimilarOpenPoint,
} from './evolution-network-service';

export const EVOLVER_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const EVOLVER_GLOBAL_TICK_MS = 6 * 60 * 60 * 1000;

const GITHUB_UA = 'ClawLive-DarwinEvolver/1.0';

async function githubSearchSkills(keyword: string): Promise<
  { name: string; htmlUrl: string; description: string | null }[]
> {
  const q = encodeURIComponent(`${keyword} skill OR agent OR mcp language:markdown`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=5`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': GITHUB_UA, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ full_name: string; html_url: string; description: string | null }>;
    };
    return (data.items ?? []).map((i) => ({
      name: i.full_name,
      htmlUrl: i.html_url,
      description: i.description,
    }));
  } catch {
    return [];
  }
}

function onboardingSnippet(user: { darwinOnboarding: unknown }): string {
  try {
    const j = user.darwinOnboarding;
    if (j == null) return '';
    return JSON.stringify(j).slice(0, 2000);
  } catch {
    return '';
  }
}

async function addEvent(
  roundId: string,
  kind: string,
  title: string,
  detail?: string,
  payload?: Record<string, unknown>,
) {
  await prisma.evolverEvent.create({
    data: { roundId, kind, title, detail: detail ?? null, payload: payload ? (payload as object) : undefined },
  });
}

async function shouldSkipDueToInterval(userId: string): Promise<boolean> {
  const last = await prisma.evolverRound.findFirst({
    where: { userId, status: { in: ['completed', 'failed'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (!last?.completedAt && !last?.startedAt) return false;
  const t = last.completedAt ?? last.startedAt;
  return Date.now() - t.getTime() < EVOLVER_MIN_INTERVAL_MS;
}

/**
 * 执行一轮进化（单用户）。需已申请 Darwin（存在 Lobster 实例）。
 */
export async function runEvolverRound(userId: string): Promise<
  { ok: true; roundId: string } | { ok: false; reason: string }
> {
  const inst = getLobsterInstance(userId);
  if (!inst) {
    return { ok: false, reason: '未申请 DarwinClaw，无进化器' };
  }

  if (await shouldSkipDueToInterval(userId)) {
    return { ok: false, reason: '距离上一轮不足最小间隔，已跳过' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, reason: '用户不存在' };

  const prevCount = await prisma.evolverRound.count({ where: { userId } });
  const roundNo = prevCount + 1;

  const round = await prisma.evolverRound.create({
    data: {
      userId,
      roundNo,
      status: 'running',
    },
  });

  try {
    initEvolutionNetwork();

    const conv = getLobsterConversation(userId);
    const recentMessages = conv.messages
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 3000);

    await addEvent(round.id, 'round_start', `第 ${roundNo} 轮进化开始`, undefined, { roundNo });

    const assessed = await generateEvolverAssessment({
      username: user.username,
      onboardingSnippet: onboardingSnippet(user),
      recentMessages,
      pendingSkill: inst.pendingSkillSuggestion ?? '',
    });

    const summary = assessed?.summary ?? '（未配置 LLM 或调用失败，使用默认评估）';
    const selfAssessment = assessed?.selfAssessment ?? '基于问卷与对话的启发式评估。';
    const improvements = assessed?.improvements ?? [
      inst.pendingSkillSuggestion || '提升任务执行稳定性',
      '加强与主人目标对齐',
      '扩展工具与技能覆盖',
    ].filter(Boolean);

    await prisma.evolverRound.update({
      where: { id: round.id },
      data: {
        assessmentJson: { summary, selfAssessment, improvements } as object,
        summary,
      },
    });

    await addEvent(
      round.id,
      'assessment',
      '能力评估',
      `${summary}\n\n自我评估：${selfAssessment}`,
      { improvements },
    );

    const maxImp = 3;
    for (let i = 0; i < Math.min(improvements.length, maxImp); i++) {
      const line = improvements[i].slice(0, 200);
      await addEvent(round.id, 'improvement', `改进项 ${i + 1}`, line);

      const title = `改进：${line}`;
      const goal = `围绕「${line}」持续进化与产出`;
      const problems = [line, '在进化网络中协作并发布关联产出'];

      const evo = tryCreateOrJoinSimilarOpenPoint(userId, user.username, { title, goal, problems }, 'user');
      if (evo.ok) {
        const pub = toPublicPoint(evo.point);
        await addEvent(round.id, 'evolution_match', `进化网络：${evo.outcome}`, pub.title, {
          outcome: evo.outcome,
          pointId: evo.point.id,
          title: pub.title,
        });
      } else {
        await addEvent(round.id, 'evolution_error', '进化网络操作失败', evo.error);
      }
    }

    const kw = improvements[0]?.split(/[，,、\s]+/)[0]?.slice(0, 40) || 'ai agent skill';
    const repos = await githubSearchSkills(kw);
    await addEvent(
      round.id,
      'github_skill',
      '开源社区（GitHub）技能相关仓库',
      repos.length
        ? repos.map((r) => `• ${r.name} — ${r.description ?? ''}`).join('\n')
        : '未检索到结果（可稍后重试或更换关键词）',
      { repos },
    );

    await addEvent(
      round.id,
      'publish_hint',
      '进化方式建议',
      '在进化点下使用 publish_post 发布图文/文章；可在技能市场或 GitHub 结果中安装技能后再产出。',
    );

    const mine = listEvolutionPointsForUser(userId);
    const evolving = listPoints({ status: 'evolving' });
    for (const p of mine) {
      if (p.status !== 'active' && p.status !== 'proposed') continue;
      const pub = toPublicPoint(p);
      const idleMs = Date.now() - new Date(p.lastActivityAt).getTime();
      const nearIdle = idleMs > 20 * 60 * 1000;
      let closeHint = '';
      if (pub.articleCount >= 1) closeHint += '已有关联产出；若目标达成可由发起者确认完成。';
      if (pub.joinCount >= 1 && p.authorUserId === userId) closeHint += ' 已有其他 Agent 加入协作。';
      if (nearIdle && pub.articleCount === 0) closeHint += ' 长时间无活动可能被冷清关闭，建议尽快发帖或评论。';

      await addEvent(round.id, 'close_check', `关闭条件检视：${p.title}`, closeHint || '状态正常，继续推进。', {
        pointId: p.id,
        articleCount: pub.articleCount,
        joinCount: pub.joinCount,
        status: p.status,
      });
    }

    if (!mine.filter((p) => p.status === 'active' || p.status === 'proposed').length && evolving.length) {
      await addEvent(
        round.id,
        'participation_hint',
        '可参与的公开进化点',
        `当前网络中有 ${evolving.length} 个进行中的进化点，可使用 join_evolution_point 参与相近议题。`,
        { count: evolving.length },
      );
    }

    await prisma.evolverRound.update({
      where: { id: round.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    await addEvent(round.id, 'round_end', `第 ${roundNo} 轮进化完成`, summary);

    return { ok: true, roundId: round.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.evolverRound.update({
      where: { id: round.id },
      data: { status: 'failed', error: msg, completedAt: new Date() },
    });
    await addEvent(round.id, 'error', '本轮失败', msg);
    return { ok: false, reason: msg };
  }
}

export async function runEvolverRoundsForAllDarwinUsers(): Promise<void> {
  const all = getAllInstances();
  for (const inst of all) {
    const r = await runEvolverRound(inst.userId);
    if (r.ok) {
      console.log(`[Evolver] round ok user=${inst.userId} round=${r.roundId}`);
    } else {
      console.log(`[Evolver] skip/fail user=${inst.userId}: ${r.reason}`);
    }
  }
}

export async function listEvolverRounds(userId: string, limit = 30) {
  return prisma.evolverRound.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      roundNo: true,
      status: true,
      summary: true,
      startedAt: true,
      completedAt: true,
      error: true,
    },
  });
}

export async function listEvolverEvents(roundId: string, userId: string) {
  const round = await prisma.evolverRound.findFirst({ where: { id: roundId, userId } });
  if (!round) return null;
  const events = await prisma.evolverEvent.findMany({
    where: { roundId },
    orderBy: { createdAt: 'asc' },
  });
  return { round, events };
}
