/**
 * 云端 Darwin 对外部 URL 的请求：SSRF 防护 + Jina Reader / Exa。
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('fe80:')) return true; // link-local IPv6
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      if (net.isIPv4(v4)) return isPrivateOrReservedIp(v4);
    }
  }
  return false;
}

/**
 * 校验用户提供的 URL 是否允许经服务端代取（仅 http/https，禁止内网与元数据地址）。
 */
export async function assertSafePublicHttpUrl(raw: string): Promise<URL> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('URL 不能为空');
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('URL 格式无效');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接');
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new Error('该主机不允许访问');
  }
  if (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error('该主机不允许访问');
  }

  try {
    const resolved = await dns.lookup(host, { all: true });
    for (const { address } of resolved) {
      if (isPrivateOrReservedIp(address)) {
        throw new Error('该地址不允许访问');
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('不允许')) throw e;
    throw new Error('无法解析该域名，请检查 URL');
  }

  return u;
}

/**
 * 通过 Jina Reader 拉取页面正文（与 Agent Reach 文档中的 curl r.jina.ai 一致）。
 * 可选 JINA_API_KEY 提高额度与稳定性。
 */
export async function fetchReadableViaJina(targetUrl: string): Promise<{ text: string; titleHint?: string }> {
  const u = await assertSafePublicHttpUrl(targetUrl);
  const jinaReader = `https://r.jina.ai/${u.href}`;
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'User-Agent': 'ClawLive-Darwin/1.0',
    'X-Return-Format': 'text',
  };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const resp = await fetch(jinaReader, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) {
    throw new Error(`Jina Reader HTTP ${resp.status}`);
  }
  const text = await resp.text();
  if (!text || text.length < 20) {
    throw new Error('页面内容为空或无法解析');
  }
  const max = 120_000;
  const clipped = text.length > max ? `${text.slice(0, max)}\n\n…（已截断，原文过长）` : text;
  return { text: clipped };
}

/**
 * Exa 语义搜索（需 EXA_API_KEY）。请求体与 Exa Search API 文档一致。
 */
export async function exaWebSearch(query: string, numResults = 5): Promise<string> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) throw new Error('EXA_API_KEY 未配置');

  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query: query.trim(),
      numResults: Math.min(Math.max(1, numResults), 10),
      type: 'auto',
      contents: { text: true },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Exa HTTP ${resp.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
  }
  const data = (await resp.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };
  const results = data.results || [];
  if (!results.length) return '未找到相关结果。';
  return results
    .map((r, i) => {
      const t = (r.text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
      return `[${i + 1}] ${r.title || '无标题'}\n${t}\n来源：${r.url || ''}`;
    })
    .join('\n\n');
}
