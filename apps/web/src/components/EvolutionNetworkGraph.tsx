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

/** 分类内星座连线：与节点同色 */
const NET_STROKE: Record<EvolutionPointStatus, string> = {
  proposed: 'rgba(245, 158, 11, 0.32)',
  active: 'rgba(34, 211, 238, 0.28)',
  ended: 'rgba(148, 163, 184, 0.28)',
};

/** 每点连向同区内最近的 k 个邻居，边去重，形成若隐若现的局部星网 */
function nearestNeighborEdges(pts: { x: number; y: number }[], k: number): [number, number][] {
  const n = pts.length;
  if (n < 2) return [];
  const edgeSet = new Set<string>();
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const dists: { j: number; d2: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      dists.push({ j, d2: dx * dx + dy * dy });
    }
    dists.sort((a, b) => a.d2 - b.d2);
    const take = Math.min(k, dists.length);
    for (let t = 0; t < take; t++) {
      const j = dists[t].j;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        out.push([a, b]);
      }
    }
  }
  return out;
}

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
    proposed: string;
    active: string;
    ended: string;
    empty: string;
  };
};

type LayoutItem = {
  p: EvolutionPoint;
  x: number;
  y: number;
  w: number;
  h: number;
};

type ConstellationEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: EvolutionPointStatus;
};

type LayoutState = {
  nodes: LayoutItem[];
  edges: ConstellationEdge[];
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

/** 节点略有大小的星点感（稳定哈希） */
function nodeRadius(status: EvolutionPointStatus, id: string): number {
  const base = status === 'active' ? 11 : 9;
  const j = (strHash(`${id}|r`) % 5) - 2;
  return Math.max(7, base + j * 0.5);
}

/**
 * 宽画布「满天星」：三类各占左/中/右星野散点；背景远景线 + 分类内近邻星座线（若隐若现）。
 */
export function EvolutionNetworkGraph({ points, labels, onNodeClick }: Props) {
  const filterId = useId().replace(/:/g, '');
  const gridPatternId = useId().replace(/:/g, '');
  const layout = useMemo((): LayoutState => {
    const w = 1000;
    const h = 440;
    const grouped = groupByStatus(points);
    const nodes: LayoutItem[] = [];
    const edges: ConstellationEdge[] = [];
    const kNeighbors = 5;

    for (const status of STATUS_ORDER) {
      const list = grouped[status];
      const pts: { x: number; y: number }[] = [];
      for (const p of list) {
        const { x, y } = pointInZone(p.id, p.status, w, h);
        pts.push({ x, y });
        nodes.push({ p, x, y, w, h });
      }
      for (const [i, j] of nearestNeighborEdges(pts, kNeighbors)) {
        edges.push({
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[j].x,
          y2: pts[j].y,
          status,
        });
      }
    }

    return { nodes, edges, w, h };
  }, [points]);

  const starfield = useMemo(() => {
    const w = 1000;
    const h = 440;
    const stars: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 130; i++) {
      const hx = strHash(`star|${i}|x`);
      const hy = strHash(`star|${i}|y`);
      stars.push({
        x: ((hx % 10000) / 10000) * w,
        y: ((hy % 10000) / 10000) * h,
        r: 0.3 + ((hx >> 3) % 100) / 220,
        o: 0.07 + ((hy >> 5) % 100) / 380,
      });
    }
    return stars;
  }, []);

  /** 远景：随机长斜线，增强网感 */
  const ambientWeb = useMemo(() => {
    const w = 1000;
    const h = 440;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const a = strHash(`amb|${i}`);
      const b = strHash(`amb|${i}|b`);
      lines.push({
        x1: ((a % 1000) / 1000) * w,
        y1: ((b % 1000) / 1000) * h,
        x2: (((a >> 8) % 1000) / 1000) * w,
        y2: (((b >> 8) % 1000) / 1000) * h,
      });
    }
    return lines;
  }, []);

  /** 远景：较短碎线，与长斜线交错 */
  const ambientWebShort = useMemo(() => {
    const w = 1000;
    const h = 440;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < 36; i++) {
      const a = strHash(`ambs|${i}`);
      const b = strHash(`ambs|${i}|b`);
      const x1 = ((a % 1000) / 1000) * w;
      const y1 = ((b % 1000) / 1000) * h;
      const len = 40 + (strHash(`ambs|${i}|len`) % 120);
      const ang = (strHash(`ambs|${i}|ang`) % 360) * (Math.PI / 180);
      lines.push({
        x1,
        y1,
        x2: x1 + len * Math.cos(ang),
        y2: y1 + len * Math.sin(ang),
      });
    }
    return lines;
  }, []);

  if (points.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-slate-500">
        {labels.empty}
      </div>
    );
  }

  const { nodes, edges, w, h } = layout;
  const interactive = Boolean(onNodeClick);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#050810] via-[#0d1117] to-[#0a0814] shadow-[0_0_48px_rgba(34,211,238,0.08)] py-2">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_40%,rgba(30,58,138,0.08),transparent_55%)]" />
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="relative z-[1] h-auto w-full min-h-[320px] max-h-[480px]"
        aria-hidden={!interactive}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern
            id={gridPatternId}
            width={44}
            height={44}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 44 0 L 0 0 0 44"
              fill="none"
              stroke="rgba(148, 163, 184, 0.11)"
              strokeWidth="0.45"
            />
          </pattern>
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

        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={`url(#${gridPatternId})`}
          opacity={0.45}
          className="pointer-events-none"
        />

        {ambientWeb.map((ln, i) => (
          <line
            key={`amb-${i}`}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke="rgba(148, 163, 184, 0.12)"
            strokeWidth="0.75"
            strokeLinecap="round"
            className="pointer-events-none"
          />
        ))}

        {ambientWebShort.map((ln, i) => (
          <line
            key={`ambs-${i}`}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke="rgba(100, 116, 139, 0.1)"
            strokeWidth="0.55"
            strokeLinecap="round"
            strokeDasharray="1 4"
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

        {edges.map((e, i) => (
          <line
            key={`net-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={NET_STROKE[e.status]}
            strokeWidth="1.15"
            strokeOpacity={0.62}
            strokeLinecap="round"
            strokeDasharray="2 5"
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

        {nodes.map(({ p, x, y }) => {
          const col = STATUS_COLOR[p.status];
          const rVis = nodeRadius(p.status, p.id);
          const handleActivate = () => onNodeClick?.(p);
          const short = p.title.length > 8 ? `${p.title.slice(0, 7)}…` : p.title;
          return (
            <g key={p.id}>
              <circle
                cx={x}
                cy={y}
                r={26}
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
                y={y + rVis + 14}
                textAnchor="middle"
                fill="rgba(226, 232, 240, 0.9)"
                fontSize="9"
                className="pointer-events-none select-none"
              >
                {short}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
