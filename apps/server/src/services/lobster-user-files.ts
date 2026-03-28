/**
 * 虾米用户文件柜
 * 统一管理每位用户的所有文件：生成的 PPT/PDF、上传的图片/文档、导出的报告等
 *
 * 存储结构：
 *   DATA_DIR/user-files/<userId>/files/    实际文件
 *   DATA_DIR/user-files/<userId>/meta.json 文件元数据列表
 */
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../lib/data-path';
import { v4 as uuidv4 } from 'uuid';

export type UserFileType =
  | 'ppt'
  | 'pdf'
  | 'image'
  | 'document'
  | 'data'
  | 'note'
  | 'other';

export interface UserFile {
  id: string;
  userId: string;
  filename: string;        // 磁盘上的实际文件名
  displayName: string;     // 展示给用户的友好名称
  type: UserFileType;
  mimeType?: string;
  sizeBytes: number;
  source: 'generated' | 'uploaded';
  /** 虾米生成时记录是通过哪个工具产生的 */
  toolName?: string;
  downloadPath: string;    // /api/lobster/files/:userId/:filename
  createdAt: string;
}

// ─── 路径工具 ──────────────────────────────────────────────────────────────────

function userFilesDir(userId: string): string {
  return path.join(DATA_DIR, 'user-files', userId, 'files');
}

function metaPath(userId: string): string {
  return path.join(DATA_DIR, 'user-files', userId, 'meta.json');
}

function ensureDir(userId: string): void {
  const dir = userFilesDir(userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── 元数据读写 ────────────────────────────────────────────────────────────────

function loadMeta(userId: string): UserFile[] {
  const p = metaPath(userId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as UserFile[];
  } catch {
    return [];
  }
}

function saveMeta(userId: string, files: UserFile[]): void {
  const p = metaPath(userId);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(files, null, 2), 'utf-8');
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 将一个已存在的文件注册到用户文件柜（不移动文件）
 * 用于 create_ppt 等已自行写入磁盘的场景
 */
export function registerFile(params: {
  userId: string;
  existingPath: string;   // 文件当前路径（将被复制到用户目录）
  displayName: string;
  type: UserFileType;
  mimeType?: string;
  source: 'generated' | 'uploaded';
  toolName?: string;
}): UserFile {
  ensureDir(params.userId);

  const ext = path.extname(params.existingPath);
  const filename = `${uuidv4().slice(0, 8)}${ext}`;
  const destPath = path.join(userFilesDir(params.userId), filename);

  // 复制到用户目录
  fs.copyFileSync(params.existingPath, destPath);

  const stat = fs.statSync(destPath);
  const file: UserFile = {
    id: uuidv4(),
    userId: params.userId,
    filename,
    displayName: params.displayName,
    type: params.type,
    mimeType: params.mimeType,
    sizeBytes: stat.size,
    source: params.source,
    toolName: params.toolName,
    downloadPath: `/api/lobster/files/${params.userId}/${filename}`,
    createdAt: new Date().toISOString(),
  };

  const meta = loadMeta(params.userId);
  meta.unshift(file); // 最新的在前
  saveMeta(params.userId, meta);

  return file;
}

/**
 * 直接保存 Buffer 内容到用户文件柜
 * 用于上传文件、代码生成结果等
 */
export function saveFileBuffer(params: {
  userId: string;
  content: Buffer;
  displayName: string;
  ext: string;             // 文件扩展名，如 '.pptx' '.png'
  type: UserFileType;
  mimeType?: string;
  source: 'generated' | 'uploaded';
  toolName?: string;
}): UserFile {
  ensureDir(params.userId);

  const filename = `${uuidv4().slice(0, 8)}${params.ext}`;
  const filePath = path.join(userFilesDir(params.userId), filename);
  fs.writeFileSync(filePath, params.content);

  const file: UserFile = {
    id: uuidv4(),
    userId: params.userId,
    filename,
    displayName: params.displayName,
    type: params.type,
    mimeType: params.mimeType,
    sizeBytes: params.content.length,
    source: params.source,
    toolName: params.toolName,
    downloadPath: `/api/lobster/files/${params.userId}/${filename}`,
    createdAt: new Date().toISOString(),
  };

  const meta = loadMeta(params.userId);
  meta.unshift(file);
  saveMeta(params.userId, meta);

  return file;
}

/** 列出用户所有文件，最新在前 */
export function listUserFiles(userId: string): UserFile[] {
  return loadMeta(userId);
}

/** 获取单个文件元数据 */
export function getUserFile(userId: string, fileId: string): UserFile | null {
  return loadMeta(userId).find((f) => f.id === fileId || f.filename === fileId) ?? null;
}

/** 删除文件（元数据 + 磁盘） */
export function deleteUserFile(userId: string, fileId: string): boolean {
  const meta = loadMeta(userId);
  const idx = meta.findIndex((f) => f.id === fileId || f.filename === fileId);
  if (idx === -1) return false;

  const file = meta[idx];
  const filePath = path.join(userFilesDir(userId), file.filename);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* ignore */ }

  meta.splice(idx, 1);
  saveMeta(userId, meta);
  return true;
}

/** 获取文件的磁盘绝对路径 */
export function getUserFilePath(userId: string, filename: string): string | null {
  const filePath = path.join(userFilesDir(userId), filename);
  // 防目录穿越
  if (!filePath.startsWith(userFilesDir(userId))) return null;
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/** 文件大小格式化 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 文件类型 emoji */
export function fileTypeEmoji(type: UserFileType): string {
  const map: Record<UserFileType, string> = {
    ppt: '📊',
    pdf: '📄',
    image: '🖼️',
    document: '📝',
    data: '📈',
    note: '🗒️',
    other: '📎',
  };
  return map[type] ?? '📎';
}
