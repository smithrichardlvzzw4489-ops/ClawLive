/**
 * Telegram MTProto Service
 * 用户身份登录，以真实用户身份发送消息（不是 Bot）
 * 简化版：全 UI 操作，无需命令行
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { NewMessage } from 'telegram/events';

// 懒加载环境变量（在实际使用时读取，而不是在 import 时）
function getApiCredentials() {
  const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
  const API_HASH = process.env.TELEGRAM_API_HASH || '';
  return { API_ID, API_HASH };
}

interface MTProtoSession {
  phoneNumber: string;
  sessionString: string;
  client: TelegramClient | null;
}

interface LoginState {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash?: string;
  passwordHint?: string;
}

/**
 * MTProto 用户会话管理（简化版）
 */
export class MTProtoUserService {
  private sessions: Map<string, MTProtoSession> = new Map();
  private loginStates: Map<string, LoginState> = new Map(); // 登录中间状态
  private ioInstance: any = null; // Socket.io 实例
  
  /**
   * 设置 Socket.io 实例（用于推送 Agent 回复）
   */
  setSocketIO(io: any) {
    this.ioInstance = io;
    console.log('📡 Socket.io instance set for MTProto service');
  }

  /**
   * 第一步：发送验证码到手机
   */
  async startLogin(roomId: string, phoneNumber: string): Promise<{ success: boolean; needsCode?: boolean; needsPassword?: boolean; passwordHint?: string; error?: string }> {
    try {
      console.log(`📱 Starting Telegram login for room ${roomId}, phone: ${phoneNumber}`);

      // 懒加载环境变量
      const { API_ID, API_HASH } = getApiCredentials();

      // 检查配置
      if (!API_ID || !API_HASH || API_ID === 0) {
        return {
          success: false,
          error: 'Telegram API credentials not configured'
        };
      }

      // 创建新会话
      const stringSession = new StringSession('');
      const client = new TelegramClient(stringSession, API_ID, API_HASH, {
        connectionRetries: 3,
      });

      await client.connect();

      // 发送验证码
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phoneNumber,
          apiId: API_ID,
          apiHash: API_HASH,
          settings: new Api.CodeSettings({}),
        })
      );

      // 保存登录状态
      this.loginStates.set(roomId, {
        client,
        phoneNumber,
        phoneCodeHash: (result as any).phoneCodeHash,
      });

      console.log(`✅ Verification code sent to ${phoneNumber}`);
      return { success: true, needsCode: true };

    } catch (error: any) {
      console.error(`❌ Failed to send verification code:`, error);
      return {
        success: false,
        error: error.message || 'Failed to send code',
      };
    }
  }

  /**
   * 第二步：提交验证码完成登录
   */
  async submitCode(roomId: string, code: string): Promise<{ success: boolean; needsPassword?: boolean; passwordHint?: string; sessionString?: string; error?: string }> {
    try {
      const state = this.loginStates.get(roomId);
      if (!state) {
        return { success: false, error: 'Login session not found. Please start login again.' };
      }

      console.log(`📝 Submitting verification code for room ${roomId}`);

      // 提交验证码
      try {
        const result = await state.client.invoke(
          new Api.auth.SignIn({
            phoneNumber: state.phoneNumber,
            phoneCodeHash: state.phoneCodeHash!,
            phoneCode: code,
          })
        );

        // 登录成功
        const sessionString = state.client.session.save() as unknown as string;

        // 确保客户端已连接
        if (!state.client.connected) {
          await state.client.connect();
        }

        // 保存会话
        this.sessions.set(roomId, {
          phoneNumber: state.phoneNumber,
          sessionString,
          client: state.client,
        });

        // 清理登录状态
        this.loginStates.delete(roomId);

        // 开始监听新消息
        this.startListeningForMessages(roomId, state.client);

        console.log(`✅ Login successful for room ${roomId}`);
        console.log(`🔗 Client connected: ${state.client.connected}`);
        return { success: true, sessionString };

      } catch (error: any) {
        // 检查是否需要两步验证密码
        if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
          // 获取密码提示
          const passwordInfo = await state.client.invoke(new Api.account.GetPassword());
          const hint = passwordInfo.hint || 'No hint';

          console.log(`🔐 Two-factor authentication required, hint: ${hint}`);
          return {
            success: false,
            needsPassword: true,
            passwordHint: hint,
          };
        }
        throw error;
      }

    } catch (error: any) {
      console.error(`❌ Failed to submit code:`, error);
      return {
        success: false,
        error: error.message || 'Invalid code',
      };
    }
  }

  /**
   * 第三步（可选）：如果有两步验证，提交密码
   */
  async submitPassword(roomId: string, password: string): Promise<{ success: boolean; sessionString?: string; error?: string }> {
    try {
      const state = this.loginStates.get(roomId);
      if (!state) {
        return { success: false, error: 'Login session not found' };
      }

      console.log(`🔐 Submitting 2FA password for room ${roomId}`);

      // 获取密码信息
      const passwordInfo = await state.client.invoke(new Api.account.GetPassword());

      // 使用密码登录（Telegram 库会自动处理密码哈希）
      const { computeCheck } = await import('telegram/Password');
      const passwordHash = await computeCheck(passwordInfo, password);
      
      const result = await state.client.invoke(
        new Api.auth.CheckPassword({
          password: passwordHash,
        })
      );

      // 登录成功
      const sessionString = state.client.session.save() as unknown as string;

      // 确保客户端已连接
      if (!state.client.connected) {
        await state.client.connect();
      }

      // 保存会话
      this.sessions.set(roomId, {
        phoneNumber: state.phoneNumber,
        sessionString,
        client: state.client,
      });

      // 清理登录状态
      this.loginStates.delete(roomId);

      // 开始监听新消息
      this.startListeningForMessages(roomId, state.client);

      console.log(`✅ 2FA login successful for room ${roomId}`);
      console.log(`🔗 Client connected: ${state.client.connected}`);
      return { success: true, sessionString };

    } catch (error: any) {
      console.error(`❌ Failed to submit password:`, error);
      return {
        success: false,
        error: error.message || 'Invalid password',
      };
    }
  }

  /**
   * 使用已有的 session 字符串恢复登录
   */
  async restoreSession(roomId: string, sessionString: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 Restoring Telegram session for room ${roomId}`);

      // 懒加载环境变量
      const { API_ID, API_HASH } = getApiCredentials();

      if (!API_ID || !API_HASH || API_ID === 0) {
        return {
          success: false,
          error: 'Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env'
        };
      }

      const stringSession = new StringSession(sessionString);
      const client = new TelegramClient(stringSession, API_ID, API_HASH, {
        connectionRetries: 3,
      });

      await client.connect();

      this.sessions.set(roomId, {
        phoneNumber: 'restored',
        sessionString,
        client,
      });

      // 开始监听新消息
      this.startListeningForMessages(roomId, client);

      console.log(`✅ Session restored for room ${roomId}`);
      return { success: true };

    } catch (error: any) {
      console.error(`❌ Session restore error for room ${roomId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to restore session',
      };
    }
  }

  /**
   * 以用户身份发送消息到 Telegram 聊天
   */
  async sendAsUser(roomId: string, chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔍 Checking session for room ${roomId}...`);
      console.log(`📊 Total sessions: ${this.sessions.size}`);
      console.log(`📊 Session keys:`, Array.from(this.sessions.keys()));
      
      const session = this.sessions.get(roomId);
      console.log(`📊 Session found:`, !!session);
      console.log(`📊 Client exists:`, !!session?.client);
      
      if (!session || !session.client) {
        return {
          success: false,
          error: 'No active session. Please login first.',
        };
      }

      // 确保客户端已连接
      if (!session.client.connected) {
        console.log(`🔗 Reconnecting client for room ${roomId}...`);
        await session.client.connect();
      }

      console.log(`📤 Sending message as user in room ${roomId} to chat ${chatId}`);

      // 解析 chatId（可能是用户名或 ID）
      let entity;
      if (chatId.startsWith('@')) {
        entity = chatId;
      } else if (chatId.startsWith('-')) {
        // 群组/频道 ID
        entity = Number(chatId);
      } else {
        // 私聊用户 ID
        entity = Number(chatId);
      }

      // 发送消息
      await session.client.sendMessage(entity, { message });

      console.log(`✅ Message sent as user successfully`);
      return { success: true };

    } catch (error: any) {
      console.error(`❌ Failed to send message as user:`, error);
      return {
        success: false,
        error: error.message || 'Failed to send message',
      };
    }
  }

  /**
   * 以用户身份发送消息（简化版，直接调用sendAsUser）
   */
  async sendMessageAsUser(roomId: string, chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
    return this.sendAsUser(roomId, chatId, message);
  }

  /**
   * 断开用户会话
   */
  async disconnect(roomId: string): Promise<void> {
    const session = this.sessions.get(roomId);
    if (session && session.client) {
      await session.client.disconnect();
      this.sessions.delete(roomId);
      console.log(`🔌 Disconnected MTProto session for room ${roomId}`);
    }
  }

  /**
   * 获取会话状态
   */
  getSession(roomId: string): MTProtoSession | undefined {
    return this.sessions.get(roomId);
  }

  /**
   * 登出并清除会话（用于结束直播时清理）
   */
  async logout(roomId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🚪 Logging out room ${roomId}`);
      
      const session = this.sessions.get(roomId);
      const loginState = this.loginStates.get(roomId);
      
      // Disconnect and destroy client
      if (session?.client) {
        try {
          await session.client.disconnect();
          await session.client.destroy();
          console.log(`✅ Client disconnected for room ${roomId}`);
        } catch (error) {
          console.error(`⚠️  Error disconnecting client:`, error);
        }
      }
      
      if (loginState?.client) {
        try {
          await loginState.client.disconnect();
          await loginState.client.destroy();
          console.log(`✅ Login state client disconnected for room ${roomId}`);
        } catch (error) {
          console.error(`⚠️  Error disconnecting login state client:`, error);
        }
      }
      
      // Clear from memory
      this.sessions.delete(roomId);
      this.loginStates.delete(roomId);
      
      console.log(`✅ Session cleared for room ${roomId}`);
      return { success: true };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Logout failed for room ${roomId}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 开始监听 Telegram 新消息（Agent 回复）
   * 只监听来自指定 Chat ID 的消息
   */
  private async startListeningForMessages(roomId: string, client: TelegramClient) {
    console.log(`👂 Starting to listen for messages in room ${roomId}`);

    // 获取当前房间/作品的 Agent Chat ID
    const getAgentChatId = () => {
      // Check if this is a work or a room
      if (roomId.startsWith('work-')) {
        const { workAgentConfigs } = require('../api/routes/work-agent-config');
        const config = workAgentConfigs.get(roomId);
        return config?.agentChatId;
      } else {
        const { agentConfigs } = require('../api/routes/rooms-simple');
        const config = agentConfigs.get(roomId);
        return config?.agentChatId;
      }
    };

    // 监听新消息事件
    client.addEventHandler(async (event: any) => {
      try {
        const message = event.message;
        if (!message) return;

        const text = message.message || message.text || '';
        if (!text) return;

        // 获取发送者信息
        const chat = await message.getChat();
        const chatId = chat?.id?.toString() || '';
        const chatUsername = chat?.username ? `@${chat.username}` : '';
        const senderId = message.senderId?.toString() || '';
        
        console.log(`📨 Received Telegram message:`);
        console.log(`  - Text: ${text.substring(0, 50)}`);
        console.log(`  - Chat ID: ${chatId}`);
        console.log(`  - Chat Username: ${chatUsername}`);
        console.log(`  - Sender ID: ${senderId}`);

        // 获取配置的 Agent Chat ID
        const agentChatId = getAgentChatId();
        if (!agentChatId) {
          console.log(`⚠️  No Agent Chat ID configured for room ${roomId}`);
          return;
        }

        // 过滤：只接收来自指定 Agent 的消息
        const isFromAgent = 
          chatId === agentChatId || 
          chatUsername === agentChatId || 
          senderId === agentChatId ||
          chatId === agentChatId.replace('@', '') ||
          senderId === agentChatId.replace('@', '');

        if (!isFromAgent) {
          console.log(`⏭️  Skipping message from ${chatUsername || chatId} (not from Agent ${agentChatId})`);
          return;
        }

        const messageDate = message.date ? new Date(message.date * 1000) : new Date();
        
        // 只处理最近 60 秒的消息（避免旧消息）
        const messageAge = Date.now() - messageDate.getTime();
        if (messageAge > 60000) {
          console.log(`⏭️  Skipping old message (age: ${Math.floor(messageAge / 1000)}s)`);
          return;
        }

        console.log(`✅ Message from Agent! Pushing to ClawLive...`);

        // 推送到 ClawLive 直播间或作品工作室
        if (this.ioInstance && text) {
          const agentMessage = {
            id: Date.now().toString(),
            roomId,
            sender: 'agent' as const,
            content: text,
            timestamp: messageDate,
          };

          // Check if this is a work or a room
          if (roomId.startsWith('work-')) {
            // Save to work messages
            const { workMessages } = require('../api/routes/rooms-simple');
            const messages = workMessages.get(roomId) || [];
            messages.push(agentMessage);
            workMessages.set(roomId, messages);

            this.ioInstance.to(roomId).emit('work-message', agentMessage);
            console.log(`✅ Agent reply pushed to work ${roomId}`);
          } else {
            // Save to room message history
            const { messageHistory } = require('../api/routes/rooms-simple');
            const history = messageHistory.get(roomId) || [];
            history.push(agentMessage);
            // Keep only last 100 messages to prevent memory issues
            if (history.length > 100) {
              history.shift();
            }
            messageHistory.set(roomId, history);

            this.ioInstance.to(roomId).emit('new-message', agentMessage);
            console.log(`✅ Agent reply pushed to ClawLive room ${roomId}`);
          }
        }

      } catch (error) {
        console.error(`❌ Error handling Telegram message:`, error);
      }
    }, new NewMessage({}));

    console.log(`✅ Message listener started for room ${roomId}`);
  }
}

// 全局单例
export const mtprotoService = new MTProtoUserService();
