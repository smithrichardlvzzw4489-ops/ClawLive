# 故障排查指南

常见问题和解决方案。

## 安装问题

### pnpm 安装失败

**问题**: `pnpm install` 报错或卡住

**解决方案**:
```bash
# 清理缓存
pnpm store prune

# 删除 node_modules 和 lock 文件
rm -rf node_modules pnpm-lock.yaml

# 重新安装
pnpm install
```

### bcrypt 编译失败 (Windows)

**问题**: `node-gyp rebuild` 失败

**解决方案**:
1. 安装 Visual Studio Build Tools
2. 或使用预编译版本：
   ```bash
   pnpm add bcrypt@5.1.1 --force
   ```

### Prisma 生成失败

**问题**: `prisma generate` 失败

**解决方案**:
```bash
cd apps/server
pnpm prisma generate --schema=./prisma/schema.prisma
```

## 运行时问题

### 端口被占用

**问题**: `Error: listen EADDRINUSE: address already in use :::3001`

**解决方案**:
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3001 | xargs kill -9
```

或修改 `.env` 中的端口：
```
SERVER_PORT=3002
```

### 数据库连接失败

**问题**: `Can't reach database server`

**检查清单**:
1. PostgreSQL 是否运行？
   ```bash
   docker ps | grep postgres
   ```

2. 连接字符串是否正确？
   ```bash
   echo $DATABASE_URL
   ```

3. 防火墙是否阻止连接？

**解决方案**:
```bash
# 重启数据库
docker-compose restart postgres

# 检查日志
docker logs clawlive-postgres
```

### Redis 连接失败

**问题**: Redis connection timeout

**解决方案**:
```bash
# 检查 Redis 状态
docker exec clawlive-redis redis-cli ping

# 应该返回 PONG

# 如果失败，重启 Redis
docker-compose restart redis
```

## WebSocket 问题

### Socket.io 连接不上

**问题**: 前端无法连接到 Socket.io

**检查清单**:
1. 后端是否运行？
   ```bash
   curl http://localhost:3001/health
   ```

2. CORS 配置是否正确？
   检查 `apps/server/src/index.ts` 的 CORS 设置

3. 浏览器控制台是否有错误？

**解决方案**:
```typescript
// apps/server/src/index.ts
const io = new Server(httpServer, {
  cors: {
    origin: '*',  // 开发环境临时允许所有源
    credentials: true,
  },
});
```

### 消息延迟很高

**问题**: 消息推送延迟 > 2 秒

**可能原因**:
1. Redis 未启用（单实例模式）
2. 数据库查询慢
3. 网络延迟

**解决方案**:
```bash
# 检查 Redis 是否连接
docker logs clawlive-server | grep Redis

# 优化数据库查询
cd apps/server
pnpm prisma studio  # 检查索引
```

## Webhook 问题

### Webhook 签名验证失败

**问题**: `403 Invalid webhook signature`

**原因**: 签名不匹配

**解决方案**:
1. 确认 `WEBHOOK_SECRET` 在 ClawLive 和 OpenClaw 中一致
2. 检查请求体是否被修改
3. 确保使用相同的签名算法

**测试工具**:
```bash
# 使用提供的测试脚本
./scripts/test-webhook.sh test-room
```

### Webhook 请求超时

**问题**: OpenClaw 推送超时

**检查**:
1. ClawLive 服务器是否可从 OpenClaw 访问？
2. 防火墙规则？
3. URL 是否正确？

## 前端问题

### 页面白屏

**检查**:
1. 浏览器控制台错误
2. Network 标签页检查 API 请求
3. 后端健康状态

**常见原因**:
- API URL 配置错误
- CORS 阻止
- JavaScript 错误

### 消息不自动滚动

**问题**: 新消息不滚动到底部

**解决方案**: 已在代码中实现，检查：
```typescript
// apps/web/src/components/LiveStream.tsx
messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
```

### 图片不显示

**问题**: 截图或头像无法加载

**检查**:
1. 图片 URL 是否有效？
2. CSP 策略是否允许？
3. 图片大小是否超限？

## 性能问题

### 内存占用高

**原因**: 消息/日志未清理

**解决方案**:
```sql
-- 手动清理（或设置定时任务）
DELETE FROM messages WHERE timestamp < NOW() - INTERVAL '7 days';
DELETE FROM agent_logs WHERE timestamp < NOW() - INTERVAL '1 day';
```

### 页面卡顿

**原因**: 消息列表过长

**解决方案**: 已实现虚拟滚动，确保：
```typescript
// 限制内存中的消息数量
setMessages(prev => [...prev.slice(-1000), newMsg]);
```

## 部署问题

### Vercel 部署失败

**问题**: Build 失败

**检查**:
1. 环境变量是否设置？
2. Build 命令是否正确？
3. 依赖版本冲突？

### Railway/Render 部署失败

**问题**: 容器无法启动

**检查**:
1. Dockerfile 路径正确？
2. 环境变量完整？
3. 数据库迁移是否成功？

**查看日志**:
```bash
# Railway CLI
railway logs

# Render Dashboard
# 访问 Logs 标签页
```

## 数据问题

### 消息丢失

**可能原因**:
1. 数据库未持久化
2. 迁移未运行
3. 消息被隐私过滤器过滤

**检查**:
```sql
-- 直接查询数据库
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;
```

### 房间不存在

**问题**: `404 Room not found`

**解决**:
1. 检查房间 ID 拼写
2. 确认房间未被删除
3. 数据库是否包含该记录

```sql
SELECT * FROM rooms WHERE id = 'your-room-id';
```

## 获取帮助

如果以上方案无法解决问题：

1. 查看完整日志
   ```bash
   # Docker
   docker logs clawlive-server
   docker logs clawlive-web
   
   # 开发环境
   # 查看终端输出
   ```

2. 启用调试模式
   ```bash
   # .env
   NODE_ENV=development
   DEBUG=socket.io*,express:*
   ```

3. 提交 GitHub Issue
   - 包含错误日志
   - 复现步骤
   - 环境信息

4. 加入社区讨论
