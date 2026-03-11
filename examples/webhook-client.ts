import crypto from 'crypto';

interface WebhookConfig {
  apiUrl: string;
  roomId: string;
  webhookSecret: string;
}

export class ClawLiveWebhookClient {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  private generateSignature(body: string): string {
    return crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body)
      .digest('hex');
  }

  async sendMessage(params: {
    sender: 'user' | 'agent';
    content: string;
    metadata?: {
      tokens?: number;
      model?: string;
    };
  }): Promise<void> {
    const payload = {
      sender: params.sender,
      content: params.content,
      timestamp: new Date().toISOString(),
      metadata: params.metadata,
    };

    await this.sendWebhook('message', payload);
  }

  async sendLog(params: {
    action: string;
    status: 'pending' | 'success' | 'error';
    details?: Record<string, any>;
  }): Promise<void> {
    await this.sendWebhook('log', params);
  }

  async sendScreenshot(params: {
    imageBase64: string;
    caption?: string;
  }): Promise<void> {
    await this.sendWebhook('screenshot', params);
  }

  private async sendWebhook(endpoint: string, payload: any): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.generateSignature(body);
    const url = `${this.config.apiUrl}/api/webhooks/openclaw/${this.config.roomId}/${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Webhook failed: ${response.status} - ${JSON.stringify(error)}`);
    }
  }
}

const client = new ClawLiveWebhookClient({
  apiUrl: 'http://localhost:3001',
  roomId: 'my-room',
  webhookSecret: 'dev-webhook-secret-change-in-production',
});

await client.sendMessage({
  sender: 'user',
  content: '你好龙虾，帮我查一下天气',
});

await client.sendLog({
  action: '正在查询天气',
  status: 'pending',
});

await client.sendLog({
  action: '查询天气完成',
  status: 'success',
  details: {
    location: '北京',
    temperature: '15°C',
  },
});

await client.sendMessage({
  sender: 'agent',
  content: '北京今天天气晴，温度 15°C',
  metadata: {
    tokens: 50,
    model: 'gpt-4',
  },
});
