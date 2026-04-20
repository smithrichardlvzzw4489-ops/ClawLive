import type { DarwinOnboardingAnswers } from '@clawlive/shared-types';

const _BACKEND_URL = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');
const _PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

/**
 * 浏览器：若配置的 API 与当前站点不同源，则使用 ''（同源 `/api/...`），由 next.config.js
 * rewrites 反代到后端。避免直连 Railway 时当前 Origin 未写入后端 CORS 而出现 `Failed to fetch`。
 * Socket 等仍可用 NEXT_PUBLIC_SOCKET_URL 直连（见 socket.ts）。
 * 服务端 / SSR：始终使用完整后端地址。
 */
function getBrowserApiBaseUrl(): string {
  if (!_PUBLIC_API_URL) return '';
  try {
    const apiOrigin = new URL(_PUBLIC_API_URL).origin;
    if (apiOrigin !== window.location.origin) return '';
  } catch {
    return _PUBLIC_API_URL;
  }
  return _PUBLIC_API_URL;
}

export const API_BASE_URL =
  typeof window === 'undefined' ? _BACKEND_URL : getBrowserApiBaseUrl();

/** Actual backend origin for server-only contexts (e.g. video-proxy, OG images). */
export const SERVER_API_URL = _BACKEND_URL;

/**
 * 媒体地址：/uploads/... 使用同源相对路径，由 next.config.js rewrites 转发到后端；
 * 避免 NEXT_PUBLIC_API_URL 未注入时回退 localhost 导致线上裂图。
 */
