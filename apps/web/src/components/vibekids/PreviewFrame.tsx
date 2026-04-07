"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 逻辑 CSS 宽度；iframe 测量容器取该宽度，便于移动端排版与媒体查询命中 */
const VIEWPORT_PRESETS: { id: string; label: string; width: number | null }[] = [
  { id: "auto", label: "自动", width: null },
  { id: "375", label: "375", width: 375 },
  { id: "390", label: "390", width: 390 },
  { id: "414", label: "414", width: 414 },
  { id: "428", label: "428", width: 428 },
];

type Props = {
  html: string;
  title?: string;
  /** 切换版本时强制重建 iframe，避免偶发空白不刷新 */
  frameKey?: number;
  /**
   * 作品详情页等：iframe 内自然滚动，不做 transform 缩放。
   * 部分内置浏览器（如微信 web-view）对 srcDoc + 缩放组合易出白屏，Blob URL + 本模式更稳。
   */
  nativeScroll?: boolean;
  /**
   * 是否显示「逻辑宽度」切换条（调试用；默认关闭，预览始终随容器实时适配）。
   */
  viewportToolbar?: boolean;
  /** 向父窗口上报 iframe 内运行时错误（创作室自动修复一轮） */
  reportRuntimeIssues?: boolean;
  /** 在 reportRuntimeIssues 时，约 2.2s 采集窗口结束后回调（去重、截断） */
  onRuntimeIssues?: (lines: string[]) => void;
};

/** 测量下限过小会误判，过大（如 320）会把窄页面强行算宽导致缩放偏小 */
const MEASURE_MIN_W = 200;
const MEASURE_MIN_H = 160;
const MEASURE_CAP = 12000;
const FIT_INSET = 2;
/** 内容小于预览框时最大放大倍数 */
const MAX_UPSCALE = 2.5;

const MOBILE_BASE_STYLE =
  '<style id="vk-mobile-base">html{-webkit-text-size-adjust:100%;overflow-x:hidden}body{overflow-x:hidden;touch-action:manipulation;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>';

