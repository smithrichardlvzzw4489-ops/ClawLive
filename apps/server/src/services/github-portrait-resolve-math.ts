import type { CrawlProgress } from "../api/routes/codernet";
import { getGithubPortraitBundleForMatch, getPublicGithubCrawlProgress, runPublicLookup } from "../api/routes/codernet";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function awaitRunPublicLookupWithProgress(
  gh: string,
  onProgress: (p: CrawlProgress | null) => void,
): Promise<void> {
  const tick = () => onProgress(getPublicGithubCrawlProgress(gh));
  tick();
  const timer = setInterval(tick, 1200);
  try {
    await runPublicLookup(gh);
  } finally {
    clearInterval(timer);
    tick();
    onProgress(null);
  }
}

/**
 * 任意公开 GitHub 用户：优先读缓存/库；若正在爬取则短暂等待；否则自动触发公开爬取并等待完成。
 * 与首页 MATH、`/api/math/match` 使用同一套拉取逻辑。
 */
export async function resolveGithubPortraitForMath(
  githubUsername: string,
  onGithubProgress?: (p: CrawlProgress | null) => void,
): Promise<
  | { ok: true; portraitSummary: string; githubLogin: string }
  | { ok: false; message: string; code?: string }
> {
  const gh = githubUsername.trim().toLowerCase().replace(/^@/, "");
  if (!gh) {
    return { ok: false, message: "GitHub 登录名为空", code: "INVALID" };
  }

  let r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  if (r.code === "PENDING") {
    for (let i = 0; i < 70; i++) {
      onGithubProgress?.(getPublicGithubCrawlProgress(gh));
      await sleep(2000);
      r = await getGithubPortraitBundleForMatch(gh);
      if (r.ok) {
        onGithubProgress?.(null);
        return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
      }
      if (r.code === "NOT_FOUND") break;
    }
  }

  r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    onGithubProgress?.(null);
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  await awaitRunPublicLookupWithProgress(gh, (p) => onGithubProgress?.(p));
  r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  return {
    ok: false,
    message:
      "无法获取该 GitHub 用户的公开画像。请确认登录名正确、主要仓库为公开，或稍后重试（匿名 API 可能被限流）。",
    code: "GITHUB_FETCH_FAILED",
  };
}
