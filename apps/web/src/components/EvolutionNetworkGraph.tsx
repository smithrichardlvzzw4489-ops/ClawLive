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

const STATUS_ORDER: EvolutionPointStatus[] = ['proposed', 'active', 'ended'];

/** 左 / 中 / 右 三片「星野」，用满横向空间；坐标为相对 [0,1] 的矩形内 */
const ZONE: Record<
  EvolutionPointStatus,
  { x0: number; x1: number; y0: number; y1: number; fill: string }
> = {
  proposed: {
    x0: 0.03,
    x1: 0.3,
    y0: 0.1,
    y1: 0.9,
    fill: 'rgba(245, 158, 11, 0.05)',
  },
  active: {
    x0: 0.34,
    x1: 0.66,
    y0: 0.1,
    y1: 0.9,
    fill: 'rgba(34, 211, 238, 0.05)',
  },
  ended: {
    x0: 0.7,
    x1: 0.97,
    y0: 0.1,
    y1: 0.9,
    fill: 'rgba(148, 163, 184, 0.06)',
  },
};

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 同一进化点在区内稳定、可复现的散点位置 */
function pointInZone(id: string, status: EvolutionPointStatus, w: number, h: number) {
  const z = ZONE[status];
  const h1 = strHash(`${id}|${status}|x`);
  const h2 = strHash(`${id}|${status}|y`);
  const u = (h1 % 10000) / 10000;
  const v = (h2 % 10000) / 10000;
  const x = (z.x0 + u * (z.x1 - z.x0)) * w;
  const y = (z.y0 + v * (z.y1 - z.y0)) * h;
  return { x, y };
}

type Props = {
  points: EvolutionPoint[];
  onNodeClick?: (point: EvolutionPoint) => void;
  labels: {
    center: string;
    proposed: string;
    active: string;
    ended: string;
    nodeCount: string;
    /** 说明总览图为每类热点，非全量 */
    graphHotspotBlurb?: string;
    empty: string;
    graphClickHint?: string;
  };
};

type LayoutItem = {
  p: EvolutionPoint;
  x: number;
  y: number;
  angle: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
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

/**
 * 宽画布「满天星」：三类各占左/中/右星野，自枢纽连线；数据多时每类只传热点子集。
 */
export function EvolutionNetworkGraph({ points, labels, onNodeClick }: Props) {
  const filterId = useId().replace(/:/g, '');
  const layout = useMemo(() => {
    const w = 1000;
    const h = 440;
    const cx = w / 2;
    const cy = h / 2 + 4;
    const grouped = groupByStatus(points);
    const items: LayoutItem[] = [];

    for (const status of STATUS_ORDER) {
      for (const p of grouped[status]) {
        const { x, y } = pointInZone(p.id, p.status, w, h);
        const angle = Math.atan2(y - cy, x - cx);
        items.push({ p, x, y, angle, cx, cy, w, h });
      }
    }

    return items;
  }, [points]);

  const starfield = useMemo(() => {
    const w = 1000;
    const h = 440;
    const stars: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 110; i++) {
      const hx = strHash(`star|${i}|x`);
      const hy = strHash(`star|${i}|y`);
      stars.push({
        x: ((hx % 10000) / 10000) * w,
        y: ((hy % 10000) / 10000) * h,
        r: 0.35 + ((hx >> 3) % 100) / 200,
        o: 0.08 + ((hy >> 5) % 100) / 400,
      });
    }
    return stars;
  }, []);

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
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#050810] via-[#0d1117] to-[#0a0814] shadow-[0_0_48px_rgba(34,211,238,0.1)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(88,28,135,0.14),transparent_60%)]" />
      {labels.graphClickHint && (
        <p className="relative z-10 px-3 pb-0 pt-2 text-center text-[11px] text-slate-500">{labels.graphClickHint}</p>
      )}
      {labels.graphHotspotBlurb && (
        <p className="relative z-10 px-4 pb-1 pt-1 text-center text-[11px] leading-relaxed text-slate-500">
          {labels.graphHotspotBlurb}
        </p>
      )}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="relative z-[1] h-auto w-full min-h-[320px] max-h-[480px]"
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

        {starfield.map((s, i) => (
          <circle
            key={`sf-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="rgba(226, 232, 240, 0.9)"
            opacity={s.o}
            className="pointer-events-none"
          />
        ))}

        {STATUS_ORDER.map((status) => {
          const z = ZONE[status];
          const x = z.x0 * w + 8;
          const y = z.y0 * h;
          const rw = (z.x1 - z.x0) * w - 16;
          const rh = (z.y1 - z.y0) * h;
          return (
            <rect
              key={status}
              x={x}
              y={y}
              width={rw}
              height={rh}
              rx={14}
              fill={z.fill}
              stroke="rgba(148, 163, 184, 0.1)"
              strokeWidth="1"
              className="pointer-events-none"
            />
          );
        })}

        {[0.31, 0.69].map((gx) => (
          <line
            key={gx}
            x1={gx * w}
            y1={h * 0.08}
            x2={gx * w}
            y2={h * 0.92}
            stroke="rgba(148, 163, 184, 0.09)"
            strokeWidth="1"
            strokeDasharray="4 7"
            className="pointer-events-none"
          />
        ))}

        {[
          { status: 'proposed' as const, label: labels.proposed, gx: 0.165 },
          { status: 'active' as const, label: labels.active, gx: 0.5 },
          { status: 'ended' as const, label: labels.ended, gx: 0.835 },
        ].map(({ status, label, gx }) => (
          <text
            key={status}
            x={gx * w}
            y={28}
            textAnchor="middle"
            fill="rgba(148, 163, 184, 0.75)"
            fontSize="10"
            fontWeight="600"
            letterSpacing="0.06em"
            className="pointer-events-none select-none"
          >
            {label}
          </text>
        ))}

        {layout.map(({ p, x, y, angle, cx: rcx, cy: rcy }) => {
          const col = STATUS_COLOR[p.status];
          const rVis = p.status === 'active' ? 11 : 9;
          const handleActivate = () => onNodeClick?.(p);
          const lx = x + Math.cos(angle) * 24;
          const ly = y + Math.sin(angle) * 24;
          const short = p.title.length > 8 ? `${p.title.slice(0, 7)}…` : p.title;
          return (
            <g key={p.id}>
              <line
                x1={rcx}
                y1={rcy}
                x2={x}
                y2={y}
                stroke={col.stroke}
                strokeWidth="1"
                strokeOpacity={0.28}
                className="pointer-events-none"
              />
              <circle
                cx={x}
                cy={y}
                r={24}
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
                fill="rgba(226, 232, 240, 0.9)"
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
          r={40}
          fill="rgba(139, 92, 246, 0.22)"
          stroke="rgba(167, 139, 250, 0.95)"
          strokeWidth="2"
          filter={`url(#${filterId})`}
          className="pointer-events-none"
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="700">
          {labels.center}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="rgba(148, 163, 184, 0.95)" fontSize="8">
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
