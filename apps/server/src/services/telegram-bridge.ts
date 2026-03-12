import crypto from 'crypto';
import { Server } from 'socket.io';

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
  };
  chat: {
    id: number;
  };
  date: number;
  text?: string;
  photo?: Array<{
    file_id: string;
    file_size: number;
  }>;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export class TelegramBridgeService {
  private botToken: string;
  private chatId: string;
  private roomId: string;
  private webhookSecret: string;
  private io: Server;
  private lastUpdateId: number = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private botUserId: number | null = null;
  private isPollingActive: boolean = false;
  
  constructor(
    botToken: string,
    chatId: string,
    roomId: string,
    webhookSecret: string,
    io: Server
  ) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.roomId = roomId;
    this.webhookSecret = webhookSecret;
    this.io = io;
  }
  
  /**
   * Get Bot's own user ID to filter out its messages
   */
  private async getBotInfo(): Promise<{ id: number; first_name: string } | null> {
    if (this.botUserId !== null) {
      return { id: this.botUserId, first_name: 'Bot' };
    }
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`);
      const data: any = await response.json();
      if (data.ok) {
        this.botUserId = data.result.id;
        console.log(`🤖 Bot ID: ${this.botUserId}, Username: @${data.result.username}`);
        return data.result;
      }
    } catch (error) {
      console.error('Failed to get bot info:', error);
    }
    return null;
  }
  
  /**
   * Start the bridge: listen for host messages and poll Telegram
   */
  async start(): Promise<void> {
    console.log(`🦞 Starting Telegram bridge for room ${this.roomId}`);
    
    // Delete webhook first (webhook conflicts with long polling)
    await this.deleteWebhook();
    
    // Start polling for Agent responses
    this.startPolling();
    
    console.log(`✅ Telegram bridge started for room ${this.roomId}`);
  }
  
  /**
   * Delete webhook to enable long polling
   */
  private async deleteWebhook(): Promise<void> {
    try {
      console.log(`🗑️  Deleting webhook...`);
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/deleteWebhook`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (data.ok) {
        console.log(`✅ Webhook deleted successfully`);
      } else {
        console.log(`⚠️  Webhook delete result:`, data.description);
      }
    } catch (error) {
      console.error(`❌ Failed to delete webhook:`, error);
    }
  }
  
  /**
   * Stop the bridge
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    console.log(`🛑 Telegram bridge stopped for room ${this.roomId}`);
  }
  
  /**
   * Send a message to Telegram Bot (from host)
   * Adds [主播] prefix to indicate it's from the host
   */
  async sendToTelegram(text: string): Promise<boolean> {
    try {
      // Add host identifier prefix
      const messageWithPrefix = `🎙️ [主播]: ${text}`;
      console.log(`📤 Sending to Telegram: "${messageWithPrefix}"`);
      
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: messageWithPrefix,
          }),
        }
      );
      
      const data = await response.json();
      
      if (data.ok) {
        console.log(`✅ Sent to Telegram successfully`);
        return true;
      } else {
        console.error(`❌ Telegram API error:`, data.description);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to send to Telegram:`, error);
      return false;
    }
  }
  
  /**
   * Start polling for Telegram updates
   */
  private startPolling(): void {
    if (this.isPolling) {
      console.log(`⚠️  Already polling for room ${this.roomId}`);
      return;
    }
    
    console.log(`🔄 Starting Telegram polling for room ${this.roomId}`);
    this.isPolling = true;
    
    // Initial poll
    console.log(`📡 Initial poll starting...`);
    this.pollUpdates();
    
    // Poll every 1 second
    this.pollingInterval = setInterval(() => {
      this.pollUpdates();
    }, 1000);
    
    console.log(`✅ Polling interval set (every 1s)`);
  }
  
  /**
   * Poll Telegram for new messages (FIXED: prevent concurrent polling)
   */
  private async pollUpdates(): Promise<void> {
    if (!this.isPolling || this.isPollingActive) return;
    
    this.isPollingActive = true;
    
    try {
      console.log(`🔍 Polling Telegram (offset: ${this.lastUpdateId + 1})...`);
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=1&limit=10`
      );
      
      if (!response.ok) {
        console.error(`❌ Telegram API returned ${response.status}`);
        this.isPollingActive = false;
        return;
      }
      
      const data: { ok: boolean; result: TelegramUpdate[] } = await response.json();
      
      if (data.ok) {
        if (data.result.length > 0) {
          console.log(`📬 Received ${data.result.length} updates from Telegram`);
          for (const update of data.result) {
            this.lastUpdateId = update.update_id;
            
            if (update.message) {
              console.log(`📩 Processing message from ${update.message.from?.first_name} (ID: ${update.message.from.id}): "${update.message.text}"`);
              await this.handleTelegramMessage(update.message);
            }
          }
        } else {
          console.log(`✓ No new messages (polling working)`);
        }
      } else {
        console.error(`❌ Telegram API error:`, data);
      }
    } catch (error) {
      console.error(`⚠️  Telegram polling error:`, error instanceof Error ? error.message : error);
    } finally {
      this.isPollingActive = false;
    }
  }
  
  /**
   * Handle incoming message from Telegram (Agent response)
   */
  private async handleTelegramMessage(message: TelegramMessage): Promise<void> {
    // CRITICAL: Ignore messages from the Bot itself (only accept messages from Agent/users)
    const botInfo = await this.getBotInfo();
    if (botInfo && message.from.id === botInfo.id) {
      console.log(`⏭️  Skipping message from Bot itself (ID: ${message.from.id})`);
      return;
    }
    
    // Check message age
    const messageAge = Date.now() / 1000 - message.date;
    console.log(`⏰ Message from ${message.from?.first_name} (ID: ${message.from.id}), age: ${messageAge.toFixed(1)}s`);
    
    // Ignore old messages (older than 60 seconds to capture replies)
    if (messageAge > 60) {
      console.log(`⏭️  Skipping old message (${messageAge.toFixed(1)}s old)`);
      return;
    }
    
    // Handle text messages
    if (message.text) {
      console.log(`📨 ✅ Agent response received: "${message.text}"`);
      await this.pushToClawLive({
        sender: 'agent',
        content: message.text,
        timestamp: new Date(message.date * 1000).toISOString(),
        metadata: {
          model: 'openclaw-telegram',
          telegram_message_id: message.message_id,
          agent_name: message.from?.first_name,
        },
      });
    }
    
    // Handle photos
    if (message.photo && message.photo.length > 0) {
      console.log(`📷 Received photo from Telegram`);
      await this.handleTelegramPhoto(message);
    }
  }
  
  /**
   * Handle photo from Telegram
   */
  private async handleTelegramPhoto(message: TelegramMessage): Promise<void> {
    try {
      if (!message.photo || message.photo.length === 0) return;
      
      // Get the largest photo
      const photo = message.photo[message.photo.length - 1];
      
      // Get file path
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${photo.file_id}`
      );
      const fileData: any = await fileResponse.json();
      
      if (fileData.ok) {
        const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileData.result.file_path}`;
        
        // Download image
        const imageResponse = await fetch(fileUrl);
        const buffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        
        // Push to ClawLive
        await this.pushScreenshot({
          imageBase64: `data:image/jpeg;base64,${base64}`,
          caption: message.text || 'Screenshot from OpenClaw',
        });
        
        console.log(`✅ Photo pushed to ClawLive`);
      }
    } catch (error) {
      console.error(`❌ Failed to handle photo:`, error);
    }
  }
  
  /**
   * Push message to ClawLive via webhook
   */
  private async pushToClawLive(messageData: any): Promise<void> {
    try {
      const payload = messageData;
      const payloadStr = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payloadStr)
        .digest('hex');
      
      const response = await fetch(
        `http://localhost:3001/api/webhooks/openclaw/${this.roomId}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body: payloadStr,
        }
      );
      
      if (response.ok) {
        console.log(`✅ Pushed to ClawLive`);
      } else {
        const error = await response.text();
        console.error(`❌ ClawLive webhook failed:`, error);
      }
    } catch (error) {
      console.error(`❌ Failed to push to ClawLive:`, error);
    }
  }
  
  /**
   * Push screenshot to ClawLive
   */
  private async pushScreenshot(screenshotData: any): Promise<void> {
    try {
      const payload = screenshotData;
      const payloadStr = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payloadStr)
        .digest('hex');
      
      await fetch(
        `http://localhost:3001/api/webhooks/openclaw/${this.roomId}/screenshot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body: payloadStr,
        }
      );
    } catch (error) {
      console.error(`❌ Failed to push screenshot:`, error);
    }
  }
  
  /**
   * Test Telegram connection
   */
  static async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Test bot token
      const botResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getMe`
      );
      const botData = await botResponse.json();
      
      if (!botData.ok) {
        return { success: false, error: 'Invalid Bot Token' };
      }
      
      // Test chat access
      const chatResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`
      );
      const chatData = await chatResponse.json();
      
      if (!chatData.ok) {
        return { success: false, error: 'Invalid Chat ID or bot not authorized' };
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
  
  /**
   * Auto-get Chat ID from recent messages
   */
  static async getChatId(botToken: string): Promise<{ chatId?: string; error?: string }> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=1`
      );
      const data: any = await response.json();
      
      if (data.ok && data.result.length > 0) {
        const chatId = data.result[0].message?.chat?.id;
        if (chatId) {
          return { chatId: chatId.toString() };
        }
      }
      
      return { error: 'No recent messages found. Please send a message to your bot first.' };
    } catch (error) {
      return { error: 'Network error' };
    }
  }
}

// Global bridge manager
class BridgeManager {
  private bridges: Map<string, TelegramBridgeService> = new Map();
  
  startBridge(
    roomId: string,
    botToken: string,
    chatId: string,
    webhookSecret: string,
    io: Server
  ): void {
    // Stop existing bridge if any
    this.stopBridge(roomId);
    
    const bridge = new TelegramBridgeService(
      botToken,
      chatId,
      roomId,
      webhookSecret,
      io
    );
    
    bridge.start();
    this.bridges.set(roomId, bridge);
  }
  
  stopBridge(roomId: string): void {
    const bridge = this.bridges.get(roomId);
    if (bridge) {
      bridge.stop();
      this.bridges.delete(roomId);
    }
  }
  
  getBridge(roomId: string): TelegramBridgeService | undefined {
    return this.bridges.get(roomId);
  }
}

export const bridgeManager = new BridgeManager();
