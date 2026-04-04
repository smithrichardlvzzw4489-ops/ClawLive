import type { CreativeKind } from "@/lib/creative";
import type { AgeBand } from "@/lib/age";

export type CaseItem = {
  id: string;
  title: string;
  description: string;
  tag: string;
  kind: CreativeKind;
  /** 带入创作室的一句话 */
  prompt: string;
  age: AgeBand;
};

export const EXCELLENT_CASES: CaseItem[] = [
  {
    id: "c1",
    title: "接球挑战",
    description: "键盘左右移动托盘，练习反应力，有得分反馈。",
    tag: "小游戏",
    kind: "game",
    prompt: "做一个接球小游戏：左右键移动托盘接球，有分数和重新开始",
    age: "primary",
  },
  {
    id: "c2",
    title: "番茄钟一页版",
    description: "倒计时、开始暂停，适合专注学习。",
    tag: "小工具",
    kind: "tool",
    prompt: "做一个倒计时番茄钟：25 分钟，可开始暂停和重置，有大字显示剩余时间",
    age: "primary",
  },
  {
    id: "c3",
    title: "互动小故事",
    description: "分段阅读，点击推进剧情。",
    tag: "互动故事",
    kind: "story",
    prompt: "做一个三段式互动小故事，每段有按钮进入下一段，最后有彩蛋句子",
    age: "primary",
  },
  {
    id: "c4",
    title: "单位换算条",
    description: "长度或重量换算，输入一侧自动算另一侧。",
    tag: "小工具",
    kind: "tool",
    prompt: "做一个长度单位换算小工具：米、厘米、毫米互转，输入一边另一边自动更新",
    age: "middle",
  },
  {
    id: "c5",
    title: "像素画板",
    description: "网格填色，清空与几种颜色可选。",
    tag: "小游戏",
    kind: "game",
    prompt: "做一个简易像素画板：8x8 网格，选颜色点击填色，有清空按钮",
    age: "middle",
  },
  {
    id: "c6",
    title: "生日贺卡页",
    description: "祝福语、按钮互动，适合分享展示。",
    tag: "展示页",
    kind: "showcase",
    prompt: "做一个生日贺卡单页：大标题生日快乐、一句祝福、彩色按钮点击出现烟花或彩带动画",
    age: "middle",
  },
];
