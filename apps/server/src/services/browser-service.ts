/**
 * 虾米浏览器服务 — Playwright-Core + 系统 Chromium
 *
 * 每位用户独立的 BrowserContext，10 分钟无操作自动销毁。
 * 安全沙箱：阻断内网 IP / localhost 访问，强制超时。
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';

// ─── 配置 ─────────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 10 * 60 * 1000; // 10分钟无操作销毁
const NAV_TIMEOUT_MS = 20_000;          // 页面导航超时
const ACTION_TIMEOUT_MS = 8_000;        // 点击/输入超时
const MAX_CONTENT_CHARS = 8_000;        // 返回正文最大字符数
const MAX_SESSIONS = 30;               // 并发会话上限

/** 内网/危险地址正则，阻断 SSRF */
const BLOCKED_PATTERN =
  /^(https?:\/\/)?(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:|fe80:)/i;

// ─── 浏览器单例 ───────────────────────────────────────────────────────────────

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  const executablePath =
    process.env.CHROMIUM_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    '/usr/bin/chromium-browser';

  _browser = await chromium.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
    headless: true,
  });
  _browser.on('disconnected', () => { _browser = null; });
  console.log('[Browser] Chromium launched');
  return _browser;
}

// ─── 会话管理 ─────────────────────────────────────────────────────────────────

interface BrowserSession {
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  timer: ReturnType<typeof setTimeout>;
}

const _sessions = new Map<string, BrowserSession>();

async function getSession(userId: string): Promise<BrowserSession> {
  const existing = _sessions.get(userId);
  if (existing) {
    existing.lastUsed = Date.now();
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => closeSession(userId), SESSION_TTL_MS);
    return existing;
  }

  if (_sessions.size >= MAX_SESSIONS) {
    // 淘汰最久未使用的会话
    let oldest = '';
    let oldestTime = Infinity;
    for (const [id, s] of _sessions) {
      if (s.lastUsed < oldestTime) { oldest = id; oldestTime = s.lastUsed; }
    }
    if (oldest) await closeSession(oldest);
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const session: BrowserSession = {
    context,
    page,
    lastUsed: Date.now(),
    timer: setTimeout(() => closeSession(userId), SESSION_TTL_MS),
  };
  _sessions.set(userId, session);
  console.log(`[Browser] New session for user ${userId} (total: ${_sessions.size})`);
  return session;
}

export async function closeSession(userId: string): Promise<void> {
  const s = _sessions.get(userId);
  if (!s) return;
  clearTimeout(s.timer);
  _sessions.delete(userId);
  try { await s.context.close(); } catch { /* ignore */ }
  console.log(`[Browser] Closed session for user ${userId}`);
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function checkUrl(url: string): void {
  if (BLOCKED_PATTERN.test(url)) {
    throw new Error(`禁止访问内网或本地地址: ${url}`);
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL 必须以 http:// 或 https:// 开头');
  }
}

/** 提取页面可读正文，去除脚本/样式 */
async function extractText(page: Page): Promise<string> {
  return page.evaluate(() => {
    document
      .querySelectorAll('script,style,nav,footer,header,aside,[role="navigation"],[aria-hidden="true"]')
      .forEach((el) => el.remove());
    return (document.body?.innerText || '').replace(/\s{3,}/g, '\n\n').trim();
  });
}

/** 截断至最大长度并附说明 */
function cap(text: string, max = MAX_CONTENT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n…（内容过长，已截断，共 ${text.length} 字）`;
}

// ─── 对外暴露的工具 API ───────────────────────────────────────────────────────

/**
 * 打开网页并返回标题 + 正文
 */
export async function browserOpen(
  userId: string,
  url: string,
): Promise<string> {
  checkUrl(url);
  const { page } = await getSession(userId);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(800); // 等 JS 渲染
    const title = await page.title();
    const text = await extractText(page);
    return `📄 **${title}**\n🔗 ${page.url()}\n\n${cap(text)}`;
  } catch (err) {
    return `❌ 无法打开页面: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 点击页面上的元素（支持 CSS 选择器或文本匹配）
 */
export async function browserClick(
  userId: string,
  selector: string,
): Promise<string> {
  const { page } = await getSession(userId);
  try {
    // 先尝试 CSS 选择器，再尝试文本
    const byText = selector.startsWith('text=');
    if (byText) {
      await page.getByText(selector.slice(5)).first().click({ timeout: ACTION_TIMEOUT_MS });
    } else {
      await page.locator(selector).first().click({ timeout: ACTION_TIMEOUT_MS });
    }
    await page.waitForTimeout(600);
    const title = await page.title();
    const text = await extractText(page);
    return `✅ 已点击「${selector}」\n当前页面：${title}\n\n${cap(text, 4000)}`;
  } catch (err) {
    return `❌ 点击失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 在输入框中填写文字
 */
export async function browserType(
  userId: string,
  selector: string,
  text: string,
): Promise<string> {
  const { page } = await getSession(userId);
  try {
    await page.locator(selector).first().fill(text, { timeout: ACTION_TIMEOUT_MS });
    return `✅ 已在「${selector}」中输入：${text}`;
  } catch (err) {
    return `❌ 输入失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 获取当前页面正文内容
 */
export async function browserGetContent(userId: string): Promise<string> {
  const { page } = await getSession(userId);
  try {
    const title = await page.title();
    const url = page.url();
    const text = await extractText(page);
    return `📄 **${title}**\n🔗 ${url}\n\n${cap(text)}`;
  } catch (err) {
    return `❌ 获取内容失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 获取当前页面所有链接
 */
export async function browserGetLinks(userId: string): Promise<string> {
  const { page } = await getSession(userId);
  try {
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => ({ text: (a as HTMLAnchorElement).innerText.trim().slice(0, 60), href: (a as HTMLAnchorElement).href }))
        .filter((l) => l.href.startsWith('http') && l.text.length > 0)
        .slice(0, 30),
    );
    if (!links.length) return '当前页面没有找到链接。';
    return links.map((l, i) => `${i + 1}. [${l.text}](${l.href})`).join('\n');
  } catch (err) {
    return `❌ 获取链接失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 截图（返回 base64 data URL，供多模态输入）
 */
export async function browserScreenshot(userId: string): Promise<string> {
  const { page } = await getSession(userId);
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (err) {
    return `❌ 截图失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** 会话总数，供监控用 */
export function getSessionCount(): number {
  return _sessions.size;
}
