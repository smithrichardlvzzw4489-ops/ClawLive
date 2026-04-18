export type JdResumeMatchRow = {
  id: string;
  title: string;
  matchScore: number;
  rationale: string;
  gap?: string;
};

export type JdResumeMatchResultShape = {
  jdItemMatches: JdResumeMatchRow[];
  overallMatch: number;
  executiveSummary: string;
  notes?: string;
};

export function MathMatchResultView({ result }: { result: JdResumeMatchResultShape }) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-6">
        <p className="text-[11px] font-mono text-slate-500 mb-1">综合匹配度</p>
        <p className="text-4xl font-black text-emerald-400 tabular-nums">{result.overallMatch}</p>
        <p className="text-sm text-slate-300 mt-4 whitespace-pre-wrap leading-relaxed">{result.executiveSummary}</p>
        {result.notes ? <p className="text-xs text-slate-500 mt-3 border-t border-white/10 pt-3">{result.notes}</p> : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-3">JD 分项匹配</h3>
        <ul className="space-y-3">
          {result.jdItemMatches.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex flex-wrap gap-3 items-start"
            >
              <div className="shrink-0 w-14 text-center">
                <span className="text-lg font-bold text-violet-300 tabular-nums">{row.matchScore}</span>
                <span className="block text-[9px] text-slate-600 font-mono">/100</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{row.title}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{row.rationale}</p>
                {row.gap ? <p className="text-xs text-amber-400/90 mt-2">缺口：{row.gap}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
