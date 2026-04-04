import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import { WorkCard } from "@/components/vibekids/WorkCard";

type Props = {
  works: SavedWorkSummary[];
  emptyHint?: string;
};

export function SavedWorksGrid({ works, emptyHint }: Props) {
  if (works.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        {emptyHint ??
          "还没有保存的作品。在创作室生成后点「保存作品」即可出现在这里。"}
      </p>
    );
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {works.map((w) => (
        <WorkCard key={w.id} work={w} />
      ))}
    </ul>
  );
}
