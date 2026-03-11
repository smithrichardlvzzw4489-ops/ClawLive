import TelegramBot from 'node-telegram-bot-api';

export interface TelegramMessage {
  id: number;
  from: {
    id: number;
    username?: string;
    isBot: boolean;
  };
  text: string;
  date: number;
}

export interface TelegramBridgeConfig {
  token: string;
  chatId?: string;
  onMessage: (message: TelegramMessage) => Promise<void>;
  onError?: (error: Error) => void;
}

export class TelegramBridge {
  private bot: TelegramBot;
  private config: TelegramBridgeConfig;
  private isPolling = false;

  constructor(config: TelegramBridgeConfig) {
    this.config = config;
    this.bot = new TelegramBot(config.token, { polling: false });
  }

  async startPolling(): Promise<void> {
    if (this.isPolling) {
      console.warn('Telegram bot is already polling');
      return;
    }

    this.bot.startPolling();
    this.isPolling = true;

    this.bot.on('message', async (msg) => {
      if (this.config.chatId && msg.chat.id.toString() !== this.config.chatId) {
        return;
      }

      try {
        await this.config.onMessage({
          id: msg.message_id,
          from: {
            id: msg.from?.id || 0,
            username: msg.from?.username,
            isBot: msg.from?.is_bot || false,
          },
          text: msg.text || '',
          date: msg.date,
        });
      } catch (error) {
        if (this.config.onError) {
          this.config.onError(error as Error);
        } else {
          console.error('Error processing Telegram message:', error);
        }
      }
    });

    this.bot.on('polling_error', (error) => {
      if (this.config.onError) {
        this.config.onError(error);
      } else {
        console.error('Telegram polling error:', error);
      }
    });
  }

  async stopPolling(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    await this.bot.stopPolling();
    this.isPolling = false;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.config.chatId) {
      throw new Error('Chat ID not configured');
    }

    await this.bot.sendMessage(this.config.chatId, text);
  }
}
