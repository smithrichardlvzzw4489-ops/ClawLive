'use client';

/** Shared blocks for GitHub lookup + GITLINK card profile (same layout). */

export interface AISignal {
  category: 'repo' | 'tool' | 'model' | 'package' | 'content' | 'commit';
  signal: string;
  weight: number;
  source: string;
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
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-mono mb-2">Detected Signals</div>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
            {data.signals.slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="flex-shrink-0">{SIGNAL_CATEGORY_ICONS[s.category] || '•'}</span>
                <span className="text-slate-300 flex-1 truncate">{s.signal}</span>
                <span className="text-slate-600 flex-shrink-0 font-mono">{s.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
