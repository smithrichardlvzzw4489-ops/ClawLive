import Link from "next/link";
import { CreatorFlywheelPanel } from "@/components/CreatorFlywheelPanel";
import { DailyChallenge } from "@/components/DailyChallenge";
import { FeaturedStrip } from "@/components/FeaturedStrip";
import { SiteNav } from "@/components/SiteNav";
import { WeeklyQuestsPanel } from "@/components/WeeklyQuestsPanel";
import { getSpotlightSummaries } from "@/lib/works-storage";

export default async function Home() {
  const spotlight = await getSpotlightSummaries(8);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="home" />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-sky-700/90">
            VibeKids
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            说出想法，立刻看到作品
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-slate-600">
            面向小学和初中的氛围编程：场景不限——游戏、故事、小工具、页面都可以。先选模式，再在创作室里用一句话描述。
          </p>
        </div>

        <div className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <Link
            href="/studio?age=primary"
            className="group rounded-3xl border-2 border-sky-200 bg-white/90 p-8 text-left shadow-sm transition hover:border-sky-400 hover:shadow-md"
          >
            <span className="text-sm font-semibold text-sky-700">小学模式</span>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">更大按钮，更快上手</h2>
            <p className="mt-2 text-slate-600">
              快捷词多一点、说明短一点，先把东西「做出来、玩起来」。
            </p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-sky-600 group-hover:underline">
              进入创作室 →
            </span>
          </Link>

          <Link
            href="/studio?age=middle"
            className="group rounded-3xl border-2 border-violet-200 bg-white/90 p-8 text-left shadow-sm transition hover:border-violet-400 hover:shadow-md"
          >
            <span className="text-sm font-semibold text-violet-700">初中模式</span>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">描述更自由</h2>
            <p className="mt-2 text-slate-600">
              适合写得更细：规则、界面、交互都可以写进一句话里。
            </p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-violet-600 group-hover:underline">
              进入创作室 →
            </span>
          </Link>
        </div>

        <div className="mt-12 w-full max-w-4xl">
          <FeaturedStrip works={spotlight} />
        </div>

        <div className="mt-8 w-full max-w-lg">
          <CreatorFlywheelPanel />
        </div>

        <DailyChallenge />

        <div className="mt-10 w-full max-w-lg">
          <WeeklyQuestsPanel />
        </div>

        <p className="mt-10 max-w-lg text-center text-sm text-slate-500">
          未配置 AI 密钥时会使用内置演示作品；配置{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">OPENROUTER_API_KEY</code>{" "}
          后通过 OpenRouter 调用模型（默认 deepseek/deepseek-chat-v3.1）按描述生成完整单页作品。
        </p>
      </div>
    </div>
  );
}
