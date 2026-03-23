/**
 * 浏览器端直连 OpenClaw Gateway WebSocket
 * 支持两种协议：
 * 1. JSON-RPC 2.0（新版 Gateway）: connect → agent
 * 2. 旧版 event 格式: type:chat + payload
 * 参考：https://openclaw-openclaw.mintlify.app/api/websocket
 * 参考：https://clawdocs.org/reference/gateway-api/
 */

function toWebSocketUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '').trim();
  if (base.startsWith('https://')) return base.replace(/^https:\/\//, 'wss://');
  if (base.startsWith('http://')) return base.replace(/^http:\/\//, 'ws://');
  return base.startsWith('ws') ? base : `wss://${base}`;
}

/** 1008 错误提示 */
function format1008Error(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes('invalid request frame') || lower.includes('invalid')) {
    return `连接被关闭 (code 1008): ${reason}。Gateway 可能使用 JSON-RPC 协议，ClawLive 已支持。若仍失败，请检查 Gateway 版本与配置。`;
  }
  return `连接被关闭 (code 1008)${reason ? `: ${reason}` : ''}。若通过 ngrok 访问，请在 OpenClaw 配置中加入 allowInsecureAuth 与 dangerouslyDisableDeviceAuth。`;
}

/** JSON-RPC 2.0 协议：connect + agent */
function runJsonRpc(
  ws: WebSocket,
  token: string,
  text: string,
  doResolve: (r: { response?: string; error?: string }) => void,
  timeout: ReturnType<typeof setTimeout>
) {
  const sessionKey = `clawlive:${Date.now()}`;
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let reqId = 0;
  const nextId = () => ++reqId;
  let accumulatedText = '';

  const onMessage = (event: MessageEvent) => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return;
    }

    // 流式 agent 事件
    if (frame.event === 'agent') {
      const payload = frame.payload as Record<string, unknown>;
      const stream = payload?.stream as string;
      const data = payload?.data as Record<string, unknown>;
      if (stream === 'assistant' && data?.type === 'text' && typeof data.text === 'string') {
        accumulatedText += data.text;
      }
      if (stream === 'lifecycle' && (data as Record<string, string>)?.phase === 'end') {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        clearTimeout(timeout);
        doResolve({ response: accumulatedText.trim() });
      }
      return;
    }

    // JSON-RPC 响应
    const id = frame.id as number | string;
    const ok = frame.ok as boolean;
    const err = frame.error as Record<string, string> | undefined;

    if (!ok && err) {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      clearTimeout(timeout);
      doResolve({ error: err.message || err.code || 'Gateway 返回错误' });
      return;
    }

    if (id === 1) {
      // connect 成功，发送 agent 请求
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: nextId(),
          method: 'agent',
          params: {
            message: text,
            sessionKey,
            runId,
            thinking: 'medium',
          },
        })
      );
    } else if (id === 2) {
      // agent 直接响应（非流式），否则继续等流式事件
      const payload = frame.payload as Record<string, unknown>;
      const payloads = payload?.payloads as Array<{ type?: string; text?: string }> | undefined;
      let textRes = '';
      if (Array.isArray(payloads) && payloads.length > 0) {
        for (const p of payloads) {
          if (p?.type === 'text' && typeof p.text === 'string') textRes += p.text;
        }
      }
      if (textRes) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        clearTimeout(timeout);
        doResolve({ response: textRes });
      }
    }
  };

  ws.onmessage = onMessage as (e: MessageEvent) => void;
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'connect',
      params: {
        role: 'control',
        auth: token ? { token } : {},
        client: { name: 'ClawLive', version: '1.0.0', platform: 'web' },
      },
    })
  );
}

export async function sendMessageToGateway(
  gatewayUrl: string,
  token: string,
  text: string
): Promise<{ response?: string; error?: string }> {
  const wsUrl = toWebSocketUrl(gatewayUrl);
  const urlWithToken = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
  const msgId = `clawlive-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return new Promise((resolve) => {
    let resolved = false;
    const doResolve = (r: { response?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(r);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(urlWithToken);
    } catch (err) {
      doResolve({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const timeout = setTimeout(() => {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      doResolve({ error: 'Gateway 响应超时（90 秒）。请确认 Gateway 与穿透工具都在运行。' });
    }, 90000);

    ws.onerror = () => {
      ws.onclose = null;
      ws.onmessage = null;
      doResolve({ error: 'WebSocket 连接错误' });
    };

    ws.onclose = (ev) => {
      ws.onerror = null;
      ws.onmessage = null;
      if (!resolved) {
        const reason = ev.reason || '';
        if (ev.code === 1008) {
          doResolve({ error: format1008Error(reason) });
        } else {
          doResolve({ error: reason ? `连接已关闭 (code ${ev.code}): ${reason}` : `连接已关闭 (code ${ev.code})` });
        }
      }
    };

    ws.onopen = () => {
      // 优先使用 JSON-RPC 协议（解决 invalid request frame）
      runJsonRpc(ws, token, text, doResolve, timeout);
    };
  });
}
