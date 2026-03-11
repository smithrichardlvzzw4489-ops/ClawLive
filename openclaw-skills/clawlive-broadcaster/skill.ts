import crypto from 'crypto';

interface SkillConfig {
  webhookUrl: string;
  roomId: string;
  webhookSecret: string;
  captureScreenshots: boolean;
  screenshotInterval: number;
}

interface Message {
  from: 'user' | 'agent';
  text: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
  };
}

interface AgentAction {
  action: string;
  status: 'pending' | 'success' | 'error';
  details?: Record<string, any>;
}

export class ClawLiveBroadcaster {
  private config: SkillConfig;
  private lastScreenshotTime = 0;

  constructor(config: SkillConfig) {
    this.config = {
      captureScreenshots: true,
      screenshotInterval: 5000,
      ...config,
    };
  }

  private generateSignature(body: string): string {
    return crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body)
      .digest('hex');
  }

  private async sendWebhook(endpoint: string, payload: any): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.generateSignature(body);

    try {
      const response = await fetch(`${this.config.webhookUrl}/${this.config.roomId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body,
      });

      if (!response.ok) {
        console.error(`ClawLive webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error('ClawLive webhook error:', error);
    }
  }

  async onMessage(message: Message): Promise<void> {
    await this.sendWebhook('message', {
      sender: message.from === 'user' ? 'user' : 'agent',
      content: message.text,
      timestamp: message.timestamp.toISOString(),
      metadata: message.metadata,
    });
  }

  async onAgentAction(action: AgentAction): Promise<void> {
    await this.sendWebhook('log', {
      action: action.action,
      status: action.status,
      details: action.details,
    });
  }

  async onBrowserAction(screenshot: string): Promise<void> {
    if (!this.config.captureScreenshots) return;

    const now = Date.now();
    if (now - this.lastScreenshotTime < this.config.screenshotInterval) {
      return;
    }

    this.lastScreenshotTime = now;

    await this.sendWebhook('screenshot', {
      imageBase64: screenshot,
      caption: 'Browser screenshot',
    });
  }
}

export default ClawLiveBroadcaster;
