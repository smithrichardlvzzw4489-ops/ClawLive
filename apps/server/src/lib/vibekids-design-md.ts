/**
 * VibeKids：将 Google Stitch 风格的 DESIGN.md 注入生成/修改提示。
 * 预设为站内原创摘要，便于对齐常见产品气质；完整模板见 VoltAgent/awesome-design-md。
 */
export const VIBEKIDS_DESIGN_MD_MAX_CUSTOM = 12_000;

const ALLOWED_PRESETS = new Set([
  'none',
  'notion-warm',
  'linear-purple',
  'vercel-mono',
  'stripe-elegant',
]);

const PRESETS: Record<string, string> = {
  'notion-warm': `## Visual Theme & Atmosphere
温暖、知识工作台感；浅色界面、柔和分区，像干净的笔记与文档空间。

## Color Palette & Roles
- 页面底：#FFFFFF、次级区块 #F7F6F3
- 主文字：#37352F；次要说明：#787774；禁用/提示：#B4B4B4
- 强调色：少量赭石/珊瑚点缀（如 #E97357），仅用于主按钮或关键标签
- 分割线：#E8E7E4（极细）

## Typography
系统无衬线；大标题字重 600～700，正文 15～16px，行高 1.5～1.6；避免全大写标题。

## Component Stylings
- 按钮：浅底 + 1px 细边框，圆角约 4～6px；主按钮可用实心强调色，hover 略深
- 输入框：白底、浅灰边框，focus 时细描边或浅外发光
- 卡片：轻边框或极轻阴影，内边距宽松

## Layout Principles
留白充足；区块对齐网格；列表行高舒适，适合阅读与点击。

## Do's and Don'ts
要：层次清晰、触控区域足够大（适合少儿与移动端）。
不要：大面积高饱和色、刺眼对比、过多装饰纹理。`,

  'linear-purple': `## Visual Theme & Atmosphere
极简工程感；深色或中性底，紫色作为唯一强强调，界面克制、精确。

## Color Palette & Roles
- 背景：#0B0B0F 或 #111118（若做单页也可用浅灰底 #F4F5F8 反转为浅色 Linear 风）
- 表面卡片：比背景略亮一级
- 主强调：#5E6AD2（紫）；悬停可略亮；成功/警告用低饱和绿/琥珀点缀即可
- 主文字：近白 #F7F8F8；次要 #8A8F98

## Typography
几何无衬线，字距略紧；标题清晰分级，正文 14～15px，数据可用等宽数字感（可用 font-variant-numeric）。

## Component Stylings
- 按钮：小圆角（3～6px）；主按钮实心紫；幽灵按钮深色底+细边框
- 输入：深色底、细边框，focus 紫色环
- 尽量少阴影，靠对比与间距分层

## Layout Principles
强对齐、8px 间距刻度；信息密度中等偏高但区块分明。

## Do's and Don'ts
要：一眼找到主操作；动画极短、克制。
不要：花哨渐变堆叠、拟物化。`,

  'vercel-mono': `## Visual Theme & Atmosphere
黑白精确、前端工具感；高对比、少色，像现代部署与文档站。

## Color Palette & Roles
- 背景：#000000 或 #FFFFFF（二选一贯穿全页）
- 反色文字：黑底用白字，白底用近黑 #171717
- 唯一灰阶层次：#666、#888、#E5E5E5 用于边框与次要文案
- 避免第三种彩色，除非用户描述里明确要求

## Typography
无衬线、偏几何；标题粗、正文常规，字号阶梯清晰。

## Component Stylings
- 按钮：黑底白字或白底黑边；圆角小（4px 左右）
- 输入框：与背景对比明显，细边框
- 分割线：1px #E5E5E5（浅色主题）或 #333（深色主题）

## Layout Principles
大量留白与对齐；栅格整齐；移动端同样保持边缘内边距一致。

## Do's and Don'ts
要：简洁、可读、可点区域足够。
不要：彩虹渐变、复杂插画默认背景。`,

  'stripe-elegant': `## Visual Theme & Atmosphere
金融科技级优雅；浅色为主，紫色渐变或紫色+白，精致留白与柔和阴影。

## Color Palette & Roles
- 背景：#F6F9FC 或白 #FFFFFF
- 主紫：#635BFF；可与浅紫渐变用于 Hero 或主按钮
- 文字：#0A2540 主文案；次要 #425466
- 边框：浅 #E3E8EE；成功/信息用低饱和绿/蓝点缀

## Typography
现代无衬线；标题可略轻字重（500～600）配合大字号；正文舒适行高。

## Component Stylings
- 按钮：圆角 6～8px；主按钮渐变或实心紫；次按钮描边
- 卡片：大圆角（8～12px）、轻阴影（低扩散、柔和）
- 输入：白底、浅边框，focus 紫色环

## Layout Principles
营销级留白；模块分区清晰；首屏可有轻渐变背景条。

## Do's and Don'ts
要：信任感、清晰层级、触控友好。
不要：杂乱图标墙、过低对比灰字。`,
};

export function vkParseDesignPreset(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : 'none';
  return ALLOWED_PRESETS.has(s) ? s : 'none';
}

/**
 * 用户粘贴的 DESIGN.md 优先于预设；均无则返回空串。
 */
export function vkFormatDesignMdBlock(presetRaw: unknown, customRaw: unknown): string {
  const custom =
    typeof customRaw === 'string' ? customRaw.trim().slice(0, VIBEKIDS_DESIGN_MD_MAX_CUSTOM) : '';
  if (custom) {
    return (
      '\n\n【界面须遵循以下 DESIGN.md（用户粘贴，优先于预设）】\n' +
      '请严格按其中的颜色角色、字体层级、圆角、组件状态与布局原则实现 HTML/CSS。\n\n' +
      custom +
      '\n'
    );
  }
  const preset = vkParseDesignPreset(presetRaw);
  if (preset === 'none') return '';
  const body = PRESETS[preset];
  if (!body) return '';
  return (
    `\n\n【界面须遵循以下 DESIGN.md 风格参考（预设：${preset}）】\n` +
    '请严格按其中的颜色角色、字体层级、圆角、组件状态与布局原则实现 HTML/CSS。\n\n' +
    body +
    '\n'
  );
}
