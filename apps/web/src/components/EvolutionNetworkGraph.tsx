'use client';

import { useId, useMemo } from 'react';
import type { EvolutionPoint, EvolutionPointStatus } from '@/lib/evolution-network';

const STATUS_COLOR: Record<EvolutionPointStatus, { fill: string; stroke: string; glow: string }> = {
  proposed: {
    fill: 'rgba(251, 191, 36, 0.35)',
    stroke: 'rgba(245, 158, 11, 0.9)',
    glow: 'rgba(251, 191, 0.45)',
  },
  active: {
    fill: 'rgba(34, 211, 238, 0.25)',
    stroke: 'rgba(34, 211, 238, 0.95)',
    glow: 'rgba(34, 211, 238, 0.5)',
  },
  ended: {
    fill: 'rgba(148, 163, 184, 0.25)',
    stroke: 'rgba(148, 163, 184, 0.85)',
    glow: 'rgba(148, 163, 184, 0.25)',
  },
};

type Props = {
  points: EvolutionPoint[];
  /** 点击轨道上的进化点节点时回调（用于打开详情等） */
  onNodeClick?: (point: EvolutionPoint) => void;
  labels: {
    center: string;
    proposed: string;
    active: string;
    ended: string;
    /** 如「6 个进化点」 */
    nodeCount: string;
    empty: string;
    /** 有 onNodeClick 时展示在图下方 */
    graphClickHint?: string;
  };
};

/**
 * 轻量 SVG：中心枢纽 + 进化点沿轨道分布，颜色区分状态，营造「网络」直觉。
 */
export function EvolutionNetworkGraph({ points, labels, onNodeClick }: Props) {
  const filterId = useId().replace(/:/g, '');
  const layout = useMemo(() => {
    const w = 520;
    const h = 320;
    const cx = w / 2;
    const cy = h / 2 + 8;
    const rOrbit = 118;
    const n = Math.max(points.length, 1);
    return points.map((p, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const x = cx + rOrbit * Math.cos(angle);
      const y = cy + rOrbit * Math.sin(angle);
      return { p, x, y, cx, cy, w, h };
    });
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-slate-500">
        {labels.empty}
      </div>
    );
  }

  const first = layout[0];
  const { w, h, cx, cy } = first;

  const interactive = Boolean(onNodeClick);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#0a1628] via-[#0d1117] to-[#0f0a1a] shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.12),transparent_55%)]" />
      {labels.graphClickHint && (
        <p className="relative z-10 px-2 pb-1 pt-2 text-center text-[11px] text-slate-500">{labels.graphClickHint}</p>
      )}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-[340px]"
        aria-hidden={!interactive}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 虚线轨道 */}
        <circle
          cx={cx}
          cy={cy}
          r={118}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth="1"
          strokeDasharray="4 6"
          className="pointer-events-none"
        />

        {layout.map(({ p, x, y }) => {
          const col = STATUS_COLOR[p.status];
          const rVis = p.status === 'active' ? 11 : 9;
          const handleActivate = () => onNodeClick?.(p);
          return (
            <g key={p.id}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={col.stroke}
                strokeWidth="1.2"
                strokeOpacity={0.45}
                className="pointer-events-none"
              />
              <circle
                cx={x}
                cy={y}
                r={22}
                fill="transparent"
                className={interactive ? 'cursor-pointer' : undefined}
                onClick={interactive ? handleActivate : undefined}
              />
              <circle
                cx={x}
                cy={y}
                r={rVis}
                fill={col.fill}
                stroke={col.stroke}
                strokeWidth="1.5"
                filter={`url(#${filterId})`}
                className={`pointer-events-none ${p.status === 'active' ? 'animate-pulse' : ''}`}
              />
              <text
                x={x}
                y={y + 22}
                textAnchor="middle"
                fill="rgba(226, 232, 240, 0.85)"
                fontSize="9"
                className="pointer-events-none select-none"
              >
                {p.title.length > 8 ? `${p.title.slice(0, 7)}…` : p.title}
              </text>
            </g>
          );
        })}

        {/* 中心节点 */}
        <circle
          cx={cx}
          cy={cy}
          r={36}
          fill="rgba(139, 92, 246, 0.2)"
          stroke="rgba(167, 139, 250, 0.9)"
          strokeWidth="2"
          filter={`url(#${filterId})`}
          className="pointer-events-none"
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="700">
          {labels.center}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(148, 163, 184, 0.95)" fontSize="8">
          {labels.nodeCount}
        </text>
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/5 px-4 py-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          {labels.proposed}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
          {labels.active}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          {labels.ended}
        </span>
      </div>
    </div>
  );
}
