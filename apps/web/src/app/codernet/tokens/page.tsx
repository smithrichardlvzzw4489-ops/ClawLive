'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

interface FeatureStats {
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number;
}

interface ModelStats {
  calls: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface HourlyStats {
  hour: string;
  calls: number;
  tokens: number;
  cost: number;
}

interface RecentCall {
  id: string;
  timestamp: number;
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  metadata?: Record<string, string>;
}

interface TokenUsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  avgTokensPerCall: number;
  avgDurationMs: number;
  byFeature: Record<string, FeatureStats>;
  byModel: Record<string, ModelStats>;
  byHour: HourlyStats[];
  recentCalls: RecentCall[];
}

const FEATURE_LABELS: Record<string, string> = {
  profile_analysis: 'Profile Analysis',
  developer_search: 'Developer Search',
  search_rerank: 'Search Re-rank',
  outreach_message: 'Outreach Message',
  outreach_preview: 'Outreach Preview',
  connect_agent: 'Connect Agent',
  result_summary: 'Result Summary',
  feed_excerpt: 'Feed Excerpt',
  evolver_assessment: 'Evolver Assessment',
  evolution_acceptance: 'Evolution Acceptance',
  llm_test: 'LLM Test',
  other: 'Other',
};

const FEATURE_COLORS: Record<string, string> = {
  profile_analysis: '#8b5cf6',
  developer_search: '#3b82f6',
  search_rerank: '#6366f1',
  outreach_message: '#ec4899',
  connect_agent: '#f59e0b',
  other: '#64748b',
};

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color: color || '#fff' }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function FeatureRow({ name, stats }: { name: string; stats: FeatureStats }) {
  const maxTokens = 100000;
  const barWidth = Math.min(100, (stats.totalTokens / maxTokens) * 100);
  const color = FEATURE_COLORS[name] || '#64748b';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <div className="w-32 shrink-0">
        <div className="text-xs font-mono text-slate-300">{FEATURE_LABELS[name] || name}</div>
        <div className="text-[10px] text-slate-600">{stats.calls} calls</div>
      </div>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="text-right shrink-0 w-24">
        <div className="text-xs font-mono text-slate-300">{stats.totalTokens.toLocaleString()}</div>
        <div className="text-[10px] text-emerald-400">{formatCost(stats.estimatedCostUsd)}</div>
      </div>
    </div>
  );
}

