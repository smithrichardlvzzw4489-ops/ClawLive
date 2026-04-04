"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "create" | "refine";

const CREATE_STEPS: { title: string; detail: string }[] = [
  { title: "读懂你的想法", detail: "年龄、作品形态和风格会对齐到提示里" },
  { title: "搭页面骨架", detail: "标题区、主操作区、反馈文案先就位" },
  { title: "写样式与动效", detail: "配色、圆角、小动画让页面活起来" },
  { title: "补上交互逻辑", detail: "按钮、键盘或计分等可玩部分" },
  { title: "通读与收尾", detail: "检查一屏内是否说得清、点得动" },
];

const REFINE_STEPS: { title: string; detail: string }[] = [
  { title: "对照当前页面", detail: "在上一版 HTML 上局部动工" },
  { title: "按你的说明改动", detail: "尽量不动你没提的部分" },
  { title: "合并出新版本", detail: "输出完整可预览的一页" },
];

const LOG_LINES_CREATE = [
  "解析描述中的关键词…",
  "生成布局与组件结构…",
  "写入 CSS：主题色与间距…",
  "挂载事件与状态…",
  "压缩冗余、对齐移动端…",
];

const LOG_LINES_REFINE = [
  "定位要改的区块…",
  "应用修改说明…",
  "跑一遍可读性检查…",
];

const PATIENCE_LINES = [
  "还在推理中，页面越长等得越久",
  "复杂小游戏要多推演几步规则",
  "快好了，正在把最后一屏写完整",
  "若超过几分钟仍无结果，可刷新后缩短描述重试",
];

type Props = {
  mode?: Mode;
};

export function GenerationSkeleton({ mode = "create" }: Props) {
  const steps = mode === "refine" ? REFINE_STEPS : CREATE_STEPS;
  const logPool = mode === "refine" ? LOG_LINES_REFINE : LOG_LINES_CREATE;

  const [phase, setPhase] = useState(0);
  const [logCount, setLogCount] = useState(1);
  const [patienceIdx, setPatienceIdx] = useState(0);

  const stepMs = mode === "refine" ? 3200 : 4200;

  useEffect(() => {
    setPhase(0);
    setLogCount(1);
    setPatienceIdx(0);
  }, [mode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => Math.min(p + 1, steps.length - 1));
    }, stepMs);
    return () => window.clearInterval(id);
  }, [stepMs, steps.length]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLogCount((c) => Math.min(c + 1, logPool.length));
    }, Math.max(900, Math.floor(stepMs * 0.55)));
    return () => window.clearInterval(id);
  }, [logPool.length, stepMs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPatienceIdx((i) => (i + 1) % PATIENCE_LINES.length);
    }, 8200);
    return () => window.clearInterval(id);
  }, []);

  const visibleLogs = useMemo(() => logPool.slice(0, logCount), [logPool, logCount]);

  const headline =
    mode === "refine" ? "AI 正在按你的说明修改…" : "AI 正在创作这一页…";

  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-4 overflow-hidden rounded-2xl bg-white/96 p-4 shadow-inner backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100"
          aria-hidden
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sky-900">{headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            下面是在「表演」创作过程，帮你感知进度；实际由模型在后台一次性完成。
          </p>
        </div>
      </div>

      <ol className="relative space-y-0 pl-1">
        {steps.map((s, i) => {
          const done = i < phase;
          const active = i === phase;
          const pending = i > phase;
          return (
            <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 ? (
                <div
                  className={`absolute left-[11px] top-6 h-[calc(100%-0.5rem)] w-px ${
                    done ? "bg-sky-300" : "bg-slate-200"
                  }`}
                  aria-hidden
                />
              ) : null}
              <div className="relative z-[1] flex shrink-0 flex-col items-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-sky-500 text-white ring-4 ring-sky-200/80"
                        : "border border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  {done ? "✓" : active ? "…" : i + 1}
                </span>
              </div>
              <div
                className={`min-w-0 flex-1 pt-0.5 transition-opacity duration-300 ${
                  pending ? "opacity-45" : "opacity-100"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    active ? "text-sky-900" : done ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {s.title}
                </p>
                <p className="text-xs leading-relaxed text-slate-500">{s.detail}</p>
                {active ? (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="vk-gen-shimmer-bar h-full w-2/5 rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600">
        <p className="mb-1.5 text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400">
          过程摘录（示意）
        </p>
        {visibleLogs.map((line, i) => (
          <p
            key={`${line}-${i}`}
            className="animate-fade-in border-l-2 border-sky-300/70 pl-2"
          >
            <span className="text-sky-600/90">›</span> {line}
          </p>
        ))}
      </div>

      <div className="mt-auto space-y-2">
        <p className="flex items-center gap-2 text-xs text-violet-800/90">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
          {PATIENCE_LINES[patienceIdx]}
        </p>
        <p className="text-xs text-slate-500">
          长页面可能需要 <strong className="font-medium text-slate-600">1～3 分钟</strong>
          ，请勿关闭标签页；完成后预览会自动出现。
        </p>
      </div>

    </div>
  );
}
