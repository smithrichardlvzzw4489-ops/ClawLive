/**
 * 虾米 — 定时任务持久化
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { getDataFilePath } from '../lib/data-path';

export interface LobsterSchedule {
  id: string;
  userId: string;
  cronExpr: string;      // cron 表达式，如 "0 8 * * *"
  description: string;   // 人类可读描述，如 "每天早上8点"
  task: string;          // 要执行的任务描述
  createdAt: string;
  lastRunAt?: string;
  enabled: boolean;
}

const SCHEDULES_FILE = getDataFilePath('lobster-schedules.json');

let _schedules: LobsterSchedule[] = [];
let _loaded = false;

function ensureDir() {
  const dir = dirname(SCHEDULES_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadSchedules(): LobsterSchedule[] {
  if (_loaded) return _schedules;
  if (!existsSync(SCHEDULES_FILE)) { _loaded = true; return []; }
  try {
    _schedules = JSON.parse(readFileSync(SCHEDULES_FILE, 'utf-8')) as LobsterSchedule[];
    _loaded = true;
    return _schedules;
  } catch {
    _loaded = true;
    return [];
  }
}

async function save() {
  ensureDir();
  await writeFile(SCHEDULES_FILE, JSON.stringify(_schedules, null, 2), 'utf-8');
}

export function getUserSchedules(userId: string): LobsterSchedule[] {
  return loadSchedules().filter((s) => s.userId === userId);
}

export async function addSchedule(s: LobsterSchedule): Promise<void> {
  loadSchedules();
  _schedules.push(s);
  await save();
}

export async function removeSchedule(id: string, userId: string): Promise<boolean> {
  loadSchedules();
  const before = _schedules.length;
  _schedules = _schedules.filter((s) => !(s.id === id && s.userId === userId));
  if (_schedules.length < before) { await save(); return true; }
  return false;
}

export async function updateScheduleLastRun(id: string): Promise<void> {
  loadSchedules();
  const s = _schedules.find((s) => s.id === id);
  if (s) { s.lastRunAt = new Date().toISOString(); await save(); }
}
