/**
 * 直播间 Agent 配置持久化（永久保存、可复用）
 * - 保存后，每次登录/开播无需重新建立连接
 * - 退出登录、结束直播、服务重启等任何情况下均不删除，永久保留
 * - 与 user-agent-connections 配合，支持「一次配置、多处复用」
 */

import * as fs from 'fs';
import { mtprotoService } from './telegram-mtproto';
import { DATA_DIR, getDataFilePath } from '../lib/data-path';

const CONFIG_FILE = getDataFilePath('room-agent-configs.json');

export interface PersistedRoomAgentConfig {
  roomId: string;
  agentType: 'telegram' | 'telegram-user';
  agentEnabled: boolean;
  agentChatId: string;
  agentBotToken?: string;
  mtprotoSessionString?: string;
  mtprotoPhone?: string;
  savedAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class RoomAgentConfigPersistence {
  static saveConfig(roomId: string, config: Omit<PersistedRoomAgentConfig, 'roomId' | 'savedAt'>): void {
    try {
      ensureDataDir();
      let configs: Record<string, PersistedRoomAgentConfig> = {};
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        configs = JSON.parse(data);
      }
      configs[roomId] = {
        ...config,
        roomId,
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
      console.log(`💾 [RoomAgent] Saved config for room ${roomId}`);
    } catch (error) {
      console.error(`❌ [RoomAgent] Failed to save config for room ${roomId}:`, error);
    }
  }

  static loadConfig(roomId: string): PersistedRoomAgentConfig | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return null;
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const configs = JSON.parse(data);
      return configs[roomId] || null;
    } catch (error) {
      console.error(`❌ [RoomAgent] Failed to load config for room ${roomId}:`, error);
      return null;
    }
  }

  static deleteConfig(roomId: string): void {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return;
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const configs = JSON.parse(data);
      delete configs[roomId];
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
      console.log(`🗑️ [RoomAgent] Deleted config for room ${roomId}`);
    } catch (error) {
      console.error(`❌ [RoomAgent] Failed to delete config for room ${roomId}:`, error);
    }
  }

  /**
   * 从持久化恢复配置到内存（服务重启后调用）
   * @param agentConfigsRef 内存中的 agentConfigs Map，由调用方传入避免循环依赖
   */
  static async restoreToMemory(
    roomId: string,
    agentConfigsRef: Map<string, Record<string, unknown>>
  ): Promise<boolean> {
    const persisted = this.loadConfig(roomId);
    if (!persisted || !persisted.agentEnabled) return false;

    if (persisted.agentType === 'telegram' && persisted.agentBotToken) {
      agentConfigsRef.set(roomId, {
        agentType: 'telegram',
        agentEnabled: true,
        agentBotToken: persisted.agentBotToken,
        agentChatId: persisted.agentChatId,
        agentStatus: 'connected',
      });
      return true;
    }
    if (persisted.agentType === 'telegram-user' && persisted.mtprotoSessionString) {
      const result = await mtprotoService.restoreSession(roomId, persisted.mtprotoSessionString);
      if (!result.success) return false;
      agentConfigsRef.set(roomId, {
        agentType: 'telegram-user',
        agentEnabled: true,
        agentChatId: persisted.agentChatId,
        agentStatus: 'connected',
        mtprotoSessionString: persisted.mtprotoSessionString,
        mtprotoPhone: persisted.mtprotoPhone,
      });
      return true;
    }
    return false;
  }
}
