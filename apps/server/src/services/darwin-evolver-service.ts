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
import { publishDarwinEvolverRoundPost } from './feed-post-agent-publish';
import {
  EVOLUTION_IDLE_MS,
  initEvolutionNetwork,
  isEvolutionNetworkDisabled,
  listEvolutionPointsForUser,
  listPoints,
  toPublicPoint,
  tryCreateOrJoinSimilarOpenPoint,
} from './evolution-network-service';
import { searchGitHubSkillPackagesForEvolver } from './github-skill-hunter';

/** 同一用户两轮之间最短间隔 */
export const EVOLVER_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 服务端扫描所有 Darwin 实例的周期（持续进化） */
export const EVOLVER_GLOBAL_TICK_MS = 24 * 60 * 60 * 1000;

function formatRemainZh(ms: number): string {
  if (ms <= 0) return '0 秒';
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
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

/** 按「上一轮结束时间」限流；曾用 startedAt 排序，在并发/异常顺序下会误判为未到间隔 */
async function intervalBlockReason(userId: string): Promise<string | null> {
  let last = await prisma.evolverRound.findFirst({
    where: {
      userId,
      status: { in: ['completed', 'failed'] },
      completedAt: { not: null },
    },
    orderBy: { completedAt: 'desc' },
  });
  if (!last) {
    last = await prisma.evolverRound.findFirst({
      where: { userId, status: { in: ['completed', 'failed'] } },
      orderBy: { startedAt: 'desc' },
    });
  }
  if (!last) return null;
  const end = last.completedAt ?? last.startedAt;
  if (!end) return null;
  const elapsed = Date.now() - end.getTime();
  if (elapsed >= EVOLVER_MIN_INTERVAL_MS) return null;
  const remainMs = EVOLVER_MIN_INTERVAL_MS - elapsed;
  return `距离上一轮不足最小间隔，约 ${formatRemainZh(remainMs)} 后可再试`;
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

  const running = await prisma.evolverRound.findFirst({
    where: { userId, status: 'running' },
  });
  if (running) {
    return { ok: false, reason: '已有进行中的进化轮次，请稍候再试' };
  }

  const intervalMsg = await intervalBlockReason(userId);
  if (intervalMsg) {
    return { ok: false, reason: intervalMsg };
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
    let linkedEvoPointId: string | undefined;
    if (isEvolutionNetworkDisabled()) {
      await addEvent(
        round.id,
        'evolution_match',
        '进化网络已关闭',
        '已跳过创建/匹配进化点（EVOLUTION_NETWORK_DISABLED）',
        {},
      );
    } else {
      for (let i = 0; i < Math.min(improvements.length, maxImp); i++) {
        const line = improvements[i].slice(0, 200);
        await addEvent(round.id, 'improvement', `改进项 ${i + 1}`, line);

        const title = `改进：${line}`;
        const goal = `围绕「${line}」持续进化与产出`;
        const problems = [line, '在进化网络中协作并发布关联产出'];

        const evo = tryCreateOrJoinSimilarOpenPoint(userId, user.username, { title, goal, problems }, 'user');
        if (evo.ok) {
          if (!linkedEvoPointId) linkedEvoPointId = evo.point.id;
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
    }

    const { hits: ghHits, warnings: ghWarnings } = await searchGitHubSkillPackagesForEvolver(improvements);
    const ghDetailLines = ghHits
      .map((h) => {
        const star = h.stars != null ? ` ⭐${h.stars}` : '';
        const path = h.skillPath ? ` (${h.skillPath})` : '';
        return `• ${h.fullName}${star}${path} — ${h.description ?? ''}\n  ${h.htmlUrl}${h.skillFileUrl ? `\n  SKILL.md: ${h.skillFileUrl}` : ''}`;
      })
      .join('\n');
    await addEvent(
      round.id,
      'github_skill',
      '开源社区（GitHub）SKILL.md / 相关仓库',
      ghHits.length
        ? `${ghDetailLines}${ghWarnings.length ? `\n\n${ghWarnings.join('\n')}` : ''}`
        : `未检索到结果。${ghWarnings.join(' ') || '可配置 GITHUB_TOKEN 后重试。'}`,
      { hits: ghHits, warnings: ghWarnings },
    );

    const ghLines = ghHits.slice(0, 6).map((h) => `${h.fullName} — ${h.description ?? ''} (${h.htmlUrl})`);
    const feedPub = await publishDarwinEvolverRoundPost({
      userId,
      roundNo,
      summary,
      selfAssessment,
      improvements,
      evolutionPointId: linkedEvoPointId,
      githubLines: ghLines,
    });
    if (feedPub.ok) {
      await addEvent(round.id, 'feed_publish', '社区动态已发布', `已发布本轮进化纪要到实验室 Feed`, {
        postId: feedPub.postId,
      });
    } else {
      await addEvent(round.id, 'feed_publish', '社区动态发布失败', feedPub.error, {
        error: feedPub.error,
      });
    }

    await addEvent(
      round.id,
      'publish_hint',
      '进化方式建议',
      '已自动发布本轮纪要；你仍可在 Darwin 对话中用 publish_post 发布更多图文并关联进化点。',
    );

    if (!isEvolutionNetworkDisabled()) {
      const mine = listEvolutionPointsForUser(userId);
      const evolving = listPoints({ status: 'evolving' });
      for (const p of mine) {
        if (p.status !== 'active' && p.status !== 'proposed') continue;
        const pub = toPublicPoint(p);
        const idleMs = Date.now() - new Date(p.lastActivityAt).getTime();
        const nearIdle = idleMs > EVOLUTION_IDLE_MS * 0.9;
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
