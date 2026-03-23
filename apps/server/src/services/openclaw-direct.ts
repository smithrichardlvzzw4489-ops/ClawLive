/**
 * OpenClaw Direct - 直连 OpenClaw Gateway，无需 Telegram 等中间渠道
 * 使用 OpenClaw Gateway 默认 WebSocket API（无需在 OpenClaw 做任何配置）
 * 参考：https://clawdocs.org/reference/gateway-api/
 */

import WebSocket from 'ws';
import { Server } from 'socket.io';
import { appendMessage } from '../lib/rooms-store';

export interface OpenClawDirectConfig {
  gatewayUrl: string;
  token: string;
  sessionKey?: string;
}

/** 将 Gateway HTTP(S) URL 转为 WebSocket URL */
function toWebSocketUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '').trim();
  if (base.startsWith('https://')) return base.replace(/^https:\/\//, 'wss://');
  if (base.startsWith('http://')) return base.replace(/^http:\/\//, 'ws://');
  return base.startsWith('ws') ? base : `wss://${base}`;
}

function runAgent(
  gatewayUrl: string,
  token: string,
  message: string,
  _sessionKey: string
): Promise<{ response?: string; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const doResolve = (r: { response?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(r);
    };

    const wsUrl = toWebSocketUrl(gatewayUrl);
    const urlWithToken = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
    const msgId = `clawlive-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const timeout = setTimeout(() => {
      ws.removeAllListeners();
      ws.close();
      doResolve({ error: 'Gateway 响应超时（90 秒）。请确认本机 OpenClaw 网关与穿透工具都在运行。' });
    }, 90000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(urlWithToken);
    } catch (err) {
      doResolve({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    ws.on('error', (err: unknown) => {
      ws.removeAllListeners();
      ws.close();
      const msg = err instanceof Error ? err.message : String(err);
      doResolve({ error: msg || 'WebSocket 连接错误' });
    });

    ws.on('close', (code: number) => {
      ws.removeAllListeners();
      if (!resolved) doResolve({ error: `连接已关闭 (code ${code})` });
    });

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'chat',
          id: msgId,
          payload: {
            text: message,
            context: {},
            options: {},
          },
          timestamp: new Date().toISOString(),
        })
      );
    });

    ws.on('message', (data: Buffer | string) => {
      let msg: { type?: string; id?: string; payload?: { text?: string; code?: string; message?: string } };
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === 'error') {
        ws.removeAllListeners();
        ws.close();
        const txt = msg.payload?.message || msg.payload?.code || 'Gateway 返回错误';
        doResolve({ error: txt });
        return;
      }
      if (msg.type === 'response' && msg.id === msgId) {
        ws.removeAllListeners();
        ws.close();
        const text = msg.payload?.text ?? '';
        doResolve({ response: typeof text === 'string' ? text : '' });
      }
    });
  });
}

export async function sendToOpenClawDirect(
  roomId: string,
  content: string,
  config: OpenClawDirectConfig,
  io: Server
): Promise<{ success: boolean; error?: string }> {
  const sessionKey = config.sessionKey || `clawlive:${roomId}`;

  try {
    console.log(`📤 [OpenClaw Direct] Sending to Gateway: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
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
