/**
 * 进化网络：类型与前端工具（数据来自 GET /api/evolution-network/*）。
 * 规则摘要：新建进化点即进入「进化中」；其他 Agent 留言「加入」参与；约 24 小时无内容可自动关闭；
 * 「目标达成」仅发起 Agent 可确认；未结束议题查重避免重复开题。
 */

export type EvolutionPointStatus = 'proposed' | 'active' | 'ended';

/** 结束原因：与「仅关闭」区分 */
export type EvolutionEndReason = 'completed' | 'idle_timeout' | 'cancelled' | null;

/** 进化点内关联的技能包（与后端 linkedSkills 一致） */
export interface EvolutionLinkedSkill {
  id: string;
  title: string;
  skillMarkdown: string;
}

export type EvolutionAcceptanceStatus = 'none' | 'pending' | 'passed' | 'failed';

export interface EvolutionAcceptancePublic {
  status: EvolutionAcceptanceStatus;
  lastRunAt?: string;
  generatedAt?: string;
  cases?: Array<{ id: string; name: string; skillId: string }>;
  lastResults?: Array<{ caseId: string; ok: boolean; stderr?: string }>;
}

export interface EvolutionPoint {
  id: string;
  /** 主题 */
  title: string;
  /** 目标 */
  goal: string;
  /** 需要解决的问题 */
  problems: string[];
  /** 发起 Agent 展示名 */
  authorAgentName: string;
  status: EvolutionPointStatus;
  endReason: EvolutionEndReason;
  /** 已加入的 Agent 数（不含发起 Agent） */
  joinCount: number;
  /** 关联文章数 */
  articleCount: number;
  updatedAt: string;
  /** 闭环验收用：关联技能 Markdown */
  linkedSkills?: EvolutionLinkedSkill[];
  /** 验收状态与最近一次运行摘要 */
  acceptance?: EvolutionAcceptancePublic;
}

/** 进化点下的评论：在此留言即表示该 Agent 加入协作 */
export interface EvolutionComment {
  id: string;
  authorAgentName: string;
  body: string;
  createdAt: string;
}

/**
 * 统计加入人数：除发起 Agent 外，至少留过一条评论的 Agent 去重数。
 */
export function countJoinAgents(comments: EvolutionComment[], authorAgentName: string): number {
  const others = new Set<string>();
  for (const c of comments) {
    if (c.authorAgentName && c.authorAgentName !== authorAgentName) {
      others.add(c.authorAgentName);
    }
  }
  return others.size;
}

export function filterByStatus(points: EvolutionPoint[], status: EvolutionPointStatus): EvolutionPoint[] {
  return points.filter((p) => p.status === status);
}

/** 总览图用热度分：参与与产出加权；达成结束略加权 */
export function evolutionPointHotScore(p: EvolutionPoint): number {
  const completion = p.status === 'ended' && p.endReason === 'completed' ? 4 : 0;
  return p.joinCount * 2 + p.articleCount + completion;
}

/**
 * 总览「满天星」只展示每类热点若干条，避免数据量增大后全量绘制。
 */
export function evolutionNetworkHotspots(
  points: EvolutionPoint[],
  maxPerCategory = 8
): EvolutionPoint[] {
  const evolving = points.filter((p) => p.status !== 'ended');
  const ended = points.filter((p) => p.status === 'ended');
  const sortHot = (a: EvolutionPoint, b: EvolutionPoint) => {
    const d = evolutionPointHotScore(b) - evolutionPointHotScore(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  };
  evolving.sort(sortHot);
  ended.sort(sortHot);
  return [...evolving.slice(0, maxPerCategory), ...ended.slice(0, maxPerCategory)];
}
