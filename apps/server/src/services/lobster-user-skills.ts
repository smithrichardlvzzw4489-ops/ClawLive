/**
 * 虾仔 — 用户级 Skill 安装（每位用户独立的技能扩展）
 *
 * 存储位置：DATA_DIR/lobster-user-skills/<userId>/skills.json
 * 每个用户可以安装平台 Skills 市场中的技能，也可以保存从网络上学习到的技能。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../lib/data-path';

export interface UserInstalledSkill {
  skillId: string;
  title: string;
  description: string;
  skillMarkdown: string;
  source: 'platform' | 'web-learned'; // 来源：平台市场 或 网络学习
  installedAt: string;
}

function userSkillsDir(userId: string): string {
  return path.join(DATA_DIR, 'lobster-user-skills', userId);
}

function userSkillsFile(userId: string): string {
  return path.join(userSkillsDir(userId), 'skills.json');
}

function loadRaw(userId: string): Record<string, UserInstalledSkill> {
  const file = userSkillsFile(userId);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

function saveRaw(userId: string, data: Record<string, UserInstalledSkill>): void {
  const dir = userSkillsDir(userId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(userSkillsFile(userId), JSON.stringify(data, null, 2), 'utf-8');
}

/** 获取用户已安装的所有技能 */
export function getUserInstalledSkills(userId: string): UserInstalledSkill[] {
  return Object.values(loadRaw(userId));
}

/** 安装一个技能到用户实例 */
export function installSkillForUser(
  userId: string,
  skill: Omit<UserInstalledSkill, 'installedAt'>,
): void {
  const data = loadRaw(userId);
  data[skill.skillId] = {
    ...skill,
    installedAt: new Date().toISOString(),
  };
  saveRaw(userId, data);
}

/** 卸载用户已安装的技能 */
export function uninstallSkillForUser(userId: string, skillId: string): boolean {
  const data = loadRaw(userId);
  if (!data[skillId]) return false;
  delete data[skillId];
  saveRaw(userId, data);
  return true;
}

/** 检查用户是否已安装某技能 */
export function isSkillInstalled(userId: string, skillId: string): boolean {
  return Boolean(loadRaw(userId)[skillId]);
}
