/** 由 id 生成稳定色相，用于封面渐变（小红书式多彩卡片） */
export function gradientFromWorkId(id: string): {
  from: string;
  to: string;
  minHeightPx: number;
} {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  const h2 = (hue + 38) % 360;
  const from = `hsl(${hue} 72% 78%)`;
  const to = `hsl(${h2} 58% 62%)`;
  const minHeightPx = 168 + (Math.abs(h) % 140);
  return { from, to, minHeightPx };
}
