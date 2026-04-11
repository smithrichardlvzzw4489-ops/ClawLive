'use client';

import { useCallback, useEffect, useState } from 'react';

/** Shared blocks for GitHub lookup + GITLINK card profile (same layout). */

export interface AISignal {
  category: 'repo' | 'tool' | 'model' | 'package' | 'content' | 'commit';
  signal: string;
  weight: number;
  source: string;
  /** 主站入口（仓库、HF、npm 等） */
  href?: string;
  /** 结构化明细（多行） */
  detail?: string;
}

export interface AIEngagement {
  overall: number;
  breakdown: {
    aiProjects: number;
    aiToolUsage: number;
    aiModelPublishing: number;
    aiKnowledgeSharing: number;
    aiPackageContrib: number;
  };
  signals: AISignal[];
  level: 'none' | 'explorer' | 'practitioner' | 'builder' | 'leader';
  levelLabel: string;
  summary: string;
}

export type ProfileMultiPlatformInsights = {
  communityInfluenceScore?: number;
  knowledgeSharingScore?: number;
  packageImpactScore?: number;
  aiMlImpactScore?: number;
  algorithmScore?: number;
  hfTopPipelineTags?: string[];
  stackOverflowTopTags?: string[];
};

export function PlatformBadges({ platforms }: { platforms: string[] }) {
  const icons: Record<string, { color: string; label: string }> = {
    GitHub: { color: '#8b949e', label: 'GitHub' },
    'Stack Overflow': { color: '#f48024', label: 'SO' },
    npm: { color: '#cb3837', label: 'npm' },
    PyPI: { color: '#3775a9', label: 'PyPI' },
    'DEV.to': { color: '#0a0a0a', label: 'DEV.to' },
    'Hugging Face': { color: '#ffcc00', label: 'HF' },
    GitLab: { color: '#fc6d26', label: 'GitLab' },
    LeetCode: { color: '#ffa116', label: 'LeetCode' },
    Kaggle: { color: '#20beff', label: 'Kaggle' },
    Codeforces: { color: '#1f8acb', label: 'CF' },
    'Docker Hub': { color: '#2496ed', label: 'Docker' },
    'crates.io': { color: '#dea584', label: 'crates' },
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => {
        const cfg = icons[p] || { color: '#666', label: p };
        return (
          <span
            key={p}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border"
            style={{ borderColor: `${cfg.color}40`, color: cfg.color, background: `${cfg.color}10` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

export function InfluenceBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 font-mono w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono font-bold w-6 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

const LEVEL_CONFIG: Record<
  AIEngagement['level'],
  { color: string; bg: string; icon: string; border: string }
> = {
  leader: { color: 'text-amber-400', bg: 'bg-amber-400/10', icon: '🏆', border: 'border-amber-400/30' },
  builder: { color: 'text-violet-400', bg: 'bg-violet-400/10', icon: '🔨', border: 'border-violet-400/30' },
  practitioner: { color: 'text-cyan-400', bg: 'bg-cyan-400/10', icon: '⚡', border: 'border-cyan-400/30' },
  explorer: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: '🔍', border: 'border-emerald-400/30' },
  none: { color: 'text-slate-500', bg: 'bg-slate-500/10', icon: '—', border: 'border-slate-500/30' },
};

const BREAKDOWN_LABELS: Record<string, { label: string; color: string }> = {
  aiProjects: { label: 'AI Projects', color: '#3b82f6' },
  aiToolUsage: { label: 'AI Tools', color: '#8b5cf6' },
  aiModelPublishing: { label: 'Model Publishing', color: '#f59e0b' },
  aiKnowledgeSharing: { label: 'Knowledge Sharing', color: '#10b981' },
  aiPackageContrib: { label: 'AI Packages', color: '#ef4444' },
};

const SIGNAL_CATEGORY_ICONS: Record<string, string> = {
  repo: '📁',
  tool: '🛠️',
  model: '🤖',
  package: '📦',
  content: '✍️',
  commit: '💬',
};

export function AIEngagementCard({ data }: { data: AIEngagement }) {
  const cfg = LEVEL_CONFIG[data.level];
  const maxDim = Math.max(...Object.values(data.breakdown), 1);
  const [selected, setSelected] = useState<AISignal | null>(null);

  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, closeDetail]);

  return (
    <div className={`rounded-xl border ${cfg.border} bg-white/[0.02] p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{cfg.icon}</span>
          <span className="text-sm font-semibold text-white">AI Engagement Score</span>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>{data.levelLabel}</div>
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={
                data.level === 'leader'
                  ? '#f59e0b'
                  : data.level === 'builder'
                    ? '#8b5cf6'
                    : data.level === 'practitioner'
                      ? '#06b6d4'
                      : '#10b981'
              }
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${data.overall} ${100 - data.overall}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-black font-mono ${cfg.color}`}>{data.overall}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed flex-1">{data.summary}</p>
      </div>

      <div className="space-y-2 mb-5">
        {Object.entries(data.breakdown).map(([key, value]) => {
          const meta = BREAKDOWN_LABELS[key];
          if (!meta || value === 0) return null;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-28 truncate font-mono">{meta.label}</span>
              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(value / maxDim) * 100}%`, backgroundColor: meta.color }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 w-5 text-right">{value}</span>
            </div>
          );
        })}
      </div>

      {data.signals.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-mono mb-1">Detected Signals</div>
          <p className="text-[9px] text-slate-600 font-mono mb-2 leading-relaxed">
            点击任一行查看明细与外链；数据来自公开 API，重新分析后字段会更新。
          </p>
          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {data.signals.map((s, i) => (
              <button
                key={`${s.signal}-${i}`}
                type="button"
                onClick={() => setSelected(s)}
                className="w-full flex items-start gap-2 text-left rounded-lg px-2 py-1.5 text-[11px] border border-transparent hover:border-white/[0.08] hover:bg-white/[0.05] transition group"
              >
                <span className="flex-shrink-0 mt-0.5">{SIGNAL_CATEGORY_ICONS[s.category] || '•'}</span>
                <span className="text-slate-300 flex-1 min-w-0 line-clamp-2 group-hover:text-white">{s.signal}</span>
                <span className="text-slate-600 flex-shrink-0 font-mono text-[10px]">{s.source}</span>
                <span className="text-slate-600 flex-shrink-0 text-[10px] opacity-0 group-hover:opacity-100 transition">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="codernet-signal-detail-title"
          onClick={closeDetail}
        >
          <div
            className="w-full sm:max-w-lg sm:rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl max-h-[min(88vh,680px)] flex flex-col sm:mb-0 mb-0 rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-white/[0.08] shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Signal detail</div>
                <h4 id="codernet-signal-detail-title" className="text-sm text-white mt-1 leading-snug break-words">
                  {selected.signal}
                </h4>
                <div className="text-[10px] text-slate-500 mt-2 font-mono">
                  {selected.source} · weight {selected.weight}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:text-white hover:bg-white/[0.08] text-sm font-mono"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              {selected.href ? (
                <a
                  href={selected.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mb-4 rounded-lg bg-sky-500/15 border border-sky-500/30 px-3 py-2 text-xs font-mono text-sky-300 hover:bg-sky-500/25 transition break-all"
                >
                  在来源站打开 <span aria-hidden>↗</span>
                </a>
              ) : (
                <p className="text-[10px] text-slate-500 font-mono mb-4">本条未附带直达链接，可在下方原始字段中自行检索。</p>
              )}
              {selected.detail ? (
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-black/40 rounded-xl p-3 border border-white/[0.06] max-h-[min(50vh,360px)] overflow-y-auto">
                  {selected.detail}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  暂无结构化明细。若已配置外链，请优先点击「在来源站打开」查看完整上下文。
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
