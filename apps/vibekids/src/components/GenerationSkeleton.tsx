"use client";

export function GenerationSkeleton() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-3 rounded-2xl bg-white/95 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-sky-800">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        AI 正在生成中…
      </div>
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
      </div>
      <p className="text-xs text-slate-500">长页面可能需要 1～3 分钟，请稍候</p>
    </div>
  );
}
