/**
 * OpenClaw Direct - 直连 OpenClaw Gateway，无需 Telegram 等中间渠道
 * 使用 OpenClaw HTTP API: POST /v1/agent/run
 */

import { Server } from 'socket.io';
import { appendMessage } from '../lib/rooms-store';

export interface OpenClawDirectConfig {
  gatewayUrl: string;
  token: string;
  sessionKey?: string;
}

async function runAgent(
  gatewayUrl: string,
  token: string,
  message: string,
  sessionKey: string
): Promise<{ response?: string; error?: string }> {
  const base = gatewayUrl.replace(/\/$/, '');
  const url = `${base}/v1/agent/run`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      sessionKey,
      options: { thinking: 'medium' },
    }),
  });

  const data = (await res.json()) as {
    response?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      error: data.error?.message || `HTTP ${res.status}`,
    };
  }

  return { response: data.response };
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