/** 向父窗口 postMessage 上报 error / rejection / console.error，供创作室一轮自动修复 */
function injectRuntimeReporter(html: string): string {
  if (/id=["']vk-runtime-reporter["']/i.test(html)) return html;
  const snippet =
    '<script id="vk-runtime-reporter">(function(){var S="vibekids-preview";function send(line){try{parent.postMessage({source:S,type:"vk_issue",line:String(line).slice(0,800)},"*");}catch(e){}}var seen={};function u(line){var k=String(line).slice(0,500);if(seen[k])return;seen[k]=1;send(k);}window.addEventListener("error",function(e){u("Error: "+e.message+(e.filename?" @"+e.filename+":"+(e.lineno||0):""));});window.addEventListener("unhandledrejection",function(e){var r=e.reason;u("Unhandled: "+(r&&r.stack||r&&r.message||String(r)).slice(0,600));});var ce=console.error;console.error=function(){u("console.error: "+Array.prototype.join.call(arguments," ").slice(0,600));ce.apply(console,arguments);};})();<\/script>';
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${snippet}</html>`);
  return html + snippet;
}

/**
 * 模型输出的片段常缺 viewport，iframe 内会按「桌面宽度」排版再被缩放，表现为巨大字号、裁切。
 * 测量时也应使用真实容器宽度，否则 (max-width: …px) 媒体查询永远不命中。
 */
function ensurePreviewDocumentHtml(
  html: string,
  opts?: { nativeScroll?: boolean; reportRuntimeIssues?: boolean },
): string {
  const t = html.trim();
  if (!t) return t;

  const wrap = (out: string) =>
    opts?.reportRuntimeIssues ? injectRuntimeReporter(out) : out;

  const hasViewport = /name\s*=\s*["']viewport["']/i.test(t);
  const rootCss = opts?.nativeScroll ?
    "html,body{background-color:#fff!important}html{-webkit-text-size-adjust:100%;overflow-x:hidden}body{margin:0;max-width:100%;box-sizing:border-box;height:auto!important;min-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:manipulation;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
  : "html,body{background-color:#fff!important}html{-webkit-text-size-adjust:100%;overflow-x:hidden}body{margin:0;max-width:100%;box-sizing:border-box;overflow-x:hidden;touch-action:manipulation;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}";
  const headInject =
    `<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/><style>${rootCss}*,*::before,*::after{box-sizing:border-box}</style>`;

  const nativePatch =
    '<style id="vk-native-embed">html{-webkit-text-size-adjust:100%}html,body{height:auto!important;min-height:100%;overflow-x:hidden}body{overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:manipulation;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>';

  const injectAfterHeadOpen = (htmlStr: string, extra: string): string =>
    htmlStr.replace(/<head[^>]*>/i, (open) => `${open}${extra}`);

  if (/<head[^>]*>/i.test(t)) {
    if (!hasViewport) {
      return wrap(injectAfterHeadOpen(t, headInject));
    }
    let extra = "";
    if (!/id=["']vk-mobile-base["']/i.test(t)) {
      extra += MOBILE_BASE_STYLE;
    }
    if (
      opts?.nativeScroll &&
      !/id=["']vk-native-embed["']/i.test(t)
    ) {
      extra += nativePatch;
    }
    if (extra) return wrap(injectAfterHeadOpen(t, extra));
    return wrap(t);
  }

  if (/<html[\s>]/i.test(t)) {
    if (!hasViewport) {
      return wrap(
        t.replace(
          /<html([^>]*)>/i,
          `<html$1><head>${headInject}</head>`,
        ),
      );
    }
    return wrap(t);
  }

  return wrap(
    `<!DOCTYPE html><html lang="zh-CN"><head>${headInject}</head><body>${t}</body></html>`,
  );
}

/** 展开内部 overflow 区域，避免 scrollHeight 只反映「小视口内」高度 */
function expandInnerScrollers(doc: Document): void {
  const win = doc.defaultView;
  if (!win || !doc.body) return;

  const nodes = [doc.body, ...doc.body.querySelectorAll<HTMLElement>("*")];
  for (const el of nodes) {
    const cs = win.getComputedStyle(el);
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    const tallInner = el.scrollHeight > el.clientHeight + 2;
    const wideInner = el.scrollWidth > el.clientWidth + 2;
    if (
      oy === "auto" ||
      oy === "scroll" ||
      ox === "auto" ||
      ox === "scroll" ||
      tallInner ||
      wideInner
    ) {
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      if (cs.maxHeight && cs.maxHeight !== "none") el.style.maxHeight = "none";
      if (cs.maxWidth && cs.maxWidth !== "none") el.style.maxWidth = "none";
    }
  }
}

/** 用子元素包围盒补全测量（卡片、拼图块等） */
function unionContentRect(doc: Document): { w: number; h: number } {
  const body = doc.body;
  const win = doc.defaultView;
  if (!win) return { w: 0, h: 0 };

  const bodyRect = body.getBoundingClientRect();
  let maxRight = bodyRect.left;
  let maxBottom = bodyRect.top;

  const walk = (root: Element) => {
    const children = root.querySelectorAll("*");
    for (const el of children) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        maxRight = Math.max(maxRight, r.right);
        maxBottom = Math.max(maxBottom, r.bottom);
      }
    }
  };
  walk(doc.documentElement);

  const uw = Math.max(0, Math.ceil(maxRight - bodyRect.left));
  const uh = Math.max(0, Math.ceil(maxBottom - bodyRect.top));
  return { w: uw, h: uh };
}

function readContentSize(doc: Document): { w: number; h: number } {
  const body = doc.body;
  const root = doc.documentElement;
  const rawW = Math.max(
    body.scrollWidth,
    root.scrollWidth,
    body.offsetWidth,
    root.offsetWidth,
  );
  const rawH = Math.max(
    body.scrollHeight,
    root.scrollHeight,
    body.offsetHeight,
    root.offsetHeight,
  );
  let w = Math.min(MEASURE_CAP, rawW);
  const h = Math.min(
    MEASURE_CAP,
    Math.max(rawH, MEASURE_MIN_H),
  );
  // 不要把「真实很窄」的版面强行抬到 MEASURE_MIN_W：若高度又很大，会与 h 形成极端竖长比，
  // contain 按高度缩放时会把水平方向压成一条细缝（待办类居中窄栏 + min-height:100vh 常见）。
  if (w < MEASURE_MIN_W) {
    const portraitish = rawW >= 1 && rawH > rawW * 3.5;
    w = portraitish ? Math.max(w, 1) : MEASURE_MIN_W;
  }
  if (w < 1) w = MEASURE_MIN_W;
  return { w, h };
}

/**
 * body 常设 min-height:100vh，scrollHeight 巨大，但真正 UI 只是一小块。
 * 若 scroll 比子元素包围盒「松」很多，则按包围盒尺寸缩放，cover 才能把小块放大铺满预览区。
 */
function pickScaleBox(
  scrollW: number,
  scrollH: number,
  uw: number,
  uh: number,
): { w: number; h: number } {
  if (uw < 8 && uh < 8) {
    return {
      w: Math.min(MEASURE_CAP, Math.max(scrollW, MEASURE_MIN_W)),
      h: Math.min(MEASURE_CAP, Math.max(scrollH, MEASURE_MIN_H)),
    };
  }
  const uW = Math.max(uw, 48);
  const uH = Math.max(uh, 48);
  const sW = Math.max(scrollW, MEASURE_MIN_W);
  const sH = Math.max(scrollH, MEASURE_MIN_H);
  const hSlack = sH / uH;
  const wSlack = sW / uW;
  const H_THRESH = 1.28;
  const W_THRESH = 1.32;
  const hPick =
    hSlack >= H_THRESH
      ? Math.min(MEASURE_CAP, Math.max(uH, MEASURE_MIN_H))
      : Math.min(MEASURE_CAP, Math.max(sH, uH, MEASURE_MIN_H));
  const wPick =
    wSlack >= W_THRESH
      ? Math.min(MEASURE_CAP, Math.max(uW, MEASURE_MIN_W))
      : Math.min(MEASURE_CAP, Math.max(sW, uW, MEASURE_MIN_W));
  return { w: wPick, h: hPick };
}

function fitIframeToContainer(
  container: HTMLDivElement,
  iframe: HTMLIFrameElement,
): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw < 8 || ch < 8) {
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.transform = "";
      iframe.style.transformOrigin = "";
      iframe.style.left = "0";
      iframe.style.top = "0";
      iframe.style.maxWidth = "";
      iframe.style.maxHeight = "";
      return;
    }

    iframe.style.transform = "none";
    // 用容器宽度布局，才能让子页 responsive CSS / rem 与真机一致；过宽探测会误判尺寸并触发错误放大
    const probeW = Math.max(Math.ceil(cw), MEASURE_MIN_W);
    const probeH = Math.max(Math.ceil(ch * 3), 900, MEASURE_MIN_H * 4);
    iframe.style.width = `${probeW}px`;
    iframe.style.height = `${probeH}px`;
    void iframe.offsetWidth;

    expandInnerScrollers(doc);
    void doc.body.offsetHeight;
    void iframe.offsetWidth;
    expandInnerScrollers(doc);
    void doc.body.offsetHeight;
    const scroll = readContentSize(doc);
    const u = unionContentRect(doc);
    const box = pickScaleBox(scroll.w, scroll.h, u.w, u.h);
    let w = Math.ceil(box.w);
    let h = Math.ceil(box.h);
    h = Math.max(h, MEASURE_MIN_H);
    if (w < MEASURE_MIN_W) {
      w = h / Math.max(w, 1) > 4 ? Math.max(w, 40) : MEASURE_MIN_W;
    }

    const innerW = Math.max(8, cw - FIT_INSET * 2);
    const innerH = Math.max(8, ch - FIT_INSET * 2);
    // 统一 contain：完整可见。窄屏曾用 cover 会按短边铺满、长边裁切，导致标题/输入框被切掉（用户看到的「不适配」）
    let s = Math.min(innerW / w, innerH / h);
    // 竖长页面（min-height:100vh + 中间窄卡片）：contain 往往被高度限制，水平缩成细条 —— 改为优先铺满预览区宽度（可纵向裁切，顶部对齐）
    const tallSkinny = w > 0 && h > w * 2.1;
    if (tallSkinny) {
      const sFillW = Math.min(MAX_UPSCALE, innerW / w);
      if (sFillW > s) s = sFillW;
    }
    if (!Number.isFinite(s) || s <= 0) s = 1;
    if (s > 1) {
      s = Math.min(s, MAX_UPSCALE);
    }

    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    doc.documentElement.style.margin = "0";
    doc.body.style.margin = "0";

    iframe.style.width = `${w}px`;
    iframe.style.height = `${h}px`;
    iframe.style.transform = `scale(${s})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.maxWidth = "none";
    iframe.style.maxHeight = "none";

    const sw = w * s;
    const sh = h * s;
    iframe.style.left = `${(cw - sw) / 2}px`;
    const topPx =
      sh > ch - FIT_INSET * 2 ? FIT_INSET : Math.max(FIT_INSET, (ch - sh) / 2);
    iframe.style.top = `${topPx}px`;
  } catch {
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.transform = "";
    iframe.style.left = "0";
    iframe.style.top = "0";
  }
}

export function PreviewFrame({
  html,
  title = "预览",
  frameKey,
  nativeScroll = false,
  viewportToolbar = false,
  reportRuntimeIssues = false,
  onRuntimeIssues,
}: Props) {
  const [viewportPreset, setViewportPreset] = useState<string>("auto");
  const logicalWidth =
    VIEWPORT_PRESETS.find((p) => p.id === viewportPreset)?.width ?? null;

  const trimmed = html.trim();
  const srcDocHtml = trimmed
    ? ensurePreviewDocumentHtml(trimmed, {
        nativeScroll,
        reportRuntimeIssues: Boolean(reportRuntimeIssues && onRuntimeIssues),
      })
    : "";
  const bandRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fitTimersRef = useRef<number[]>([]);

  const clearFitTimers = useCallback(() => {
    fitTimersRef.current.forEach((id) => window.clearTimeout(id));
    fitTimersRef.current = [];
  }, []);

  const runFit = useCallback(() => {
    if (nativeScroll) return;
    const c = wrapRef.current;
    const f = iframeRef.current;
    if (c && f) fitIframeToContainer(c, f);
  }, [nativeScroll]);

  useEffect(() => {
    if (!srcDocHtml) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const blob = new Blob([srcDocHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    return () => {
      try {
        iframe.src = "about:blank";
      } catch {
        /* */
      }
      URL.revokeObjectURL(url);
    };
  }, [srcDocHtml, frameKey]);

  useEffect(() => {
    if (nativeScroll || !srcDocHtml) return;
    const band = bandRef.current;
    const c = wrapRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      runFit();
    });
    ro.observe(c);
    if (band) ro.observe(band);
    return () => {
      ro.disconnect();
      clearFitTimers();
    };
  }, [
    nativeScroll,
    srcDocHtml,
    frameKey,
    logicalWidth,
    runFit,
    clearFitTimers,
  ]);

  /** 移动端地址栏伸缩、横竖屏、键盘顶起等场景下，仅靠子节点 ResizeObserver 可能不触发 */
  useEffect(() => {
    if (nativeScroll || !srcDocHtml) return;

    let raf = 0;
    const scheduleFit = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        runFit();
      });
    };

    const onOrientation = () => {
      scheduleFit();
      window.setTimeout(() => runFit(), 180);
      window.setTimeout(() => runFit(), 450);
    };

    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", onOrientation);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener("resize", scheduleFit);
      vv.addEventListener("scroll", scheduleFit);
    }
    document.addEventListener("visibilitychange", scheduleFit);

    return () => {
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("orientationchange", onOrientation);
      if (vv) {
        vv.removeEventListener("resize", scheduleFit);
        vv.removeEventListener("scroll", scheduleFit);
      }
      document.removeEventListener("visibilitychange", scheduleFit);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [nativeScroll, srcDocHtml, runFit]);

  useEffect(() => {
    if (nativeScroll || !srcDocHtml) return;
    window.requestAnimationFrame(() => runFit());
  }, [logicalWidth, frameKey, nativeScroll, srcDocHtml, runFit]);

  const onIframeLoad = useCallback(() => {
    if (nativeScroll) return;
    clearFitTimers();
    window.requestAnimationFrame(() => runFit());
    for (const ms of [50, 200, 500, 1200, 2500]) {
      fitTimersRef.current.push(window.setTimeout(runFit, ms));
    }
  }, [nativeScroll, clearFitTimers, runFit]);

  useEffect(() => {
    if (!reportRuntimeIssues || !onRuntimeIssues || !trimmed) return;
    const lines: string[] = [];
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.source !== "vibekids-preview" || ev.data?.type !== "vk_issue") {
        return;
      }
      if (iframeRef.current?.contentWindow !== ev.source) return;
      const line =
        typeof ev.data.line === "string" ? ev.data.line : String(ev.data.line ?? "");
      const tline = line.trim();
      if (tline) lines.push(tline);
    };
    window.addEventListener("message", onMsg);
    const flushTimer = window.setTimeout(() => {
      const uniq = [...new Set(lines)].slice(0, 15);
      if (uniq.length) onRuntimeIssues(uniq);
    }, 2200);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(flushTimer);
    };
  }, [reportRuntimeIssues, onRuntimeIssues, trimmed, frameKey, html]);

  if (!trimmed) {
    return (
      <div
        className="h-full min-h-0 w-full flex-1 [color-scheme:light]"
        style={{ backgroundColor: "#f1f5f9" }}
        aria-label="作品预览区域，输入描述并生成后将在此显示"
      />
    );
  }

  /** 微信等 WebView 下 iframe 未设底色时易显为黑块，须显式白底；与外层 flex 列一起铺满剩余高度 */
  const iframeClass = nativeScroll ?
      "box-border block h-full min-h-0 w-full min-w-0 flex-1 bg-white max-lg:rounded-none max-lg:border-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-inner"
    : "absolute inset-0 box-border h-full min-h-0 w-full bg-white max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:ring-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-inner";

  const showBar = viewportToolbar && !nativeScroll;
  const deviceChrome =
    logicalWidth != null && !nativeScroll ?
      "rounded-[1.65rem] border-[10px] border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/10"
    : "max-lg:rounded-none max-lg:ring-0 lg:rounded-2xl";

  const measureShell =
    "vk-preview-root relative isolate h-full min-h-0 w-full min-w-0 overflow-hidden [color-scheme:light] lg:[min-height:min(380px,44dvh)]";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {showBar ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200/90 bg-slate-100/90 px-2 py-1.5 max-lg:rounded-none lg:rounded-t-2xl"
          role="toolbar"
          aria-label="预览逻辑宽度"
        >
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            宽度
          </span>
          {VIEWPORT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewportPreset(p.id)}
              className={
                viewportPreset === p.id ?
                  "rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
                : "rounded-lg px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-white/80 hover:text-slate-900"
              }
            >
              {p.label}
              {p.width != null ?
                <span className="sr-only"> 像素逻辑宽度</span>
              : null}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={bandRef}
        className={
          showBar ?
            "flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-100/50 max-lg:bg-slate-50 lg:rounded-b-2xl"
          : "flex min-h-0 w-full flex-1 flex-col overflow-hidden max-lg:bg-slate-50 lg:rounded-2xl lg:bg-white"
        }
      >
        <div
          ref={wrapRef}
          className={`${measureShell} flex flex-1 flex-col max-lg:min-h-0 max-lg:w-full max-lg:bg-slate-50 lg:bg-white ${deviceChrome}`}
          style={
            logicalWidth != null ?
              { maxWidth: logicalWidth, width: "100%" }
            : undefined
          }
        >
          <iframe
            key={frameKey}
            ref={iframeRef}
            title={title}
            className={iframeClass}
            sandbox="allow-scripts allow-forms allow-same-origin"
            onLoad={onIframeLoad}
          />
        </div>
      </div>
    </div>
  );
}
