'use client';

import { useState } from 'react';

export type QuadrantData = {
  frontend: number;
  backend: number;
  infra: number;
  ai_ml: number;
};

const DIM_META: Array<{
  key: keyof QuadrantData;
  label: string;
  angleDeg: number;
  detail: string;
}> = [
  {
    key: 'frontend',
    label: 'Frontend',
    angleDeg: -90,
    detail:
      '依据公开仓库中的前端技术栈（如 TypeScript/JavaScript、React、Vue、CSS/HTML 相关仓库与描述）、语言占比与代表性项目推断界面与客户端侧能力倾向。',
  },
  {
    key: 'backend',
    label: 'Backend',
    angleDeg: 0,
    detail:
      '依据服务端语言与框架（如 Go、Java、Node、Python API、Rust 服务等）、仓库主题与描述中偏后端的贡献推断。',
  },
  {
    key: 'infra',
    label: 'Infra / DevOps',
    angleDeg: 90,
    detail:
      '依据 CI/CD、Docker/K8s、Terraform、监控与运维类仓库或描述、以及提交与项目主题中偏基础设施与交付的部分推断。',
  },
  {
    key: 'ai_ml',
    label: 'AI / ML',
    angleDeg: 180,
    detail:
      '依据机器学习、深度学习、LLM、数据科学相关仓库与依赖、论文式 README、模型/数据集类项目及多平台（如 Hugging Face）公开信号推断。',
  },
];