export function resolveMediaUrl(path: string | null | undefined): string {
  if (path == null || path === '') return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/uploads/')) {
    return normalized;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${normalized}`;
}

function getNetworkErrorMsg(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return '无法连接服务器。请确认本地后端已启动（本仓库默认 http://localhost:3001）。';
    }
  }
  return '无法连接服务器。若前端在 Vercel、后端在 Railway，请在 Vercel 项目环境变量中至少设置其一并重新部署：BACKEND_URL 或 NEXT_PUBLIC_API_URL（均为 Railway 公网 https 根地址，无尾斜杠；仅服务端可配 BACKEND_URL，构建时也会用于 /api 反代）。并确认 Railway 服务在线。';
}

/** 流式 NDJSON 行级统计（与后端 ndjsonLines / 进度日志对照）。 */
export type CodernetLinkSearchStreamLineStats = {
  jsonLines: number;
  progressLines: number;
  keepaliveLines: number;
  lastProgressPhase?: string;
};

/** LINK 搜索流在浏览器侧的可量化诊断（与 `[GITLINK] linkSearch` 服务端日志对照）。 */
export type CodernetLinkSearchClientDiag = {
  httpStatus?: number;
  contentType?: string | null;
  /** 与响应头 `X-Gitlink-Deploy-Commit` 一致时，可确认浏览器命中的后端构建 */
  deployCommit?: string | null;
  /** 与响应头 `X-Gitlink-Link-Search-Stream` 一致 */
  streamProtocolHeader?: string | null;
  /** 浏览器发出的 `X-Request-Id` */
  clientRequestId?: string;
  /** 服务端回显或最终采用的追踪 ID */
  responseRequestId?: string;
  chunkReads?: number;
  /** 各二进制分片 byteLength 之和（与 UTF-8 字符数接近，便于与后端 ndjsonBytes 对照） */
  rawChunkBytes?: number;
  elapsedMs?: number;
  firstChunkElapsedMs?: number | null;
  parsePath?: 'ndjson_stream' | 'fulltext_fallback';
  sawCompleteNdjsonLine?: boolean;
  /** 与 `CodernetLinkSearchStreamLineStats` 对齐 */
  ndjsonJsonLines?: number;
  progressLineCount?: number;
  keepaliveLineCount?: number;
  lastProgressPhase?: string;
  /** 流结束时未拼成整行的尾部长度（疑似截断） */
  incompleteTailLen?: number;
  /** 截断后的响应前缀，仅用于控制台 JSON，避免刷屏 */
  bodyPrefix?: string;
};

export class APIError extends Error {
  /** 与 `withCodernetSearchTrace` 中展示的一致，便于 UI 单独展示 */
  codernetSearchTraceId?: string;
  linkSearchClientDiag?: CodernetLinkSearchClientDiag;

  constructor(public status: number, message: string, opts?: { codernetSearchTraceId?: string; linkSearchClientDiag?: CodernetLinkSearchClientDiag }) {
    super(message);
    this.name = 'APIError';
    if (opts?.codernetSearchTraceId) this.codernetSearchTraceId = opts.codernetSearchTraceId;
    if (opts?.linkSearchClientDiag) this.linkSearchClientDiag = opts.linkSearchClientDiag;
  }
}

/** LINK `POST /api/codernet/search` 流式进度（与后端 `SearchProgress` 对齐） */
export type CodernetSearchProgress = {
  phase: 'parsing' | 'searching' | 'enriching' | 'ranking' | 'done' | 'error';
  detail: string;
  githubQuery?: string;
  totalFound?: number;
  keepalive?: boolean;
};

export type CodernetLinkSearchBucketKey =
  | 'jobSeekingAndContact'
  | 'jobSeekingOnly'
  | 'contactOnly'
  | 'neither';

export type CodernetLinkSearchBuckets = Record<CodernetLinkSearchBucketKey, unknown[]>;

export type CodernetLinkSearchResponse = {
  results: unknown[];
  buckets?: CodernetLinkSearchBuckets;
  meta?: {
    mergedGithubCount?: number;
    withPublicContactCount?: number;
    enrichedCount?: number;
    deepEnrichCount?: number;
    metadataOnlyCount?: number;
  };
};

function stripUtf8Bom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

/** LINK 搜索流异常时附带 `X-Request-Id`，便于与后端 `[GITLINK] linkSearch` 日志逐条对齐。 */
function withCodernetSearchTrace(message: string, traceId: string | null | undefined): string {
  const id = typeof traceId === 'string' ? traceId.trim() : '';
  if (!id) return message;
  return `${message}\n（请求追踪 ID: ${id}；可与服务端日志 [GITLINK] linkSearch 对照）`;
}

function formatCodernetLinkSearchDiagCn(d: CodernetLinkSearchClientDiag): string {
  const parts: string[] = [];
  if (d.httpStatus != null) parts.push(`HTTP ${d.httpStatus}`);
  if (d.contentType) parts.push(`Content-Type: ${d.contentType}`);
  if (d.deployCommit) parts.push(`部署提交 ${d.deployCommit}`);
  if (d.chunkReads != null) parts.push(`read 次数 ${d.chunkReads}`);
  if (d.rawChunkBytes != null) parts.push(`原始分片字节约 ${d.rawChunkBytes}`);
  if (d.elapsedMs != null) parts.push(`耗时约 ${d.elapsedMs}ms`);
  if (d.firstChunkElapsedMs != null) parts.push(`首包约 ${d.firstChunkElapsedMs}ms`);
  if (d.parsePath) parts.push(`解析路径 ${d.parsePath}`);
  if (d.sawCompleteNdjsonLine != null) parts.push(`已解析到 complete 行: ${d.sawCompleteNdjsonLine}`);
  if (d.clientRequestId) parts.push(`客户端请求 ID ${d.clientRequestId}`);
  if (d.responseRequestId && d.responseRequestId !== d.clientRequestId) {
    parts.push(`响应追踪 ID ${d.responseRequestId}`);
  }
  if (d.streamProtocolHeader) parts.push(`流协议头 ${d.streamProtocolHeader}`);
  if (d.ndjsonJsonLines != null) parts.push(`NDJSON 行 ${d.ndjsonJsonLines}`);
  if (d.progressLineCount != null) parts.push(`progress 行 ${d.progressLineCount}`);
  if (d.keepaliveLineCount != null) parts.push(`保活行 ${d.keepaliveLineCount}`);
  if (d.lastProgressPhase) parts.push(`末次阶段 ${d.lastProgressPhase}`);
  if (d.incompleteTailLen != null && d.incompleteTailLen > 0) {
    parts.push(`未闭合尾部 ${d.incompleteTailLen} 字节`);
  }
  return parts.join('；');
}

function mergeLineStatsIntoDiag(
  d: CodernetLinkSearchClientDiag,
  stats: CodernetLinkSearchStreamLineStats,
): CodernetLinkSearchClientDiag {
  return {
    ...d,
    ndjsonJsonLines: stats.jsonLines,
    progressLineCount: stats.progressLines,
    keepaliveLineCount: stats.keepaliveLines,
    lastProgressPhase: stats.lastProgressPhase,
  };
}

function logCodernetLinkSearchClientFailure(
  tag: string,
  traceId: string | null | undefined,
  diag: CodernetLinkSearchClientDiag,
  rawText?: string,
): void {
  try {
    const t = typeof rawText === 'string' ? stripUtf8Bom(rawText).trim() : '';
    const bodyPrefix = t.slice(0, 400);
    console.warn(
      '[GITLINK] linkSearch client',
      tag,
      JSON.stringify({
        traceId: typeof traceId === 'string' ? traceId.trim() : '',
        ...diag,
        bodyPrefix: bodyPrefix || undefined,
      }),
    );
  } catch {
    /* ignore */
  }
}

function attachCodernetSearchOpts(
  traceId: string | null | undefined,
  diag?: CodernetLinkSearchClientDiag,
): { codernetSearchTraceId?: string; linkSearchClientDiag?: CodernetLinkSearchClientDiag } {
  const id = typeof traceId === 'string' ? traceId.trim() : '';
  return {
    ...(id ? { codernetSearchTraceId: id } : {}),
    ...(diag ? { linkSearchClientDiag: diag } : {}),
  };
}

/** 旧版服务端把运维环境变量写进 `message`；归一成用户向说明（与新版 `LINK_SEARCH_STREAM_DEADLINE` 语义一致）。 */
function normalizeCodernetSearchStreamDeadlineMessage(message: string): string {
  const m = message.trim();
  const legacyOpsInMessage =
    m.includes('LINK_SEARCH_STREAM_MAX_MS') || /\b搜索流处理达到上限\b/.test(m);
  if (!legacyOpsInMessage) return message;
  const sec = m.match(/约\s*(\d+)\s*秒/);
  return sec
    ? `本次搜索已处理约 ${sec[1]} 秒仍未完成，为防止连接中断已自动结束。请缩小职位描述或检索范围、减少附件后重试。`
    : '本次搜索耗时过长，已自动结束以免连接中断。请缩小职位描述或检索范围、减少附件后重试。';
}

function handleCodernetSearchNdjsonLine(
  trimmed: string,
  onProgress: ((p: CodernetSearchProgress) => void) | undefined,
  state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  },
  traceId?: string | null,
  lineStats?: CodernetLinkSearchStreamLineStats | null,
): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return;
  }
  if (lineStats) {
    lineStats.jsonLines += 1;
  }
  const typ = typeof msg.type === 'string' ? msg.type.toLowerCase() : '';
  if (typ === 'progress' && msg.progress && typeof msg.progress === 'object' && onProgress) {
    if (lineStats) {
      lineStats.progressLines += 1;
      const pr = msg.progress as { keepalive?: boolean; phase?: string };
      if (pr.keepalive) lineStats.keepaliveLines += 1;
      if (typeof pr.phase === 'string') lineStats.lastProgressPhase = pr.phase;
    }
    onProgress(msg.progress as CodernetSearchProgress);
  } else if (typ === 'complete') {
    state.results = Array.isArray(msg.results) ? msg.results : [];
    const b = msg.buckets;
    if (b && typeof b === 'object') {
      state.buckets = {
        jobSeekingAndContact: Array.isArray((b as Record<string, unknown>).jobSeekingAndContact)
          ? ((b as Record<string, unknown>).jobSeekingAndContact as unknown[])
          : [],
        jobSeekingOnly: Array.isArray((b as Record<string, unknown>).jobSeekingOnly)
          ? ((b as Record<string, unknown>).jobSeekingOnly as unknown[])
          : [],
        contactOnly: Array.isArray((b as Record<string, unknown>).contactOnly)
          ? ((b as Record<string, unknown>).contactOnly as unknown[])
          : [],
        neither: Array.isArray((b as Record<string, unknown>).neither)
          ? ((b as Record<string, unknown>).neither as unknown[])
          : [],
      };
    } else {
      state.buckets = null;
    }
    const m = msg.meta;
    state.meta =
      m && typeof m === 'object'
        ? (m as {
            mergedGithubCount?: number;
            withPublicContactCount?: number;
            enrichedCount?: number;
            deepEnrichCount?: number;
            metadataOnlyCount?: number;
          })
        : null;
  } else if (typ === 'error') {
    const raw = typeof msg.message === 'string' ? msg.message : '搜索失败';
    const userMsg = normalizeCodernetSearchStreamDeadlineMessage(raw);
    throw new APIError(
      500,
      withCodernetSearchTrace(userMsg, traceId),
      attachCodernetSearchOpts(
        traceId,
        lineStats ? mergeLineStatsIntoDiag({}, lineStats) : undefined,
      ),
    );
  }
}

/**
 * 解析整段响应：NDJSON 行 + 最后一行可能无换行；若无 `complete` 行则尝试整包 JSON `{ results }`。
 */
function parseCodernetSearchResponseBody(
  rawText: string,
  onProgress?: (p: CodernetSearchProgress) => void,
  traceId?: string | null,
  streamDiag?: CodernetLinkSearchClientDiag,
  lineStats?: CodernetLinkSearchStreamLineStats | null,
): CodernetLinkSearchResponse {
  const text = stripUtf8Bom(rawText);
  const state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  } = { results: null, buckets: null, meta: null };

  const stats =
    lineStats ??
    ({
      jsonLines: 0,
      progressLines: 0,
      keepaliveLines: 0,
    } as CodernetLinkSearchStreamLineStats);

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    handleCodernetSearchNdjsonLine(trimmed, onProgress, state, traceId, stats);
  }

  if (state.results !== null) {
    return {
      results: state.results,
      buckets: state.buckets ?? undefined,
      meta: state.meta ?? undefined,
    };
  }

  try {
    const msg = JSON.parse(text) as Record<string, unknown>;
    if (msg && typeof msg === 'object' && Array.isArray(msg.results)) {
      const out: CodernetLinkSearchResponse = { results: msg.results };
      const b = msg.buckets;
      if (b && typeof b === 'object') {
        out.buckets = {
          jobSeekingAndContact: Array.isArray((b as Record<string, unknown>).jobSeekingAndContact)
            ? ((b as Record<string, unknown>).jobSeekingAndContact as unknown[])
            : [],
          jobSeekingOnly: Array.isArray((b as Record<string, unknown>).jobSeekingOnly)
            ? ((b as Record<string, unknown>).jobSeekingOnly as unknown[])
            : [],
          contactOnly: Array.isArray((b as Record<string, unknown>).contactOnly)
            ? ((b as Record<string, unknown>).contactOnly as unknown[])
            : [],
          neither: Array.isArray((b as Record<string, unknown>).neither)
            ? ((b as Record<string, unknown>).neither as unknown[])
            : [],
        };
      }
      if (msg.meta && typeof msg.meta === 'object') {
        out.meta = msg.meta as {
          mergedGithubCount?: number;
          withPublicContactCount?: number;
          enrichedCount?: number;
          deepEnrichCount?: number;
          metadataOnlyCount?: number;
        };
      }
      return out;
    }
  } catch {
    /* fall through */
  }

  const hasPreservedLineStats =
    streamDiag?.ndjsonJsonLines != null ||
    streamDiag?.progressLineCount != null ||
    streamDiag?.keepaliveLineCount != null;
  const mergedDiag = hasPreservedLineStats
    ? { ...(streamDiag || {}), parsePath: streamDiag?.parsePath ?? 'fulltext_fallback' }
    : mergeLineStatsIntoDiag(
        { ...(streamDiag || {}), parsePath: streamDiag?.parsePath ?? 'fulltext_fallback' },
        stats,
      );
  throwCodernetSearchResponseUnusable(text, traceId, mergedDiag);
}

/** 无法得到带 `results` 的 `complete` 行或等价 JSON 时的兜底说明（区分空/HTML/JSON 错误体）。 */
function throwCodernetSearchResponseUnusable(
  rawText: string,
  traceId?: string | null,
  streamDiag?: CodernetLinkSearchClientDiag,
): never {
  const merged: CodernetLinkSearchClientDiag = { ...(streamDiag || {}) };
  const text = stripUtf8Bom(rawText);
  const t = text.trim();
  const throwWith = (status: number, userMsg: string): never => {
    const extra = Object.keys(merged).length ? `\n（${formatCodernetLinkSearchDiagCn(merged)}）` : '';
    logCodernetLinkSearchClientFailure('response_unusable', traceId, merged, rawText);
    throw new APIError(
      status,
      withCodernetSearchTrace(userMsg + extra, traceId),
      attachCodernetSearchOpts(traceId, merged),
    );
  };
  if (!t) {
    return throwWith(0, '搜索响应为空，可能是连接中断或网关超时，请重试。');
  }
  if (/<\s*!DOCTYPE|<\s*html[\s>]/i.test(t)) {
    return throwWith(0, '搜索返回了网页而非数据（常见于网关超时或反代错误），请重试。');
  }
  if (t.length < 8192 && /\b(502|503|504)\b/i.test(t) && !t.trimStart().startsWith('{')) {
    return throwWith(0, '上游返回了错误页文本（如 502/503/504），请稍后重试。');
  }
  try {
    const msg = JSON.parse(text) as Record<string, unknown>;
    if (msg && typeof msg === 'object') {
      if (typeof msg.error === 'string' && msg.error.trim()) {
        return throwWith(500, msg.error);
      }
      const typ = typeof msg.type === 'string' ? msg.type.toLowerCase() : '';
      if (typ === 'error' && typeof msg.message === 'string' && msg.message.trim()) {
        return throwWith(500, normalizeCodernetSearchStreamDeadlineMessage(msg.message));
      }
    }
  } catch (e) {
    if (e instanceof APIError) throw e;
  }

  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  let sawProgress = false;
  let sawComplete = false;
  for (const line of lines) {
    try {
      const o = JSON.parse(line) as { type?: string };
      if (o.type === 'progress') sawProgress = true;
      if (o.type === 'complete') sawComplete = true;
    } catch {
      /* ignore */
    }
  }
  if (sawProgress && !sawComplete) {
    return throwWith(
      0,
      '搜索流中途结束：已收到进度但未收到最终结果，常见于网关或代理中断长连接。请稍后重试；若反复出现请对照服务端 [GITLINK] linkSearch 日志中的 requestId 检查反代缓冲与超时。',
    );
  }

  return throwWith(0, '搜索响应不完整或未识别。请重试；若持续出现多为网络或服务负载导致。');
}

/**
 * 读取 LINK 搜索响应：按行解析 NDJSON，并同步累积全文。
 * 不在此处使用 `body.tee()`：部分环境下未消费的 tee 分支会带来背压/内存问题；
 * 若行级解析未收到 `complete`，再用全文走 `parseCodernetSearchResponseBody`（兼容反代改写 Content-Type、
 * 或仅能通过整包解析识别的边界情况）。
 */
async function consumeCodernetSearchNdjsonStream(
  response: Response,
  onProgress?: (p: CodernetSearchProgress) => void,
  traceId?: string | null,
  clientMeta?: { clientRequestId?: string },
): Promise<CodernetLinkSearchResponse> {
  const t0 = Date.now();
  const httpStatus = response.status;
  const contentType = response.headers.get('Content-Type') || response.headers.get('content-type');
  const deployCommit =
    response.headers.get('X-Gitlink-Deploy-Commit') || response.headers.get('x-gitlink-deploy-commit');
  const streamProtocolHeader =
    response.headers.get('X-Gitlink-Link-Search-Stream') || response.headers.get('x-gitlink-link-search-stream');
  let chunkReads = 0;
  let rawChunkBytes = 0;
  let firstChunkElapsedMs: number | null = null;

  const lineStats: CodernetLinkSearchStreamLineStats = {
    jsonLines: 0,
    progressLines: 0,
    keepaliveLines: 0,
  };

  const streamBaseDiag = (): CodernetLinkSearchClientDiag => ({
    httpStatus,
    contentType,
    deployCommit: deployCommit?.trim() || undefined,
    streamProtocolHeader: streamProtocolHeader?.trim() || undefined,
    clientRequestId: clientMeta?.clientRequestId,
    responseRequestId: typeof traceId === 'string' && traceId.trim() ? traceId.trim() : undefined,
    chunkReads,
    rawChunkBytes,
    elapsedMs: Date.now() - t0,
    firstChunkElapsedMs,
    parsePath: 'ndjson_stream',
  });

  const body = response.body;
  if (!body) {
    const d = mergeLineStatsIntoDiag({ ...streamBaseDiag(), parsePath: 'ndjson_stream' as const }, lineStats);
    logCodernetLinkSearchClientFailure('no_body', traceId, d);
    throw new APIError(
      0,
      withCodernetSearchTrace('无法读取搜索响应流', traceId),
      attachCodernetSearchOpts(traceId, d),
    );
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const state: {
    results: unknown[] | null;
    buckets: CodernetLinkSearchBuckets | null;
    meta: CodernetLinkSearchResponse['meta'] | null;
  } = { results: null, buckets: null, meta: null };

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const d = mergeLineStatsIntoDiag(streamBaseDiag(), lineStats);
      logCodernetLinkSearchClientFailure('stream_read_error', traceId, d, full);
      throw new APIError(
        0,
        withCodernetSearchTrace(
          `读取搜索流失败，连接可能已断开：${raw}\n（${formatCodernetLinkSearchDiagCn(d)}）`,
          traceId,
        ),
        attachCodernetSearchOpts(traceId, d),
      );
    }
    const { done, value } = chunk;
    chunkReads += 1;
    const blen = value?.byteLength ?? 0;
    rawChunkBytes += blen;
    if (firstChunkElapsedMs === null && blen > 0) {
      firstChunkElapsedMs = Date.now() - t0;
    }
    const piece = decoder.decode(value ?? new Uint8Array(0), { stream: !done });
    full += piece;
    buffer += piece;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      handleCodernetSearchNdjsonLine(trimmed, onProgress, state, traceId, lineStats);
    }
    if (done) break;
  }

  const tailRaw = buffer;
  const tailTrim = tailRaw.trim();
  const incompleteTailLen =
    tailRaw.length > 0 ? new TextEncoder().encode(tailRaw).length : undefined;

  if (tailTrim) {
    handleCodernetSearchNdjsonLine(tailTrim, onProgress, state, traceId, lineStats);
  }

  if (state.results !== null) {
    return {
      results: state.results,
      buckets: state.buckets ?? undefined,
      meta: state.meta ?? undefined,
    };
  }

  // 未识别到 complete 行：用全文兜底（例如网关剥掉 ndjson Content-Type、或截断前行仍拼成可解析包）
  const fallbackDiag = mergeLineStatsIntoDiag(
    {
      ...streamBaseDiag(),
      parsePath: 'fulltext_fallback',
      sawCompleteNdjsonLine: false,
      incompleteTailLen: incompleteTailLen && incompleteTailLen > 0 ? incompleteTailLen : undefined,
    },
    lineStats,
  );
  return parseCodernetSearchResponseBody(full, undefined, traceId, fallbackDiag);
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const bodyIsFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!bodyIsFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const optsHeaders = options.headers;
  if (optsHeaders && typeof optsHeaders === 'object' && !(optsHeaders instanceof Headers) && !Array.isArray(optsHeaders)) {
    Object.assign(headers, optsHeaders as Record<string, string>);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const detail = `[${url}] ${raw}`;
    throw new APIError(0, `${getNetworkErrorMsg()}\n(${detail})`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const msg = error?.error || (response.status >= 500 ? `服务器错误 (${response.status})` : response.status === 0 ? '网络或 CORS 错误，请检查后端 CORS 配置' : `请求失败 (${response.status})`);
    throw new APIError(response.status, msg);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      fetchAPI('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, email: string, password: string, avatar: string) =>
      fetchAPI('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, avatar }),
      }),
    me: () => fetchAPI('/api/auth/me'),
    updateMe: (body: {
      username?: string;
      bio?: string | null;
      personalResume?: string | null;
      /** 招聘沟通/发件邮箱（如 Gmail），与账号邮箱独立 */
      recruiterOutboundEmail?: string | null;
    }) =>
      fetchAPI('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  rooms: {
    list: (params?: { page?: number; limit?: number; isLive?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', params.page.toString());
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.isLive !== undefined) query.set('isLive', params.isLive.toString());
      return fetchAPI(`/api/rooms?${query}`);
    },
    get: (roomId: string) => fetchAPI(`/api/rooms/${roomId}`),
    create: (data: { id: string; title: string; description?: string; lobsterName: string }) =>
      fetchAPI('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (roomId: string, data: any) =>
      fetchAPI(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}`, {
        method: 'DELETE',
      }),
    start: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}/start`, {
        method: 'POST',
      }),
    stop: (roomId: string) =>
      fetchAPI(`/api/rooms/${roomId}/stop`, {
        method: 'POST',
      }),
    messages: (roomId: string, params?: { limit?: number; before?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.before) query.set('before', params.before);
      return fetchAPI(`/api/rooms/${roomId}/messages?${query}`);
    },
    logs: (roomId: string, params?: { limit?: number; before?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.before) query.set('before', params.before);
      return fetchAPI(`/api/rooms/${roomId}/logs?${query}`);
    },
  },
  points: {
    llm: () => fetchAPI('/api/points/llm'),
    redeemLlm: (clawPoints: number, idempotencyKey?: string) =>
      fetchAPI('/api/points/redeem-llm', {
        method: 'POST',
        body: JSON.stringify({ clawPoints }),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),
    getVirtualKey: () => fetchAPI('/api/points/llm/virtual-key'),
    keyStats: () => fetchAPI('/api/points/llm/key-stats'),
    fixKeyModels: () => fetchAPI('/api/points/llm/fix-key-models', { method: 'POST' }),
    testLlm: (body?: { message?: string; useVirtualKey?: boolean; model?: string }) =>
      fetchAPI('/api/points/llm/test', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    history: () => fetchAPI('/api/points/history'),
  },
  lobster: {
    me: () => fetchAPI('/api/lobster/me'),
    apply: (name?: string, onboarding?: DarwinOnboardingAnswers) =>
      fetchAPI('/api/lobster/apply', {
        method: 'POST',
        body: JSON.stringify({ name, onboarding }),
      }),
    rename: (name: string) => fetchAPI('/api/lobster/name', { method: 'PATCH', body: JSON.stringify({ name }) }),
    history: () => fetchAPI('/api/lobster/history'),
    chat: (message: string, image?: string, pageContext?: string, pageUrl?: string) =>
      fetchAPI('/api/lobster/chat', { method: 'POST', body: JSON.stringify({ message, image, pageContext, pageUrl }) }),
    clearHistory: () => fetchAPI('/api/lobster/history', { method: 'DELETE' }),
    keyStatus: () => fetchAPI('/api/lobster/key-status'),
    listFiles: () => fetchAPI('/api/lobster/files'),
    deleteFile: (fileId: string) =>
      fetchAPI(`/api/lobster/files/${fileId}`, { method: 'DELETE' }),
  },
  agentKeys: {
    list: () => fetchAPI('/api/open/agent/keys'),
    create: (agentName: string, agentType?: string) =>
      fetchAPI('/api/open/agent/register', {
        method: 'POST',
        body: JSON.stringify({ agentName, agentType: agentType || 'custom' }),
      }),
    revoke: (keyId: string) => fetchAPI(`/api/open/agent/keys/${keyId}`, { method: 'DELETE' }),
  },
  publishedSkills: {
    list: (params?: { q?: string; tag?: string; page?: number }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.tag) qs.set('tag', params.tag);
      if (params?.page) qs.set('page', String(params.page));
      return fetchAPI(`/api/published-skills?${qs.toString()}`);
    },
    my: () => fetchAPI('/api/published-skills/my'),
    get: (id: string) => fetchAPI(`/api/published-skills/${id}`),
    publish: (data: {
      title: string;
      description?: string;
      skillMarkdown: string;
      tags?: string[];
      creditCostPerCall?: number;
    }) =>
      fetchAPI('/api/published-skills', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: { title?: string; description?: string; skillMarkdown?: string; tags?: string[]; creditCostPerCall?: number },
    ) => fetchAPI(`/api/published-skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI(`/api/published-skills/${id}`, { method: 'DELETE' }),
    creditTable: () => fetchAPI('/api/published-skills/credit-table'),
  },
  platform: {
    getModels: () => fetchAPI('/api/platform/models'),
    getLitellmModels: () => fetchAPI('/api/platform/litellm-models'),
    saveModels: (models: { id: string; name: string; enabled: boolean }[], adminSecret: string) =>
      fetchAPI('/api/platform/models', {
        method: 'POST',
        headers: { 'x-admin-secret': adminSecret },
        body: JSON.stringify({ models }),
      }),
  },
  feedPosts: {
    list: (params?: { evolutionPointId?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.evolutionPointId) q.set('evolutionPointId', params.evolutionPointId);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return fetchAPI(`/api/feed-posts${qs ? `?${qs}` : ''}`);
    },
    get: (postId: string) => fetchAPI(`/api/feed-posts/${postId}`),
    update: (
      postId: string,
      body: { title?: string; content?: string; images?: string[]; coverIdx?: number },
    ) =>
      fetchAPI(`/api/feed-posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  codernet: {
    /** 登录：邮箱 → GitHub 登录名（站内绑定或 GitHub 公开 commit 搜索） */
    resolveGithubFromEmail: (email: string) =>
      fetchAPI('/api/codernet/github/resolve-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    /**
     * Semantic developer search → ranked GitHub users (no email).
     * Optional `files` → multipart `query` + `attachments[]`（txt/md/pdf/docx/图片等）。
     */
    searchDevelopers: async (
      query: string,
      files?: File[],
      onProgress?: (p: CodernetSearchProgress) => void,
    ) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/codernet/search`;
      const headers: Record<string, string> = {
        Accept: 'application/x-ndjson, application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const requestTraceId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `ts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      headers['X-Request-Id'] = requestTraceId;

      let body: BodyInit;
      if (files?.length) {
        const fd = new FormData();
        fd.set('query', query);
        for (const f of files) {
          fd.append('attachments', f);
        }
        body = fd;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ query });
      }

      const tFetch = Date.now();
      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(
          0,
          withCodernetSearchTrace(`${getNetworkErrorMsg()}\n([${url}] ${raw})`, requestTraceId),
          attachCodernetSearchOpts(requestTraceId, {
            clientRequestId: requestTraceId,
            responseRequestId: requestTraceId,
            elapsedMs: Date.now() - tFetch,
          }),
        );
      }

      const traceForLogs =
        response.headers.get('x-request-id')?.trim() ||
        response.headers.get('X-Request-Id')?.trim() ||
        requestTraceId;

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string };
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        const streamHdr =
          response.headers.get('X-Gitlink-Link-Search-Stream') ||
          response.headers.get('x-gitlink-link-search-stream');
        const dep =
          response.headers.get('X-Gitlink-Deploy-Commit') || response.headers.get('x-gitlink-deploy-commit');
        throw new APIError(
          response.status,
          withCodernetSearchTrace(msg, traceForLogs),
          attachCodernetSearchOpts(traceForLogs, {
            httpStatus: response.status,
            contentType: response.headers.get('Content-Type') || response.headers.get('content-type'),
            deployCommit: dep?.trim() || undefined,
            streamProtocolHeader: streamHdr?.trim() || undefined,
            clientRequestId: requestTraceId,
            responseRequestId: traceForLogs,
          }),
        );
      }

      // 200 时后端约定为 NDJSON；反代可能改写 Content-Type，故只要存在 body 就按流读取并带全文兜底
      if (response.body) {
        return consumeCodernetSearchNdjsonStream(response, onProgress, traceForLogs, {
          clientRequestId: requestTraceId,
        });
      }
      const text = await response.text();
      return parseCodernetSearchResponseBody(text, onProgress, traceForLogs);
    },
  },
  recruitment: {
    pipelineStages: () => fetchAPI('/api/recruitment/pipeline-stages'),
    listJds: () => fetchAPI('/api/recruitment/jds'),
    createJd: (body: {
      title: string;
      body: string;
      companyName?: string | null;
      location?: string | null;
      matchTags?: string[];
    }) =>
      fetchAPI('/api/recruitment/jds', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    /** 从 .txt / .md / .pdf / .docx 等提取正文，填入「职位描述」 */
    extractJdBodyFromFile: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return fetchAPI('/api/recruitment/jds/extract-text', {
        method: 'POST',
        body: fd,
      }) as Promise<{ text?: string }>;
    },
    getJd: (id: string) => fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`),
    updateJd: (
      id: string,
      body: { title?: string; body?: string; companyName?: string | null; location?: string | null; matchTags?: string[] },
    ) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteJd: (id: string) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    addCandidate: (
      jdId: string,
      body: {
        githubUsername: string;
        displayName?: string | null;
        email?: string | null;
        notes?: string | null;
        pipelineStage?: string;
        /** 简介（如智能推荐 oneLiner） */
        intro?: string | null;
        matchScore?: number | null;
        systemRecommendedAt?: string | null;
      },
    ) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateCandidate: (
      jdId: string,
      candidateId: string,
      body: {
        displayName?: string | null;
        email?: string | null;
        notes?: string | null;
        intro?: string | null;
        pipelineStage?: string;
      },
    ) =>
      fetchAPI(
        `/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/${encodeURIComponent(candidateId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),
    deleteCandidate: (jdId: string, candidateId: string) =>
      fetchAPI(
        `/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/${encodeURIComponent(candidateId)}`,
        { method: 'DELETE' },
      ),
    /** 从 GitHub 公开信息补全尚无邮箱的候选人（服务端批量） */
    resolveCandidateEmails: (jdId: string) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/resolve-emails`, {
        method: 'POST',
        body: JSON.stringify({}),
      }) as Promise<{
        updated?: number;
        attempted?: number;
        candidates?: Array<{
          id: string;
          githubUsername: string;
          displayName: string | null;
          email: string | null;
          notes: string | null;
          intro: string | null;
          matchScore: number | null;
          systemRecommendedAt: string | null;
          pipelineStage: string;
          createdAt: string;
          updatedAt: string;
        }>;
      }>,
    /** 根据 JD 与候选人信息生成沟通邮件主题与正文（LLM） */
    smartEmail: (jdId: string, candidateId: string) =>
      fetchAPI(
        `/api/recruitment/jds/${encodeURIComponent(jdId)}/candidates/${encodeURIComponent(candidateId)}/smart-email`,
        { method: 'POST', body: JSON.stringify({}) },
      ) as Promise<{ subject?: string; body?: string }>,
    recommend: (jdId: string, body?: { limit?: number }) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/recommend`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    recommendIgnore: (jdId: string, body: { githubUsername: string }) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/recommend-ignore`, {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<{ ok?: boolean }>,
    recommendQueue: (jdId: string) =>
      fetchAPI(`/api/recruitment/jds/${encodeURIComponent(jdId)}/recommend-queue`) as Promise<{
        pending?: unknown[];
        backlogCount?: number;
        firstRecommendAt?: string | null;
        lastDailyRecommendAt?: string | null;
        recommendBootstrapPending?: boolean;
        recommendBootstrapTrace?: Array<{
          at: string;
          phase: string;
          ok: boolean;
          detail?: string;
          meta?: Record<string, unknown>;
        }>;
        recommendBootstrapOutcome?: string;
        recommendBootstrapLastPhase?: string | null;
        recommendBootstrapLastOk?: boolean | null;
      }>,
  },
  jobPlaza: {
    list: (params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const s = q.toString();
      return fetchAPI(`/api/job-plaza${s ? `?${s}` : ''}`) as Promise<{
        items?: unknown[];
        page?: number;
        limit?: number;
        total?: number;
      }>;
    },
    get: (id: string) =>
      fetchAPI(`/api/job-plaza/${encodeURIComponent(id)}`) as Promise<{ posting?: Record<string, unknown> }>,
    mathMatch: (id: string) =>
      fetchAPI(`/api/job-plaza/${encodeURIComponent(id)}/math-match`, {
        method: 'POST',
        body: JSON.stringify({}),
      }) as Promise<{
        result?: {
          jdItemMatches: Array<{ id: string; title: string; matchScore: number; rationale: string; gap?: string }>;
          overallMatch: number;
          executiveSummary: string;
          notes?: string;
        };
        meta?: Record<string, unknown>;
      }>,
  },
  siteMessages: {
    send: (body: { toUsername: string; subject?: string; body: string }) =>
      fetchAPI('/api/site-messages', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    inbox: () =>
      fetchAPI('/api/site-messages/inbox') as Promise<{ items?: unknown[]; unread?: number }>,
    sent: () => fetchAPI('/api/site-messages/sent') as Promise<{ items?: unknown[] }>,
    markRead: (id: string) =>
      fetchAPI(`/api/site-messages/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: '{}' }),
  },
  math: {
    /** SSE: same FormData as match(); onEvent receives JSON payloads { phase, ... } */
    matchStream: async (formData: FormData, onEvent: (payload: Record<string, unknown>) => void) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/math/match-stream`;
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (token) headers.Authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body: formData });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(0, `${getNetworkErrorMsg()}\n([${url}] ${raw})`);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        throw new APIError(response.status, msg);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new APIError(0, '无法读取响应流');
      }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
              onEvent(payload);
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      }
    },
    /** Multipart: jdText, resumeText, githubUsername, jdFiles[], resumeFiles[] */
    match: async (formData: FormData) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/api/math/match`;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetch(url, { method: 'POST', headers, body: formData });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new APIError(0, `${getNetworkErrorMsg()}\n([${url}] ${raw})`);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const msg =
          error?.error ||
          (response.status >= 500 ? `服务器错误 (${response.status})` : `请求失败 (${response.status})`);
        throw new APIError(response.status, msg);
      }
      return response.json() as Promise<{
        result: {
          jdItemMatches: Array<{
            id: string;
            title: string;
            matchScore: number;
            rationale: string;
            gap?: string;
          }>;
          overallMatch: number;
          executiveSummary: string;
          notes?: string;
        };
        meta: { jdChars: number; resumeChars: number; githubUsed: boolean };
      }>;
    },
  },
  admin: {
    usersOverview: () => fetchAPI('/api/admin/users-overview'),
  },
};
