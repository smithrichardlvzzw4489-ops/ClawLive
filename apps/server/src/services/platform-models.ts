/**
 * 平台可用模型配置
 * 存储管理员在前端配置的模型列表，供虾壳小龙虾等服务使用。
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { getDataFilePath } from '../lib/data-path';

export interface PlatformModel {
  id: string;       // 模型 ID，例如 openai/gpt-4o-mini
  name: string;     // 显示名称，例如 GPT-4o mini
  enabled: boolean;
}

export interface PlatformModelsConfig {
  models: PlatformModel[];
  updatedAt: string;
}

const CONFIG_FILE = getDataFilePath('platform-models.json');

/** 内置默认模型列表（未配置时显示） */
const DEFAULT_MODELS: PlatformModel[] = [
  { id: 'deepseek/deepseek-chat',          name: 'DeepSeek V3',          enabled: true  },
  { id: 'deepseek/deepseek-r1',            name: 'DeepSeek R1',          enabled: false },
  { id: 'openai/gpt-4o-mini',              name: 'GPT-4o mini',          enabled: false },
  { id: 'openai/gpt-4o',                   name: 'GPT-4o',               enabled: false },
  { id: 'google/gemini-flash-1.5',         name: 'Gemini Flash 1.5',     enabled: false },
  { id: 'google/gemini-2.0-flash-001',     name: 'Gemini 2.0 Flash',     enabled: false },
  { id: 'anthropic/claude-3-5-haiku',      name: 'Claude 3.5 Haiku',     enabled: false },
  { id: 'anthropic/claude-3-7-sonnet',     name: 'Claude 3.7 Sonnet',    enabled: false },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B',     enabled: false },
  { id: 'qwen/qwen-2.5-72b-instruct',      name: 'Qwen 2.5 72B',         enabled: false },
];

function ensureDir(file: string) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadPlatformModels(): PlatformModelsConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { models: DEFAULT_MODELS, updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as PlatformModelsConfig;
  } catch {
    return { models: DEFAULT_MODELS, updatedAt: new Date().toISOString() };
  }
}

export async function savePlatformModels(models: PlatformModel[]): Promise<void> {
  ensureDir(CONFIG_FILE);
  const config: PlatformModelsConfig = { models, updatedAt: new Date().toISOString() };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** 获取第一个 enabled 的模型 ID，用于小龙虾默认模型 */
export function getDefaultPlatformModel(): string | null {
  const { models } = loadPlatformModels();
  return models.find((m) => m.enabled)?.id ?? null;
}