/** 仅绘制网格与多边形顶点，不在 SVG 内写文字，避免被容器裁切。 */
function QuadrantRadarSvg({ data }: { data: QuadrantData }) {
  const W = 200;
  const H = 200;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = 88;

  const points = DIM_META.map((d) => {
    const val = data[d.key] / 100;
    const rad = (d.angleDeg * Math.PI) / 180;
    return {
      key: d.key,
      x: cx + Math.cos(rad) * maxR * val,
      y: cy + Math.sin(rad) * maxR * val,
    };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <circle
          key={s}
          cx={cx}
          cy={cy}
          r={maxR * s}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      ))}
      {DIM_META.map((d) => {
        const rad = (d.angleDeg * Math.PI) / 180;
        return (
          <line
            key={d.key}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(rad) * maxR}
            y2={cy + Math.sin(rad) * maxR}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
          />
        );
      })}
      <polygon
        points={polyPoints}
        fill="rgba(139,92,246,0.2)"
        stroke="rgba(139,92,246,0.7)"
        strokeWidth={1.5}
      />
      {points.map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r={4} fill="#8b5cf6" stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

function AxisChip({
  dimKey,
  label,
  score,
  placement,
  onOpen,
}: {
  dimKey: keyof QuadrantData;
  label: string;
  score: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
  onOpen: (k: keyof QuadrantData) => void;
}) {
  const align =
    placement === 'left'
      ? 'items-end text-right'
      : placement === 'right'
        ? 'items-start text-left'
        : 'items-center text-center';

  return (
    <button
      type="button"
      onClick={() => onOpen(dimKey)}
      className={`flex flex-col gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 transition hover:border-violet-500/35 hover:bg-white/[0.07] ${align}`}
    >
      <span className="text-[11px] font-medium leading-snug text-slate-200">{label}</span>
      <span className="font-mono text-base font-bold tabular-nums text-violet-400">{score}</span>
      <span className="text-[10px] text-violet-400/70">推断依据 →</span>
    </button>
  );
}

export function CapabilityQuadrantPanel({
  data,
  title = 'Capability Quadrant',
}: {
  data: QuadrantData;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openKey, setOpenKey] = useState<keyof QuadrantData | null>(null);

  const openDimension = (k: keyof QuadrantData) => {
    setOpen(false);
    setOpenKey(k);
  };

  return (
    <div className="overflow-visible">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">{title}</h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-violet-300 transition hover:border-violet-500/30 hover:bg-white/[0.07]"
        >
          数据从哪来？
        </button>
      </div>

      {/* 四周为完整维度名 + 分；中心为纯几何雷达，避免 SVG 文字裁切 */}
      <div className="mx-auto w-full max-w-[min(100%,380px)] overflow-visible px-1">
        <div className="grid grid-cols-[minmax(4.5rem,1fr)_minmax(9rem,11rem)_minmax(4.5rem,1fr)] grid-rows-[auto_minmax(9rem,12rem)_auto] items-center justify-items-center gap-x-1 gap-y-2 sm:grid-cols-[minmax(5.5rem,1fr)_minmax(10rem,12rem)_minmax(5.5rem,1fr)] sm:gap-x-2">
          <div className="col-span-3 col-start-1 row-start-1 flex w-full justify-center sm:col-span-1 sm:col-start-2">
            <AxisChip
              dimKey="frontend"
              label="Frontend"
              score={data.frontend}
              placement="top"
              onOpen={openDimension}
            />
          </div>

          <div className="col-start-1 row-start-2 flex w-full max-w-[6.5rem] justify-end justify-self-end sm:max-w-none">
            <AxisChip
              dimKey="ai_ml"
              label="AI / ML"
              score={data.ai_ml}
              placement="left"
              onOpen={openDimension}
            />
          </div>

          <div className="col-start-2 row-start-2 flex aspect-square w-full max-w-[min(100%,220px)] items-center justify-center">
            <QuadrantRadarSvg data={data} />
          </div>

          <div className="col-start-3 row-start-2 flex w-full max-w-[6.5rem] justify-start justify-self-start sm:max-w-none">
            <AxisChip dimKey="backend" label="Backend" score={data.backend} placement="right" onOpen={openDimension} />
          </div>

          <div className="col-span-3 col-start-1 row-start-3 flex w-full justify-center sm:col-span-1 sm:col-start-2">
            <AxisChip
              dimKey="infra"
              label="Infra / DevOps"
              score={data.infra}
              placement="bottom"
              onOpen={openDimension}
            />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-600">
        分数为 <strong className="text-slate-500">0–100</strong> 的估计值，由画像生成时的 LLM 根据
        <strong className="text-slate-500"> 公开 GitHub 与多平台信号</strong>写入{' '}
        <code className="text-[9px] text-violet-500/90">capabilityQuadrant</code>。点击任一维度或「数据从哪来？」查看说明。
      </p>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cq-modal-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0c101c] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="cq-modal-title" className="mb-3 text-sm font-bold text-white">
              能力象限 · 数据从哪来？
            </h4>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              四个分数由 <strong className="text-slate-300">GITLINK AI</strong> 在生成画像时输出，保存在分析结果字段{' '}
              <code className="text-[10px] text-violet-400">capabilityQuadrant</code>（frontend / backend / infra /
              ai_ml）。模型会阅读本次拉取的{' '}
              <strong className="text-slate-300">公开仓库列表、语言统计、README 与提交样本</strong>
              ；若开启多平台扫描，还会参考 Stack Overflow、npm、Hugging Face 等<strong className="text-slate-300">公开信号</strong>
              ，再对四个方向做综合推断。
            </p>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              这是<strong className="text-slate-400">启发式画像</strong>，不是考试或职级认证；同一仓库在不同时间重扫也可能略有波动。
            </p>
            <p className="mb-4 text-[10px] font-mono text-slate-600">与技术标签、锐评、仓库下钻等同一次分析流水线产出。</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {openKey && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cq-dim-title"
          onClick={() => setOpenKey(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0c101c] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const d = DIM_META.find((x) => x.key === openKey)!;
              return (
                <>
                  <h4 id="cq-dim-title" className="mb-1 text-sm font-bold text-white">
                    {d.label} <span className="font-mono text-violet-400">· {data[d.key]}</span>
                  </h4>
                  <p className="mb-3 font-mono text-xs text-slate-500">该维度分数的推断依据（说明）</p>
                  <p className="mb-5 text-xs leading-relaxed text-slate-300">{d.detail}</p>
                  <button
                    type="button"
                    onClick={() => setOpenKey(null)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.08] py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.12]"
                  >
                    关闭
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
