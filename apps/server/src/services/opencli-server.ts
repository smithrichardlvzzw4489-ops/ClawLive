/**
 * 服务端执行 opencli-rs（与 AutoCLI / OpenCLI-RS 一致），需部署时在环境变量中配置可执行文件路径。
 * 仅允许白名单预设，禁止任意 shell。
 */
import { spawn } from 'node:child_process';

const RUN_TIMEOUT_MS = 90_000;
const MAX_OUT = 400_000;

export function getOpenCliRsBinaryPath(): string | null {
  const p = process.env.OPENCLI_RS_BIN?.trim();
  return p || null;
}

export type OpencliRunPreset =
  | 'hackernews_top'
  | 'devto_top'
  | 'lobsters_hot'
  | 'arxiv_search';

/**
 * 在服务端子进程中执行 opencli-rs，返回 stdout 文本。
 */
export async function spawnOpenCliRs(argv: string[]): Promise<string> {
  const bin = getOpenCliRsBinaryPath();
  if (!bin) {
    throw new Error('未配置 OPENCLI_RS_BIN：请在服务器上安装 opencli-rs 并设置该环境变量为可执行文件绝对路径。');
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn(bin, argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`opencli-rs 执行超时（>${RUN_TIMEOUT_MS}ms）`));
    }, RUN_TIMEOUT_MS);

    child.stdout?.on('data', (c: Buffer) => chunks.push(c));
    child.stderr?.on('data', (c: Buffer) => errChunks.push(c));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks).toString('utf8');
      const err = Buffer.concat(errChunks).toString('utf8');
      if (out.length > MAX_OUT) {
        resolve(`${out.slice(0, MAX_OUT)}\n\n…（输出过长已截断）`);
        return;
      }
      if (code !== 0) {
        reject(new Error(err.trim() || `opencli-rs 退出码 ${code}`));
        return;
      }
      resolve(out);
    });
  });
}

function clampLimit(n: unknown, def: number, max: number): number {
  const v = Number(n);
  if (Number.isNaN(v)) return def;
  return Math.min(max, Math.max(1, Math.floor(v)));
}

/** arxiv 搜索词：禁止 shell 元字符 */
function sanitizeSearchQuery(q: string, maxLen: number): string {
  const t = q.trim().slice(0, maxLen);
  if (!t) throw new Error('搜索词不能为空');
  if (/[;&|`$()<>\n\r\\]/.test(t)) throw new Error('搜索词包含不允许的字符');
  return t;
}

/**
 * 按预设组装 argv（与 opencli-rs 公开 API 类命令一致，无需浏览器）。
 */
export async function runOpencliPreset(
  preset: OpencliRunPreset,
  args: { limit?: unknown; query?: unknown },
): Promise<string> {
  const limit = clampLimit(args.limit, 5, 15);
  switch (preset) {
    case 'hackernews_top':
      return spawnOpenCliRs(['hackernews', 'top', '--limit', String(limit), '--format', 'json']);
    case 'devto_top':
      return spawnOpenCliRs(['devto', 'top', '--limit', String(limit), '--format', 'json']);
    case 'lobsters_hot':
      return spawnOpenCliRs(['lobsters', 'hot', '--limit', String(limit), '--format', 'json']);
    case 'arxiv_search': {
      const q = sanitizeSearchQuery(String(args.query || ''), 240);
      return spawnOpenCliRs(['arxiv', 'search', q, '--limit', String(limit), '--format', 'json']);
    }
    default: {
      const _x: never = preset;
      throw new Error(`未知预设：${_x}`);
    }
  }
}
