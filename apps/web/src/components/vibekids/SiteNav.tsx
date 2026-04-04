import Link from "next/link";
import { VK_BASE } from "@/lib/vibekids/constants";

type Props = {
  /** 当前高亮，用于无障碍与样式 */
  active?: "home" | "explore" | "studio" | "myworks";
};

export function SiteNav({ active }: Props) {
  const b = VK_BASE;

  const link = (href: string, key: NonNullable<Props["active"]>, label: string) => {
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

  return (
    <header className="shrink-0 border-b border-slate-200/60 bg-white/50 px-4 py-3 sm:px-6">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href={b} className="text-lg font-bold tracking-tight text-slate-900">
          VibeKids
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {link(b, "home", "首页")}
          {link(`${b}/explore`, "explore", "作品广场")}
          {link(`${b}/my-works`, "myworks", "我的作品")}
          <Link
            href={`${b}/studio`}
            className={
              active === "studio" ?
                "font-semibold text-violet-700"
              : "font-medium text-violet-600 transition hover:text-violet-800"
            }
          >
            创作室
          </Link>
        </div>
      </nav>
    </header>
  );
}
