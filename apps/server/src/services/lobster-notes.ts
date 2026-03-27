/**
 * 虾仔 — 用户笔记存储（文件读写工具后端）
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile, readdir } from 'fs/promises';
import * as path from 'path';
import { DATA_DIR } from '../lib/data-path';

function notesDir(userId: string): string {
  return path.join(DATA_DIR, 'lobster-notes', userId);
}

function safeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '_').slice(0, 60) + '.md';
}

export async function saveNote(userId: string, title: string, content: string): Promise<string> {
  const dir = notesDir(userId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = safeFilename(title);
  const filepath = path.join(dir, filename);
  const full = `# ${title}\n\n_保存于 ${new Date().toLocaleString('zh-CN')}_\n\n${content}`;
  await writeFile(filepath, full, 'utf-8');
  return filename;
}

export async function listNotes(userId: string): Promise<Array<{ filename: string; title: string }>> {
  const dir = notesDir(userId);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      filename: f,
      title: f.replace(/_/g, ' ').replace(/\.md$/, ''),
    }));
}

export function readNote(userId: string, filename: string): string | null {
  const filepath = path.join(notesDir(userId), filename);
  // 防目录穿越
  if (!filepath.startsWith(notesDir(userId))) return null;
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, 'utf-8');
}