function HourlyChart({ data }: { data: HourlyStats[] }) {
  if (data.length === 0) return null;
  const maxTokens = Math.max(...data.map((d) => d.tokens), 1);

  return (
    <div className="flex items-end gap-0.5 h-20">
      {data.slice(-24).map((h) => {
        const height = Math.max(2, (h.tokens / maxTokens) * 100);
        const hourLabel = h.hour.slice(11, 16);
        return (
          <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
            <div className="w-full rounded-t bg-violet-500/60 hover:bg-violet-400/80 transition cursor-default" style={{ height: `${height}%` }} />
            <div className="absolute bottom-full mb-1 hidden group-hover:block rounded bg-black/90 px-2 py-1 text-[9px] font-mono text-white whitespace-nowrap z-10">
              {hourLabel}: {h.tokens.toLocaleString()} tokens ({formatCost(h.cost)})
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TokenUsagePage() {
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | 'all'>('24h');

  const base = API_BASE_URL || '';

  useEffect(() => {
    const since = timeRange === 'all' ? 0
      : timeRange === '1h' ? Date.now() - 3600_000
      : timeRange === '24h' ? Date.now() - 86400_000
      : Date.now() - 7 * 86400_000;

    setLoading(true);
    fetch(`${base}/api/platform/token-usage?since=${since}&limit=30`)
      .then((r) => r.json())
      .then((data) => setSummary(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [base, timeRange]);

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/10 blur-[160px]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/codernet" className="text-xs font-mono text-violet-400 tracking-wider hover:text-violet-300 transition">GITLINK</Link>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">Token Usage</span>
        </div>

        <h1 className="text-2xl font-bold mb-2">AI Token Consumption</h1>
        <p className="text-sm text-slate-500 mb-6">Real-time tracking of all LLM API calls across the platform.</p>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-6">
          {(['1h', '24h', '7d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition ${
                timeRange === range ? 'bg-violet-600 text-white' : 'bg-white/[0.06] text-slate-400 hover:text-white'
              }`}
            >
              {range === '1h' ? 'Last Hour' : range === '24h' ? 'Last 24h' : range === '7d' ? 'Last 7 Days' : 'All Time'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          </div>
        ) : summary ? (
          <>
            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Tokens" value={summary.totalTokens.toLocaleString()} sub={`Prompt: ${summary.totalPromptTokens.toLocaleString()} / Completion: ${summary.totalCompletionTokens.toLocaleString()}`} color="#8b5cf6" />
              <StatCard label="Estimated Cost" value={formatCost(summary.totalEstimatedCostUsd)} sub={`${summary.totalCalls} API calls`} color="#10b981" />
              <StatCard label="Avg Tokens/Call" value={summary.avgTokensPerCall.toLocaleString()} color="#3b82f6" />
              <StatCard label="Avg Latency" value={formatDuration(summary.avgDurationMs)} sub="per LLM call" color="#f59e0b" />
            </div>

            {/* Hourly Chart */}
            {summary.byHour.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-6">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Hourly Token Usage</h3>
                <HourlyChart data={summary.byHour} />
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] text-slate-600 font-mono">{summary.byHour[Math.max(0, summary.byHour.length - 24)]?.hour?.slice(11, 16) || ''}</span>
                  <span className="text-[9px] text-slate-600 font-mono">{summary.byHour[summary.byHour.length - 1]?.hour?.slice(11, 16) || ''}</span>
                </div>
              </div>
            )}

            {/* By Feature */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">By Feature</h3>
                <div>
                  {Object.entries(summary.byFeature)
                    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                    .map(([name, stats]) => (
                      <FeatureRow key={name} name={name} stats={stats} />
                    ))}
                  {Object.keys(summary.byFeature).length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-4">No data yet</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">By Model</h3>
                <div className="space-y-3">
                  {Object.entries(summary.byModel)
                    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                    .map(([model, stats]) => (
                      <div key={model} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                        <div>
                          <div className="text-xs font-mono text-slate-300">{model}</div>
                          <div className="text-[10px] text-slate-600">{stats.calls} calls</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-slate-300">{stats.totalTokens.toLocaleString()}</div>
                          <div className="text-[10px] text-emerald-400">{formatCost(stats.estimatedCostUsd)}</div>
                        </div>
                      </div>
                    ))}
                  {Object.keys(summary.byModel).length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-4">No data yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Calls */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-4 font-mono">Recent LLM Calls</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-[10px] text-slate-600 uppercase border-b border-white/[0.06]">
                      <th className="text-left py-2 pr-3">Time</th>
                      <th className="text-left py-2 pr-3">Feature</th>
                      <th className="text-left py-2 pr-3">Model</th>
                      <th className="text-right py-2 pr-3">Prompt</th>
                      <th className="text-right py-2 pr-3">Completion</th>
                      <th className="text-right py-2 pr-3">Total</th>
                      <th className="text-right py-2 pr-3">Cost</th>
                      <th className="text-right py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentCalls.map((call) => (
                      <tr key={call.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-slate-500">{new Date(call.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2 pr-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${FEATURE_COLORS[call.feature] || '#64748b'}20`, color: FEATURE_COLORS[call.feature] || '#94a3b8' }}>
                            {FEATURE_LABELS[call.feature] || call.feature}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-400 max-w-[120px] truncate">{call.model}</td>
                        <td className="py-2 pr-3 text-right text-slate-400">{call.promptTokens.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-slate-400">{call.completionTokens.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-white font-medium">{call.totalTokens.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-emerald-400">{formatCost(call.estimatedCostUsd)}</td>
                        <td className="py-2 text-right text-slate-500">{call.durationMs > 0 ? formatDuration(call.durationMs) : '-'}</td>
                      </tr>
                    ))}
                    {summary.recentCalls.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-slate-600">No calls recorded yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-center py-20">Failed to load data</p>
        )}

        <div className="text-center py-6">
          <Link href="/codernet" className="text-violet-500 hover:text-violet-400 text-xs font-mono transition">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
