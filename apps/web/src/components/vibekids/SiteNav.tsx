import Link from "next/link";
import { VK_BASE } from "@/lib/vibekids/constants";
import { VibekidsMeButton } from "@/components/vibekids/VibekidsMeButton";

type Props = {
  /** 当前高亮，用于无障碍与样式 */
  active?: "explore" | "studio" | "myworks";
};

export function SiteNav({ active }: Props) {
  const b = VK_BASE;

  const linkDesktop = (href: string, key: NonNullable<Props["active"]>, label: string) => {
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

  const linkMobile = (href: string, key: NonNullable<Props["active"]>, label: string) => {
    const isActive = active === key;
    return (
      <Link
        href={href}
        className={
          isActive ?
            "shrink-0 whitespace-nowrap text-[11px] font-semibold text-sky-700"
          : "shrink-0 whitespace-nowrap text-[11px] text-slate-600"
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <>
      <header className="hidden shrink-0 border-b border-slate-200/60 bg-white/50 px-4 py-3 sm:px-6 lg:block">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href={b} className="text-lg font-bold tracking-tight text-slate-900">
            VibeKids
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:gap-x-5">
            {linkDesktop(`${b}/explore`, "explore", "作品广场")}
            {linkDesktop(`${b}/my-works`, "myworks", "我的作品")}
            <Link
              href={b}
              className={
                active === "studio" ?
                  "font-semibold text-violet-700"
                : "font-medium text-violet-600 transition hover:text-violet-800"
              }
            >
              创作室
            </Link>
            <VibekidsMeButton />
          </div>
        </nav>
      </header>

      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] border-t border-slate-200/80 bg-white/95 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_24px_rgba(15,23,42,0.07)] lg:hidden"
        aria-label="VibeKids 主导航"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-2">
          <Link
            href={b}
            className="shrink-0 text-sm font-bold tracking-tight text-slate-900"
          >
            VibeKids
          </Link>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
            {linkMobile(`${b}/explore`, "explore", "作品广场")}
            {linkMobile(`${b}/my-works`, "myworks", "我的作品")}
            <Link
              href={b}
              className={
                active === "studio" ?
                  "shrink-0 whitespace-nowrap text-[11px] font-semibold text-violet-700"
                : "shrink-0 whitespace-nowrap text-[11px] font-medium text-violet-600"
              }
            >
              创作室
            </Link>
            <VibekidsMeButton triggerClassName="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800 shadow-sm" />
          </div>
        </div>
      </nav>
    </>
  );
}
