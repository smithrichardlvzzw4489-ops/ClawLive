'use client';

export interface JobSeekingSignalDTO {
  kind: string;
  title: string;
  detail: string;
  url: string;
  recordedAt: string;
}

export interface JobSeekingPayload {
  active: boolean;
  signals: JobSeekingSignalDTO[];
}

/**
 * 画像页：当公开网络或站内存在求职意向依据时展示（无依据时不渲染）。
 */
export function JobSeekingPanel({ jobSeeking }: { jobSeeking: JobSeekingPayload | null | undefined }) {
  if (!jobSeeking?.active || !jobSeeking.signals?.length) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 mb-5">
      <div className="flex flex-wrap items-baseline gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-200/95">求职意向</span>
        <span className="text-[10px] font-mono text-slate-500">
          依据公开网络文案与站内声明；仅供参考，请自行核实。
        </span>
      </div>
      <ul className="space-y-3">
        {jobSeeking.signals.map((s, i) => (
          <li key={`${s.kind}-${i}`} className="text-xs text-slate-300 leading-relaxed border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0">
            <p className="font-medium text-amber-100/90">{s.title}</p>
            <p className="mt-1 text-[11px] text-slate-400">{s.detail}</p>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-[10px] font-mono text-violet-400 hover:text-violet-300 break-all"
              >
                {s.url}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
