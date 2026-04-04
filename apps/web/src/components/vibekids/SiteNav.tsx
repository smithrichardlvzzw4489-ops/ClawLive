import Link from "next/link";
import { NavQuestBadge } from "@/components/vibekids/NavQuestBadge";
import { VK_BASE } from "@/lib/vibekids/constants";

type Props = {
  /** ????????????? */
  active?: "home" | "cases" | "feed" | "gallery" | "studio";
};

export function SiteNav({ active }: Props) {
  const link = (href: string, key: Props["active"], label: string) => {
    const isActive = active === key;
    return (
      <Link
        href={href}
        className={
          isActive
            ? "font-semibold text-sky-700"
            : "text-slate-600 transition hover:text-slate-900"
        }
      >
        {label}
      </Link>
    );
  };

  const b = VK_BASE;

  return (
    <header className="shrink-0 border-b border-slate-200/60 bg-white/50 px-4 py-3 sm:px-6">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href={b} className="text-lg font-bold tracking-tight text-slate-900">
          VibeKids
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="relative inline-flex items-center">
            {link(b, "home", "??")}
            <NavQuestBadge />
          </span>
          {link(`${b}/cases`, "cases", "????")}
          {link(`${b}/feed`, "feed", "??")}
          {link(`${b}/gallery`, "gallery", "?????")}
          <Link
            href={`${b}/studio`}
            className={
              active === "studio" ?
                "font-semibold text-violet-700"
              : "font-medium text-violet-600 transition hover:text-violet-800"
            }
          >
            ???
          </Link>
        </div>
      </nav>
    </header>
  );
}
