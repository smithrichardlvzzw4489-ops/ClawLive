'use client';

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

type SimilarRow = { githubUsername: string; avatarUrl: string; similarityPercent: number; summary?: string };
type RelationRow = { githubUsername: string; avatarUrl: string; connectionDensity: number; summary?: string };

function PanelShell({
  title,
  subtitle,
  open,
  onToggle,
  disabled,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b border-white/[0.06] hover:bg-white/[0.04] disabled:opacity-40 disabled:pointer-events-none transition"
      >
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{subtitle}</div>
        </div>
        <span className="text-slate-500 text-xs font-mono shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open ? <div className="p-3">{children}</div> : null}
    </div>
  );
}

export function CodernetProfileSideColumns({
  ghUsername,
  enabled,
}: {
  ghUsername: string;
  enabled: boolean;
}) {
  const [simOpen, setSimOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [relLoading, setRelLoading] = useState(false);
  const [simErr, setSimErr] = useState<string | null>(null);
  const [relErr, setRelErr] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarRow[] | null>(null);
  const [relations, setRelations] = useState<RelationRow[] | null>(null);

  const base = API_BASE_URL || '';

  const loadSimilar = useCallback(async () => {
    if (similar !== null || simLoading) return;
    setSimLoading(true);
    setSimErr(null);
    try {
      const res = await fetch(`${base}/api/codernet/github/${encodeURIComponent(ghUsername)}/similar`);
      const data = (await res.json().catch(() => ({}))) as { people?: SimilarRow[]; error?: string; message?: string };
      if (!res.ok) {
        setSimErr(data.message || data.error || `加载失败 (${res.status})`);
        return;
      }
      setSimilar(data.people ?? []);
    } catch {
      setSimErr('网络错误');
    } finally {
      setSimLoading(false);
    }
  }, [base, ghUsername, similar, simLoading]);

  const loadRelations = useCallback(async () => {
    if (relations !== null || relLoading) return;
    setRelLoading(true);
    setRelErr(null);
    try {
      const res = await fetch(`${base}/api/codernet/github/${encodeURIComponent(ghUsername)}/relations`);
      const data = (await res.json().catch(() => ({}))) as { people?: RelationRow[]; error?: string; message?: string };
      if (!res.ok) {
        setRelErr(data.message || data.error || `加载失败 (${res.status})`);
        return;
      }
      setRelations(data.people ?? []);
    } catch {
      setRelErr('网络错误');
    } finally {
      setRelLoading(false);
    }
  }, [base, ghUsername, relations, relLoading]);

  const toggleSim = () => {
    const next = !simOpen;
    setSimOpen(next);
    if (next) void loadSimilar();
  };

  const toggleRel = () => {
    const next = !relOpen;
    setRelOpen(next);
    if (next) void loadRelations();
  };

  if (!enabled) {
    return (
      <aside className="space-y-4 text-sm text-slate-500">
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          画像加载完成后，可在此展开「相似的人」与「关系图谱」。
        </p>
      </aside>
    );
  }

  return (
    <aside className="space-y-4 w-full">
      <PanelShell
        title="相似的人"
        subtitle="根据本画像综合信息由 AI 生成 GitHub 检索条件，最多 100 人；相似度为检索相关度估算。"
        open={simOpen}
        onToggle={toggleSim}
      >
        {simLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          </div>
        ) : simErr ? (
          <p className="text-xs text-amber-400/90">{simErr}</p>
        ) : (
          <ul className="max-h-[min(70vh,520px)] overflow-y-auto space-y-1.5 pr-1">
            {(similar ?? []).map((p) => (
              <li key={p.githubUsername}>
                <Link
                  href={`/codernet/github/${encodeURIComponent(p.githubUsername)}`}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06] transition group"
                >
                  <span className="text-[10px] font-mono text-violet-400 w-10 shrink-0 text-right leading-7">
                    {p.similarityPercent}%
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.avatarUrl} alt="" className="h-7 w-7 rounded-md border border-white/10 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-mono text-slate-200 truncate group-hover:text-violet-200">
                      @{p.githubUsername}
                    </span>
                    {p.summary ? (
                      <p className="mt-1 text-[10px] text-slate-400 leading-snug line-clamp-3">{p.summary}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {similar && similar.length === 0 && !simLoading && !simErr ? (
          <p className="text-xs text-slate-500">暂无结果，可稍后再试。</p>
        ) : null}
      </PanelShell>

      <PanelShell
        title="关系图谱"
        subtitle="聚合其高星公开仓库的 contributors（跨仓累计），连接度反映共同工程参与度。"
        open={relOpen}
        onToggle={toggleRel}
      >
        {relLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : relErr ? (
          <p className="text-xs text-amber-400/90">{relErr}</p>
        ) : (
          <ul className="max-h-[min(70vh,520px)] overflow-y-auto space-y-1.5 pr-1">
            {(relations ?? []).map((p) => (
              <li key={p.githubUsername}>
                <Link
                  href={`/codernet/github/${encodeURIComponent(p.githubUsername)}`}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06] transition group"
                >
                  <span
                    className="text-[10px] font-mono text-cyan-400/90 w-10 shrink-0 text-right leading-7"
                    title="连接强度（0–100）"
                  >
                    {p.connectionDensity}%
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.avatarUrl} alt="" className="h-7 w-7 rounded-md border border-white/10 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-mono text-slate-200 truncate group-hover:text-cyan-200/90">
                      @{p.githubUsername}
                    </span>
                    {p.summary ? (
                      <p className="mt-1 text-[10px] text-slate-400 leading-snug line-clamp-3">{p.summary}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {relations && relations.length === 0 && !relLoading && !relErr ? (
          <p className="text-xs text-slate-500">暂无公开贡献者数据。</p>
        ) : null}
      </PanelShell>
    </aside>
  );
}
