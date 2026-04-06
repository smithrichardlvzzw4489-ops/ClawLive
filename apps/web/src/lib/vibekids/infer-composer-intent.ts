import { getPromptHistory } from "@/lib/vibekids/client-prompt-history";

/** 仅「再来一版」类口令、无具体描述 → 用历史上一次成功「生成」的描述走 create */
const REDO_META =
  /^(?:再来一版|再来一个|重新生成|重新做一版|重新做|重做一版|重做|换一版|换一个|换一個|再生成|再做一个)\s*$/;

function isRedoMetaOnly(t: string): boolean {
  return REDO_META.test(t.trim());
}

/** 像从零描述一个新作品 */
function looksLikeNewAppSpec(t: string): boolean {
  if (
    /(?:我想|帮我|请帮|请给我).{0,40}(?:做|生成|创作|开发)/.test(t) ||
    /^做(?:一个|一款|个)?/.test(t) ||
    /^来(?:一个|一款|个)?/.test(t) ||
    /^生成(?:一个|一款)?/.test(t) ||
    /^创作(?:一个|一款)?/.test(t) ||
    /^开发(?:一个|一款)?/.test(t) ||
    /^设计(?:一个|一款)?/.test(t)
  ) {
    return true;
  }
  if (
    /游戏|工具|页面|应用|网站|小程序|故事|动画|计算器|清单|待办|钢琴|坦克|迷宫|跑酷|接龙|问答/.test(
      t,
    ) &&
    t.length >= 6
  ) {
    return true;
  }
  return false;
}

/** 像对当前预览的增量修改 */
function looksLikeRefinement(t: string): boolean {
  if (
    /[把将让]\s*[^，。\n]{0,52}(?:改|调整|换|调大|调小|变大|变小|加粗|变细|调高|调低|弄大|弄小)/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(?:^|[，。！？\s])(?:改|改成|改为|换成|调整|修改|优化|修复|美化)\s*/.test(t)
  ) {
    return true;
  }
  if (
    /(?:加一下|加上|增加|添加|添个|删掉|删除|去掉|移除|移动|居中|对齐|左对齐|右对齐)/.test(t)
  ) {
    return true;
  }
  if (
    /字体|字号|行距|颜色|配色|主题|深色|浅色|暗黑|背景|按钮|圆角|阴影|透明度|宽度|高度|大小|间距|边距|内边距|音效|音乐|音量|难度|速度|关卡|动效|动画|标题|文案|图标|图片|列表|输入框/.test(
      t,
    )
  ) {
    return true;
  }
  if (/(?:太|有点)(?:小|大|难|易|慢|快|高|低|亮|暗|丑|挤|空)/.test(t)) {
    return true;
  }
  if (
    /怎么样|可不可以|能否|能不能|行不行/.test(t) &&
    t.length <= 48
  ) {
    return true;
  }
  return false;
}

export type ComposerIntentResolved =
  | { kind: "create"; prompt: string; reusedHistory: boolean }
  | { kind: "refine"; prompt: string }
  | { kind: "empty" }
  | { kind: "redo_needs_history" };

/**
 * 在已有预览时，根据输入判断走「修改当前 HTML」还是「新做一版（create）」。
 * 无预览时一律 create。
 */
export function resolveComposerIntent(
  rawPrompt: string,
  hasGeneratedPreview: boolean,
): ComposerIntentResolved {
  const t = rawPrompt.trim();
  if (!t) return { kind: "empty" };

  if (!hasGeneratedPreview) {
    return { kind: "create", prompt: t, reusedHistory: false };
  }

  if (isRedoMetaOnly(t)) {
    const hist = getPromptHistory();
    const last = hist[0];
    if (!last) return { kind: "redo_needs_history" };
    return { kind: "create", prompt: last, reusedHistory: true };
  }

  if (looksLikeRefinement(t)) {
    return { kind: "refine", prompt: t };
  }

  if (looksLikeNewAppSpec(t)) {
    return { kind: "create", prompt: t, reusedHistory: false };
  }

  if (t.length <= 32) {
    return { kind: "refine", prompt: t };
  }

  return { kind: "create", prompt: t, reusedHistory: false };
}
