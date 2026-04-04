/** 生成成功后的随机鼓励（可变奖励感） */
export const ENCOURAGEMENTS = [
  "太棒了，这一版很有感觉！",
  "不错哦，再微调一下会更酷～",
  "生成成功！要不要试试快速修改？",
  "有了有了，去预览里点点看！",
  "今日创作 +1，继续保持～",
];

/** 生成后推荐的「下一步修改」chip */
export const NEXT_EDIT_SUGGESTIONS = [
  "把主色改成天蓝色",
  "把按钮变大一点",
  "加一句欢迎语在顶部",
  "手机端字再大一点",
  "加一个「重新开始」按钮",
  "背景改成浅色渐变",
  "加一个简单的得分或计数",
];

export function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randomPickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  const c = Math.min(n, copy.length);
  for (let i = 0; i < c; i++) {
    const j = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(j, 1)[0]!);
  }
  return out;
}
