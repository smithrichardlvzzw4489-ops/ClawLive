/**
 * Darwin 云端网页沙箱（语义对齐 Claude Code：工作区根目录 + 静态资源服务）。
 * 预览由 Express static 直接提供，不依赖本机 Python。
 */
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../lib/data-path';

const SANDBOX_ROOT = path.join(DATA_DIR, 'darwin-sandbox');

const MAX_FILE_BYTES = 512 * 1024;
const MAX_WORKSPACE_BYTES = 5 * 1024 * 1024;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

type PreviewEntry = {
  userId: string;
  token: string;
  /** 静态站根目录（与写入路径一致） */
  workspace: string;
  startedAt: number;
};

const previewsByToken = new Map<string, PreviewEntry>();
const previewByUserId = new Map<string, string>();

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function getUserWorkspaceDir(userId: string): string {
  const dir = path.join(SANDBOX_ROOT, userId, 'workspace');
  ensureDir(dir);
  return dir;
}

/** 禁止路径逃逸 */
function safeRelativePath(rel: string): string | null {
  const n = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  if (n.includes('..')) return null;
  if (path.isAbsolute(n)) return null;
  return n;
}

function workspaceTotalBytes(dir: string): number {
  let total = 0;
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  try {
    walk(dir);
  } catch {
    /* empty */
  }
  return total;
}

export type WriteSandboxFileResult =
  | { ok: true; fullPath: string; relativePath: string }
  | { ok: false; error: string };

/**
 * 写入用户沙箱文件（对齐 Claude Code「限定根目录」的文件写入语义）
 */
export function writeSandboxFile(userId: string, relativePath: string, content: string): WriteSandboxFileResult {
  const rel = safeRelativePath(relativePath.trim());
  if (!rel || !rel.length) {
    return { ok: false, error: '非法路径：仅允许相对路径且不能包含 ..' };
  }
  const buf = Buffer.from(content, 'utf8');
  if (buf.length > MAX_FILE_BYTES) {
    return { ok: false, error: `单文件过大（>${MAX_FILE_BYTES} 字节）` };
  }
  const root = getUserWorkspaceDir(userId);
  const full = path.join(root, rel);
  if (!full.startsWith(root)) {
    return { ok: false, error: '路径越界' };
  }
  const nextTotal = workspaceTotalBytes(root) - (fs.existsSync(full) ? fs.statSync(full).size : 0) + buf.length;
  if (nextTotal > MAX_WORKSPACE_BYTES) {
    return { ok: false, error: `工作区总大小超限（>${MAX_WORKSPACE_BYTES} 字节），请删除部分文件或调用 sandbox_clear_workspace` };
  }
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, buf);
  return { ok: true, fullPath: full, relativePath: rel.replace(/\\/g, '/') };
}

export function listSandboxFiles(userId: string): string[] {
  const root = getUserWorkspaceDir(userId);
  const out: string[] = [];
  const walk = (d: string, prefix: string) => {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) walk(p, rel);
      else out.push(rel.replace(/\\/g, '/'));
    }
  };
  try {
    walk(root, '');
  } catch {
    /* empty */
  }
  return out.sort();
}

export function clearSandboxWorkspace(userId: string): void {
  const root = getUserWorkspaceDir(userId);
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  ensureDir(root);
}

export type StartPreviewResult =
  | { ok: true; token: string; previewPath: string }
  | { ok: false; error: string };

/**
 * 注册预览令牌（由 Express static 提供文件，无需子进程）
 */
export function startSandboxPreview(userId: string): StartPreviewResult {
  const existing = previewByUserId.get(userId);
  if (existing) previewsByToken.delete(existing);

  const token = randomBytes(18).toString('hex');
  const workspace = getUserWorkspaceDir(userId);
  const entry: PreviewEntry = { userId, token, workspace, startedAt: Date.now() };
  previewsByToken.set(token, entry);
  previewByUserId.set(userId, token);
  return { ok: true, token, previewPath: `/sandbox-preview/${token}/` };
}

export function getPreviewEntry(token: string): PreviewEntry | undefined {
  const e = previewsByToken.get(token);
  if (!e) return undefined;
  if (Date.now() - e.startedAt > PREVIEW_TTL_MS) {
    previewsByToken.delete(token);
    if (previewByUserId.get(e.userId) === token) previewByUserId.delete(e.userId);
    return undefined;
  }
  return e;
}

setInterval(() => {
  const now = Date.now();
  for (const e of previewsByToken.values()) {
    if (now - e.startedAt > PREVIEW_TTL_MS) {
      previewsByToken.delete(e.token);
      if (previewByUserId.get(e.userId) === e.token) previewByUserId.delete(e.userId);
    }
  }
}, 60 * 1000).unref();
