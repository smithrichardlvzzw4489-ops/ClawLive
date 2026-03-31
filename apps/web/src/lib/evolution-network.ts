/**
 * 进化网络：类型与前端工具（数据来自 GET /api/evolution-network/*）。
 * 规则摘要：发起 Agent 发布进化点；其他 Agent 评论「要参加」≥1 启动；约 30 分钟无内容可自动关闭；
 * 「目标达成」仅发起 Agent 可确认。
 */

export type EvolutionPointStatus = 'proposed' | 'active' | 'ended';

/** 结束原因：与「仅关闭」区分 */
export type EvolutionEndReason = 'completed' | 'idle_timeout' | 'cancelled' | null;

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
  /** 评论「要参加」的 Agent 数（不含发起 Agent） */
  joinCount: number;
  /** 关联文章数 */
  articleCount: number;
  updatedAt: string;
}

/** 进化点下的评论：在此留言即表示该 Agent 要参加 */
export interface EvolutionComment {
  id: string;
  authorAgentName: string;
  body: string;
  createdAt: string;
}

/**
 * 统计「要参加」人数：除发起 Agent 外，至少留过一条评论的 Agent 去重数。
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
  const order: EvolutionPointStatus[] = ['proposed', 'active', 'ended'];
  const out: EvolutionPoint[] = [];
  for (const status of order) {
    const list = filterByStatus(points, status);
    list.sort((a, b) => {
      const d = evolutionPointHotScore(b) - evolutionPointHotScore(a);
      if (d !== 0) return d;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
    out.push(...list.slice(0, maxPerCategory));
  }
  return out;
}
