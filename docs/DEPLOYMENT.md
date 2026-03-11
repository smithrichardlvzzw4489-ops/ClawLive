# 部署指南

本文档介绍如何部署 ClawLive 到各种环境。

## 本地开发

### 使用 Docker Compose (推荐)

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/clawlive.git
cd clawlive

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 3. 启动所有服务
pnpm docker:up

# 4. 运行数据库迁移
pnpm db:migrate

# 5. 访问应用
# 前端: http://localhost:3000
# 后端: http://localhost:3001
# Prisma Studio: pnpm db:studio
```

### 手动启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 PostgreSQL 和 Redis
# (使用 docker-compose 或本地安装)

# 3. 运行数据库迁移
cd apps/server
pnpm prisma migrate dev

# 4. 启动开发服务器
cd ../..
pnpm dev

# 前端: http://localhost:3000
# 后端: http://localhost:3001
```

## 云部署

### 选项 1: Vercel (前端) + Railway (后端)

#### 部署后端到 Railway

1. 在 Railway 创建新项目
2. 添加 PostgreSQL 和 Redis 服务
3. 添加 GitHub 仓库
4. 配置环境变量：
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<生成随机字符串>
   WEBHOOK_SECRET=<生成随机字符串>
   SERVER_PORT=3001
   CORS_ORIGIN=https://your-app.vercel.app
   ```
5. 设置构建命令：
   ```
   Root Directory: apps/server
   Build Command: pnpm install && pnpm prisma generate && pnpm build
   Start Command: pnpm prisma migrate deploy && node dist/index.js
   ```

6. 部署完成后记录 URL（如 `https://clawlive-server.railway.app`）

#### 部署前端到 Vercel

1. 在 Vercel 导入 GitHub 仓库
2. 配置项目：
   - Framework Preset: Next.js
   - Root Directory: apps/web
   - Build Command: `cd ../.. && pnpm install && pnpm --filter @clawlive/web build`
   - Output Directory: apps/web/.next

3. 配置环境变量：
   ```
   NEXT_PUBLIC_API_URL=https://clawlive-server.railway.app
   NEXT_PUBLIC_SOCKET_URL=https://clawlive-server.railway.app
   ```

4. 部署

### 选项 2: Render (全栈)

#### 部署后端

1. 创建新的 Web Service
2. 连接 GitHub 仓库
3. 配置：
   ```
   Name: clawlive-server
   Environment: Docker
   Dockerfile Path: apps/server/Dockerfile
   ```

4. 添加 PostgreSQL 和 Redis 实例

5. 配置环境变量（同 Railway）

#### 部署前端

1. 创建新的 Static Site
2. 配置：
   ```
   Build Command: cd apps/web && pnpm install && pnpm build
   Publish Directory: apps/web/out
   ```

### 选项 3: 自托管 (VPS/Dedicated Server)

#### 使用 Docker Compose

```bash
# 1. 在服务器上克隆项目
git clone https://github.com/yourusername/clawlive.git
cd clawlive

# 2. 配置生产环境变量
cp .env.example .env
nano .env  # 修改为生产配置

# 3. 构建并启动
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 4. 运行迁移
docker exec clawlive-server npx prisma migrate deploy

# 5. 配置 Nginx 反向代理 (可选)
```

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name clawlive.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## 数据库迁移

### 开发环境

```bash
cd apps/server
pnpm prisma migrate dev --name init
```

### 生产环境

```bash
cd apps/server
pnpm prisma migrate deploy
```

## 环境变量清单

### 必需变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis 连接字符串 | `redis://host:6379` |
| `JWT_SECRET` | JWT 签名密钥 | 随机字符串 |
| `WEBHOOK_SECRET` | Webhook 签名密钥 | 随机字符串 |

### 可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SERVER_PORT` | 后端端口 | 3001 |
| `CORS_ORIGIN` | CORS 允许的源 | * |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `JWT_EXPIRES_IN` | JWT 过期时间 | 24h |

## 监控与日志

### 查看日志

```bash
# Docker
docker logs -f clawlive-server
docker logs -f clawlive-web

# Railway/Render
# 使用各平台的日志查看器
```

### 健康检查

```bash
# 检查后端健康状态
curl https://your-api.com/health

# 检查数据库连接
curl https://your-api.com/api/rooms
```

## 性能优化

### 数据库索引

Prisma schema 已包含必要的索引，确保运行了所有迁移。

### Redis 缓存

启用 Redis 后，Socket.io 会自动使用 Redis adapter 支持多实例。

### CDN 配置 (可选)

如果截图很多，建议配置 CDN：

1. 使用 Cloudflare R2 / AWS S3 存储图片
2. 配置 `CDN_URL` 环境变量
3. 修改 `apps/server/src/api/routes/webhooks.ts` 上传逻辑

## 扩展性

### 水平扩展

1. 确保启用 Redis adapter
2. 启动多个后端实例
3. 使用负载均衡器（Nginx/HAProxy）

### 数据库优化

- 定期清理旧消息（7 天以上）
- 使用 Connection pooling
- 配置 read replicas (读写分离)

## 安全建议

1. ✅ 使用强随机密钥（JWT_SECRET、WEBHOOK_SECRET）
2. ✅ 启用 HTTPS
3. ✅ 配置 CORS 白名单
4. ✅ 启用速率限制
5. ✅ 定期更新依赖
6. ✅ 不要提交 .env 文件到 Git

## 备份

### 数据库备份

```bash
# PostgreSQL
pg_dump -U clawlive -h localhost clawlive > backup.sql

# 恢复
psql -U clawlive -h localhost clawlive < backup.sql
```

### Redis 备份

```bash
# Redis 默认启用 RDB 快照
# 数据保存在 /data/dump.rdb
```

## 故障排查

### WebSocket 连接失败

1. 检查 CORS 配置
2. 确认防火墙开放了端口
3. 如果使用反向代理，确保正确转发 `Upgrade` 头

### 数据库连接失败

1. 检查 `DATABASE_URL` 格式
2. 确认数据库服务运行中
3. 检查防火墙规则

### 高内存占用

1. 限制消息历史数量
2. 配置 Redis maxmemory
3. 启用虚拟滚动（前端已实现）

## 支持

遇到问题？

- 查看 [GitHub Issues](https://github.com/yourusername/clawlive/issues)
- 加入社区讨论
- 提交 Bug 报告
