/**
 * 浏览器端直连 OpenClaw Gateway WebSocket
 * 参考：https://clawdocs.org/reference/gateway-api/
 */

function toWebSocketUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '').trim();
  if (base.startsWith('https://')) return base.replace(/^https:\/\//, 'wss://');
  if (base.startsWith('http://')) return base.replace(/^http:\/\//, 'ws://');
  return base.startsWith('ws') ? base : `wss://${base}`;
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
          doResolve({
            error: `连接被关闭 (code 1008)${reason ? `: ${reason}` : ''}。若通过 ngrok 访问，请在 OpenClaw 配置中加入 allowInsecureAuth 与 dangerouslyDisableDeviceAuth。`,
          });
        } else {
          doResolve({ error: reason ? `连接已关闭 (code ${ev.code}): ${reason}` : `连接已关闭 (code ${ev.code})` });
        }
      }
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'chat',
          id: msgId,
          payload: { text, context: {}, options: {} },
          timestamp: new Date().toISOString(),
        })
      );
    };

    ws.onmessage = (event) => {
      let msg: { type?: string; id?: string; payload?: { text?: string; code?: string; message?: string } };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (msg.type === 'error') {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        doResolve({ error: msg.payload?.message || msg.payload?.code || 'Gateway 返回错误' });
        return;
      }
      if (msg.type === 'response' && msg.id === msgId) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        const textRes = msg.payload?.text ?? '';
        doResolve({ response: typeof textRes === 'string' ? textRes : '' });
      }
    };
  });
}
