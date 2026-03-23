/**
 * 浏览器端直连 OpenClaw Gateway WebSocket
 *
 * 协议支持：
 * 1. 新版 Gateway（docs.openclaw.ai）：先等待 connect.challenge，再发送 type:req method:connect
 * 2. 旧版 Gateway（clawdocs.org）：直接发送 type:chat
 *
 * 调试：设置 localStorage.setItem('clawlive_gateway_debug','1') 或 NEXT_PUBLIC_GATEWAY_DEBUG=1
 * 参考：https://docs.openclaw.ai/gateway/protocol
 * 参考：https://clawdocs.org/reference/gateway-api/
 */

function toWebSocketUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '').trim();
  if (base.startsWith('https://')) return base.replace(/^https:\/\//, 'wss://');
  if (base.startsWith('http://')) return base.replace(/^http:\/\//, 'ws://');
  return base.startsWith('ws') ? base : `wss://${base}`;
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    process.env.NEXT_PUBLIC_GATEWAY_DEBUG === '1' ||
    localStorage?.getItem('clawlive_gateway_debug') === '1'
  );
}

function debugLog(tag: string, data: unknown): void {
  if (!isDebugEnabled()) return;
  const sanitized =
    typeof data === 'string'
      ? data.replace(/token["']?\s*:\s*["'][^"']+["']/gi, 'token:"***"')
      : JSON.stringify(data).replace(/"token"\s*:\s*"[^"]+"/g, '"token":"***"');
  console.log(`[Gateway ${tag}]`, sanitized);
}

/** 1008 错误提示（带定位建议） */
function format1008Error(reason: string): string {
  const lower = reason.toLowerCase();
  let hint = '';
  if (lower.includes('invalid request frame') || lower.includes('invalid')) {
    hint =
      '请开启调试（localStorage.setItem("clawlive_gateway_debug","1") 后刷新）查看控制台收发的帧格式。';
    if (lower.includes('legacy') || lower.includes('handshake')) {
      hint += ' Gateway 期望 type:req method:connect，而非旧版 handshake。';
    }
    return `连接被关闭 (code 1008): ${reason}。${hint}`;
  }
  if (lower.includes('pair') || lower.includes('device')) {
    return `连接被关闭 (code 1008): ${reason}。请在 OpenClaw 配置中加入：gateway.controlUi: { allowInsecureAuth: true, dangerouslyDisableDeviceAuth: true }`;
  }
  return `连接被关闭 (code 1008)${reason ? `: ${reason}` : ''}`;
}

/** 新版协议：收到 connect.challenge 后发送 type:req connect，再调用 agent */
function runNewProtocol(
  ws: WebSocket,
  token: string,
  text: string,
  challengePayload: Record<string, unknown>,
  doResolve: (r: { response?: string; error?: string }) => void,
  timeout: ReturnType<typeof setTimeout>
) {
  const reqId = () => `clawlive-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sessionKey = `clawlive:${Date.now()}`;
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let accumulatedText = '';

  const params: Record<string, unknown> = {
    minProtocol: 3,
    maxProtocol: 3,
    client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'webchat' },
    role: 'operator',
    scopes: ['operator.read', 'operator.write'],
    caps: ['tool-events'],
    commands: [],
    permissions: {},
    auth: token ? { token } : {},
    locale: 'en-US',
    userAgent: 'ClawLive/1.0.0',
  };
  // 浏览器端无法生成 device 密钥对签名。启用 allowInsecureAuth/dangerouslyDisableDeviceAuth 时，Gateway 允许省略 device。
  // 若包含 device 但 publicKey/signature 为空会触发 schema 校验失败，故不添加 device 块。
  const connectReq = { type: 'req', id: reqId(), method: 'connect', params };
  debugLog('SEND connect (after challenge)', connectReq);
  ws.send(JSON.stringify(connectReq));

  const onMessage = (event: MessageEvent) => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return;
    }
    debugLog('RECV', frame);

    // 响应：connect 成功 (hello-ok)
    if ((frame.type as string) === 'res' && (frame.ok as boolean) === true) {
      const payload = (frame.payload || {}) as Record<string, unknown>;
      if ((payload.type as string) === 'hello-ok') {
        const agentReq = {
          type: 'req',
          id: reqId(),
          method: 'agent',
          params: { message: text, sessionKey, runId, thinking: 'medium' },
        };
        debugLog('SEND agent', agentReq);
        ws.send(JSON.stringify(agentReq));
        return;
      }
    }

    // 响应：connect 失败
    if ((frame.type as string) === 'res' && (frame.ok as boolean) === false) {
      const err = frame.error as Record<string, string> | undefined;
      const msg = err?.message || err?.code || 'Gateway 拒绝连接';
      debugLog('RECV connect error', err);
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      clearTimeout(timeout);
      doResolve({
        error: `连接被拒: ${msg}。若启用 allowInsecureAuth/dangerouslyDisableDeviceAuth 仍失败，请检查 token 与 Gateway 版本。`,
      });
      return;
    }

    // 流式 agent 事件
    if ((frame.event as string) === 'agent') {
      const payload = (frame.payload || {}) as Record<string, unknown>;
      const stream = payload?.stream as string;
      const data = (payload?.data || {}) as Record<string, unknown>;
      if (stream === 'assistant' && data?.type === 'text' && typeof data.text === 'string') {
        accumulatedText += data.text;
      }
      const lifecycle = data as Record<string, string>;
      if (stream === 'lifecycle' && lifecycle?.phase === 'end') {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        clearTimeout(timeout);
        doResolve({ response: accumulatedText.trim() });
      }
      return;
    }

    // 响应：agent 直接返回（非流式）
    if ((frame.type as string) === 'res') {
      const payload = (frame.payload || {}) as Record<string, unknown>;
      const payloads = payload?.payloads as Array<{ type?: string; text?: string }> | undefined;
      let textRes = '';
      if (Array.isArray(payloads)) {
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
  debugLog('STATE', '等待 connect.challenge（新版协议）');
}

/** 旧版协议：直接发送 type:chat */
function runLegacyProtocol(
  ws: WebSocket,
  text: string,
  doResolve: (r: { response?: string; error?: string }) => void,
  timeout: ReturnType<typeof setTimeout>
) {
  const msgId = `clawlive-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const chatReq = {
    type: 'chat',
    id: msgId,
    payload: { text, context: {}, options: {} },
    timestamp: new Date().toISOString(),
  };
  debugLog('SEND chat (legacy)', chatReq);
  ws.send(JSON.stringify(chatReq));

  ws.onmessage = (event: MessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return;
    }
    debugLog('RECV legacy', msg);
    if ((msg.type as string) === 'error') {
      const payload = (msg.payload || {}) as Record<string, string>;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      clearTimeout(timeout);
      doResolve({ error: payload?.message || payload?.code || 'Gateway 返回错误' });
      return;
    }
    if ((msg.type as string) === 'response' && msg.id === msgId) {
      const payload = (msg.payload || {}) as Record<string, unknown>;
      const textRes = payload?.text ?? '';
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      clearTimeout(timeout);
      doResolve({ response: typeof textRes === 'string' ? textRes : String(textRes) });
    }
  };
}

export async function sendMessageToGateway(
  gatewayUrl: string,
  token: string,
  text: string
): Promise<{ response?: string; error?: string }> {
  const wsUrl = toWebSocketUrl(gatewayUrl);
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (wsUrl.includes('ngrok-free.dev') || wsUrl.includes('ngrok.io')) {
    params.set('ngrok-skip-browser-warning', '1');
  }
  const qs = params.toString();
  const urlWithToken = qs ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}${qs}` : wsUrl;
  const debug = isDebugEnabled();
  if (debug) {
    debugLog('CONNECT', { url: wsUrl, hasToken: !!token, textLen: text.length });
  }

  return new Promise((resolve) => {
    let resolved = false;
    const doResolve = (r: { response?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (debug) debugLog('RESULT', r);
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

    let challengeTimeout: ReturnType<typeof setTimeout> | null = null;

    ws.onerror = () => {
      ws.onclose = null;
      ws.onmessage = null;
      const ngrokHint = wsUrl.includes('ngrok')
        ? ' ngrok 免费版会显示浏览器拦截页，可能阻塞 WebSocket，建议改用 cloudflared 穿透。'
        : '';
      doResolve({
        error:
          'WebSocket 连接错误。请检查：1) Gateway 是否已启动 2) 穿透隧道是否在运行 3) Gateway 地址是否正确。' +
          ngrokHint,
      });
    };

    ws.onclose = (ev) => {
      ws.onerror = null;
      ws.onmessage = null;
      if (challengeTimeout) clearTimeout(challengeTimeout);
      if (!resolved) {
        const reason = ev.reason || '';
        if (ev.code === 1008) {
          doResolve({ error: format1008Error(reason) });
        } else if (ev.code === 1006) {
          const ngrokHint = wsUrl.includes('ngrok')
            ? ' ngrok 免费版会显示浏览器拦截页，可能阻塞 WebSocket。建议改用 cloudflared（Cloudflare Tunnel）穿透。'
            : '';
          doResolve({
            error: `连接失败 (code 1006)：无法连接到 Gateway。请确认 Gateway 已启动、地址正确，且若使用 ngrok 等穿透工具，隧道正在运行。${ngrokHint}`,
          });
        } else {
          doResolve({
            error: reason ? `连接已关闭 (code ${ev.code}): ${reason}` : `连接已关闭 (code ${ev.code})`,
          });
        }
      }
    };

    ws.onopen = () => {
      debugLog('STATE', '已连接，等待首帧（3s 内无 challenge 则尝试旧版 type:chat）');
      const messageHandler = (event: MessageEvent) => {
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        if (challengeTimeout) {
          clearTimeout(challengeTimeout);
          challengeTimeout = null;
        }
        ws.onmessage = null;
        if ((frame.type as string) === 'event' && (frame.event as string) === 'connect.challenge') {
          const payload = (frame.payload || {}) as Record<string, unknown>;
          runNewProtocol(ws, token, text, payload, doResolve, timeout);
        } else {
          debugLog('STATE', '首帧非 connect.challenge，使用旧版 type:chat');
          runLegacyProtocol(ws, text, doResolve, timeout);
        }
      };
      ws.onmessage = messageHandler as (e: MessageEvent) => void;

      challengeTimeout = setTimeout(() => {
        challengeTimeout = null;
        if (resolved) return;
        debugLog('STATE', '3s 内未收到 connect.challenge，切换为旧版 type:chat');
        ws.onmessage = null;
        runLegacyProtocol(ws, text, doResolve, timeout);
      }, 3000);
    };
  });
}
