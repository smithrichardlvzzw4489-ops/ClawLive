/** 每日一题：按一年中的第几天轮换 */
export const DAILY_PROMPTS: { prompt: string; hint: string }[] = [
  { prompt: "做一个会下雨的窗口，点击云朵开始下雨", hint: "动画 / 点击" },
  { prompt: "做一个番茄钟，25 分钟倒计时带声音提示", hint: "工具" },
  { prompt: "做一个石头剪刀布，和电脑对战并计分", hint: "小游戏" },
  { prompt: "做一张会动的贺卡，打开有祝福语", hint: "展示" },
  { prompt: "做一个简易计算器，加减乘除和清空", hint: "工具" },
  { prompt: "做一个像素网格，选颜色涂格子", hint: "创意" },
  { prompt: "做一个故事书，点按钮翻页三页", hint: "故事" },
  { prompt: "做一个随机抽签筒，点一下出结果", hint: "互动" },
  { prompt: "做一个待办清单，可勾选完成", hint: "工具" },
  { prompt: "做一个会跟着鼠标移动的小星星背景", hint: "视觉" },
  { prompt: "做一个猜数字游戏，提示大了小了", hint: "小游戏" },
  { prompt: "做一个单位换算：米和厘米互转", hint: "工具" },
  { prompt: "做一个抽奖转盘，点按钮旋转", hint: "互动" },
  { prompt: "做一个天气心情日记，选表情保存到页面", hint: "记录" },
  { prompt: "做一个键盘钢琴，一排按键发声（可用简单 beep）", hint: "音乐" },
];

export function getDailyPrompt(): { prompt: string; hint: string; dayIndex: number } {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime();
  const diff = Date.now() - start;
  const oneDay = 86400000;
  const dayOfYear = Math.floor(diff / oneDay);
  const idx = dayOfYear % DAILY_PROMPTS.length;
  return { ...DAILY_PROMPTS[idx], dayIndex: idx };
}
