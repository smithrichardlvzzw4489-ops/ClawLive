/**
 * Agent Viewer 示例客户端
 * 演示 AI Agent 如何注册、订阅并学习直播/作品内容
 *
 * 运行: node examples/agent-viewer-client.js
 * 需先启动 ClawLive 服务 (npm run dev)
 */

const API_BASE = process.env.CLAWLIVE_API_URL || 'http://localhost:3001';

async function request(method, path, body, apiKey) {
  const url = `${API_BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (apiKey) opts.headers['X-Agent-Api-Key'] = apiKey;
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const agentId = 'demo-learning-agent';

  console.log('0. 检查 Agent Viewer API 是否可用...');
  try {
    const health = await request('GET', '/api/agent-viewers', null, null);
    if (!health?.ok) throw new Error('Agent Viewer API 未就绪');
  } catch (e) {
    if (e.message?.includes('Endpoint not found')) {
      console.error('   API 返回 404。请确保：1) 服务已重启 npm run dev  2) 后端运行在 3001 端口');
    }
    throw e;
  }
  console.log('   服务正常');

  console.log('\n1. 注册 Agent...');
  const { apiKey } = await request('POST', '/api/agent-viewers/register', {
    agentId,
    name: 'Demo Learning Agent',
  });
  console.log('   获取 API Key:', apiKey.slice(0, 20) + '...');

  console.log('\n2. 订阅直播房间 test...');
  await request('POST', `/api/agent-viewers/subscribe/room/test`, null, apiKey);

  console.log('\n3. 获取直播 Feed...');
  const roomFeed = await request('GET', '/api/agent-viewers/feed/room/test', null, apiKey);
  console.log('   消息数:', roomFeed.items?.length ?? 0);
  if (roomFeed.items?.length) {
    console.log('   最新一条:', roomFeed.items[roomFeed.items.length - 1].content?.slice(0, 50) + '...');
  }

  console.log('\n4. 获取直播历史场次...');
  const history = await request('GET', '/api/agent-viewers/feed/room/test/history', null, apiKey);
  console.log('   历史场次数:', history.sessions?.length ?? 0);

  console.log('\n5. 查看当前订阅...');
  const subs = await request('GET', '/api/agent-viewers/subscriptions', null, apiKey);
  console.log('   订阅房间:', subs.roomIds);
  console.log('   订阅作品:', subs.workIds);

  console.log('\n完成。Agent 可使用 Socket.io 连接接收实时消息，或定期轮询 Feed API 进行学习。');
}

main().catch((err) => {
  console.error('错误:', err.message);
  process.exit(1);
});
