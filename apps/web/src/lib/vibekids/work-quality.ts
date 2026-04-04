/**
 * 可识别的「优质」启发式评分（0～100），用于精选排序与积分发放。
 * 不替代人工审核；后续可接模型打分或人工精选。
 */
export function computeQualityScore(html: string, prompt?: string): number {
  const h = html.trim();
  let s = 0;

  const len = h.length;
  if (len >= 2500) s += 18;
  else if (len >= 1200) s += 14;
  else if (len >= 600) s += 10;
  else s += 4;

  if (/viewport/i.test(h)) s += 10;
  if (/<script[\s\S]*?<\/script>/i.test(h)) s += 14;
  if (/<style[\s\S]*?<\/style>/i.test(h)) s += 8;
  if (/addEventListener|onclick|keydown|touchstart|requestAnimationFrame/i.test(h))
    s += 16;
  if (/<button|<input/i.test(h)) s += 6;

  const p = prompt?.trim() ?? "";
  if (p.length >= 40) s += 12;
  else if (p.length >= 12) s += 8;
  else if (p.length > 0) s += 4;

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(h)) s += 6;
  if (/<h1[\s\S]*?<\/h1>/i.test(h)) s += 5;

  if (len > 120_000) s -= 8;
  if (len < 200) s -= 6;

  return Math.max(0, Math.min(100, Math.round(s)));
}

/** 由质量分换算本次可得的创作积分（可兑现） */
export function rewardPointsFromQuality(qualityScore: number): number {
  return Math.max(3, Math.floor(qualityScore / 4) + 5);
}
