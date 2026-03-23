/**
 * OpenClaw Direct - 直连 OpenClaw Gateway，无需 Telegram 等中间渠道
 * 使用 OpenClaw 官方 OpenResponses API: POST /v1/responses
 * 需在 OpenClaw 配置中启用: gateway.http.endpoints.responses.enabled: true
 */

import { Server } from 'socket.io';
import { appendMessage } from '../lib/rooms-store';

export interface OpenClawDirectConfig {
  gatewayUrl: string;
  token: string;
  sessionKey?: string;
}

/** 从 OpenResponses 格式中提取文本 */
function extractTextFromOpenResponses(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as Record<string, unknown>;
  // OpenResponses: output[] -> message.content[] -> output_text.text
  const output = obj.output ?? obj.output_items;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === 'object') {
        const it = item as Record<string, unknown>;
        const content = it.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part && typeof part === 'object') {
              const p = part as Record<string, unknown>;
              if ((p.type === 'output_text' || p.type === 'message') && typeof p.text === 'string')
                return p.text;
            }
          }
        }
        if (typeof it.text === 'string') return it.text;
      }
    }
  }
  // 兼容旧格式
  const fallback = obj.response ?? obj.text ?? obj.output;
  return typeof fallback === 'string' ? fallback : '';
}

async function runAgent(
  gatewayUrl: string,
  token: string,
  message: string,
  sessionKey: string
): Promise<{ response?: string; error?: string }> {
  const base = gatewayUrl.replace(/\/$/, '');
  const url = `${base}/v1/responses`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (compatible; ClawLive/1.0)',
    'Bypass-Tunnel-Reminder': '1',
    'x-openclaw-agent-id': 'main',
    'x-openclaw-session-key': sessionKey,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'openclaw',
      input: message,
      user: sessionKey, // 稳定 session 路由
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const text = await res.text();

  // 404：端点未启用，返回明确指引
  if (res.status === 404) {
    return {
      error:
        'Gateway 返回 404，说明 /v1/responses 端点未启用。请在本机 OpenClaw 配置中添加：gateway.http.endpoints.responses.enabled: true，然后重启 openclaw gateway。详见文档：docs/直连_OPENCLAW_傻瓜指南.md',
    };
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const preview = text.slice(0, 100).replace(/\n/g, ' ');
    return {
      error: `Gateway 返回非 JSON（HTTP ${res.status}）: ${preview}${text.length > 100 ? '...' : ''}`,
    };
  }

  if (!res.ok) {
    const errObj = data && typeof data === 'object' && (data as Record<string, unknown>).error;
    const errMsg =
      (errObj && typeof errObj === 'object' && (errObj as { message?: string }).message) ||
      `HTTP ${res.status}`;
    return { error: errMsg };
  }

  const responseText = extractTextFromOpenResponses(data);
  return { response: responseText || '' };
}

export async function sendToOpenClawDirect(
  roomId: string,
  content: string,
  config: OpenClawDirectConfig,
  io: Server
): Promise<{ success: boolean; error?: string }> {
  const sessionKey = config.sessionKey || `clawlive:${roomId}`;

  try {
    const result = await runAgent(
      config.gatewayUrl,
      config.token,
      content,
      sessionKey
    );

    if (result.error) {
      console.error(`❌ [OpenClaw Direct] ${roomId}:`, result.error);
      return { success: false, error: result.error };
    }

    const agentContent = result.response || '';
    if (!agentContent.trim()) {
      console.log(`⏭️ [OpenClaw Direct] Empty response for room ${roomId}`);
      return { success: true };
    }

    const agentMessage = {
      id: Date.now().toString(),
      roomId,
      sender: 'agent' as const,
      content: agentContent,
      timestamp: new Date(),
    };

    await appendMessage(roomId, agentMessage);
    io.to(roomId).emit('new-message', agentMessage);
    console.log(`✅ [OpenClaw Direct] Agent reply pushed to room ${roomId}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [OpenClaw Direct] ${roomId}:`, msg);
    return { success: false, error: msg };
  }
}
