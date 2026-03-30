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

/** 三类各占 120°，从顶侧「提议」起顺时针：提议 → 进化中 → 已结束 */
const SECTOR: Record<EvolutionPointStatus, { start: number; span: number }> = {
  proposed: { start: (-5 * Math.PI) / 6, span: (2 * Math.PI) / 3 },
  active: { start: -Math.PI / 6, span: (2 * Math.PI) / 3 },
  ended: { start: Math.PI / 2, span: (2 * Math.PI) / 3 },
};

const STATUS_ORDER: EvolutionPointStatus[] = ['proposed', 'active', 'ended'];

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

function groupByStatus(points: EvolutionPoint[]): Record<EvolutionPointStatus, EvolutionPoint[]> {
  const out: Record<EvolutionPointStatus, EvolutionPoint[]> = {
    proposed: [],
    active: [],
    ended: [],
  };
  for (const p of points) {
    out[p.status].push(p);
  }
  for (const s of STATUS_ORDER) {
    out[s].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  return out;
}

type LayoutItem = {
  p: EvolutionPoint;
  x: number;
  y: number;
  /** 自中心指向节点，用于标签外移 */
  angle: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

/**
 * 中心枢纽 + 按状态分扇区：每类占 120°，节点沿弧分布，避免单环挤成一团。
 */
export function EvolutionNetworkGraph({ points, labels, onNodeClick }: Props) {
  const filterId = useId().replace(/:/g, '');
  const layout = useMemo(() => {
    const w = 580;
    const h = 420;
    const cx = w / 2;
    const cy = h / 2 + 6;
    const rOrbit = 124;
    const grouped = groupByStatus(points);
    const items: LayoutItem[] = [];

    for (const status of STATUS_ORDER) {
      const list = grouped[status];
      const { start, span } = SECTOR[status];
      const n = list.length;
      if (n === 0) continue;
      for (let i = 0; i < n; i++) {
        const p = list[i];
        const angle = start + ((i + 0.5) * span) / n;
        const x = cx + rOrbit * Math.cos(angle);
        const y = cy + rOrbit * Math.sin(angle);
        items.push({ p, x, y, angle, cx, cy, w, h });
      }
    }

    return items;
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

  /** 扇区背景：极淡色块 + 分界虚线 */
  const sectorBg = [
    { status: 'proposed' as const, fill: 'rgba(245, 158, 11, 0.06)' },
    { status: 'active' as const, fill: 'rgba(34, 211, 238, 0.06)' },
    { status: 'ended' as const, fill: 'rgba(148, 163, 184, 0.06)' },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#0a1628] via-[#0d1117] to-[#0f0a1a] shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.12),transparent_55%)]" />
      {labels.graphClickHint && (
        <p className="relative z-10 px-2 pb-1 pt-2 text-center text-[11px] text-slate-500">{labels.graphClickHint}</p>
      )}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-[440px]"
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

        {sectorBg.map(({ status, fill }) => {
          const { start, span } = SECTOR[status];
          const r = 200;
          const x1 = cx + r * Math.cos(start);
          const y1 = cy + r * Math.sin(start);
          const x2 = cx + r * Math.cos(start + span);
          const y2 = cy + r * Math.sin(start + span);
          const largeArc = span > Math.PI ? 1 : 0;
          return (
            <path
              key={status}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={fill}
              className="pointer-events-none"
            />
          );
        })}

        {[0, 1, 2].map((k) => {
          const a = (-5 * Math.PI) / 6 + (k * (2 * Math.PI)) / 3;
          const x = cx + 190 * Math.cos(a);
          const y = cy + 190 * Math.sin(a);
          return (
            <line
              key={k}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(148, 163, 184, 0.12)"
              strokeWidth="1"
              strokeDasharray="3 5"
              className="pointer-events-none"
            />
          );
        })}

        <circle
          cx={cx}
          cy={cy}
          r={124}
          fill="none"
          stroke="rgba(148, 163, 184, 0.12)"
          strokeWidth="1"
          strokeDasharray="4 6"
          className="pointer-events-none"
        />

        {layout.map(({ p, x, y, angle, cx: rcx, cy: rcy }) => {
          const col = STATUS_COLOR[p.status];
          const rVis = p.status === 'active' ? 11 : 9;
          const handleActivate = () => onNodeClick?.(p);
          const lx = x + Math.cos(angle) * 22;
          const ly = y + Math.sin(angle) * 22;
          const short = p.title.length > 7 ? `${p.title.slice(0, 6)}…` : p.title;
          return (
            <g key={p.id}>
              <line
                x1={rcx}
                y1={rcy}
                x2={x}
                y2={y}
                stroke={col.stroke}
                strokeWidth="1.2"
                strokeOpacity={0.4}
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
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(226, 232, 240, 0.88)"
                fontSize="9"
                className="pointer-events-none select-none"
              >
                {short}
              </text>
            </g>
          );
        })}

        <circle
          cx={cx}
          cy={cy}
          r={38}
          fill="rgba(139, 92, 246, 0.22)"
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
