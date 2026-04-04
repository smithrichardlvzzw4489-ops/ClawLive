import Link from "next/link";
import { getDailyPrompt } from "@/data/vibekids/daily-prompts";
import { VK_BASE } from "@/lib/vibekids/constants";

export function DailyChallenge() {
  const { prompt, hint, dayIndex } = getDailyPrompt();
  const href = `${VK_BASE}/studio?age=primary&prompt=${encodeURIComponent(prompt)}`;

  return (
    <div className="mt-10 w-full max-w-3xl rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-left shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
        每日一题 · 第 {dayIndex + 1} 弹
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">今天试试这个灵感</h2>
      <p className="mt-2 text-slate-700">{prompt}</p>
      <p className="mt-1 text-sm text-amber-900/80">提示：{hint}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700"
      >
        一键带入创作室 →
      </Link>
    </div>
  );
}
