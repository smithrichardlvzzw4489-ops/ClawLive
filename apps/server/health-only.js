#!/usr/bin/env node
/**
 * 最小健康检查服务器 - 仅用 Node 内置模块，用于排查 Railway 部署
 * 若此服务能通过健康检查，则问题在应用层；若仍失败，则问题在 Railway/容器配置
 */
const http = require('http');
const port = Number(process.env.PORT || process.env.SERVER_PORT || 3001);

const server = http.createServer((req, res) => {
  const ok = ['/', '/health', '/api/health'].includes(req.url || req.url.split('?')[0]);
  res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: ok ? 'ok' : 'not found', service: 'clawlive-health-only' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[HealthOnly] Listening on http://0.0.0.0:${port}`);
});
