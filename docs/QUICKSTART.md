# 快速开始指南

本指南帮助你在 5 分钟内运行 ClawLive。

## 前置要求

确保已安装：
- Node.js 20+
- pnpm 8+
- Docker Desktop (推荐)

## 步骤 1: 获取代码

```bash
git clone https://github.com/yourusername/clawlive.git
cd clawlive
```

## 步骤 2: 安装依赖

```bash
pnpm install
```

这会安装所有 monorepo 的依赖（前端、后端、共享包）。

## 步骤 3: 启动数据库

```bash
# 使用 Docker Compose 启动 PostgreSQL 和 Redis
pnpm docker:up
```

等待约 10 秒让数据库完全启动。

## 步骤 4: 运行数据库迁移

```bash
pnpm db:migrate
```

这会创建所有必要的数据表。

## 步骤 5: 启动开发服务器

```bash
pnpm dev
```

这会同时启动：
- 前端 (Next.js): http://localhost:3000
- 后端 (Express): http://localhost:3001

## 步骤 6: 访问应用

打开浏览器访问 http://localhost:3000

### 创建账号

1. 点击"开始直播"或"登录"
2. 点击"立即注册"
3. 填写用户名、邮箱、密码

### 创建直播间

1. 登录后点击"创建直播间"
2. 填写：
   - 房间 ID (如 `my-first-room`)
   - 直播间标题
   - 龙虾昵称
3. 点击"创建直播间"

### 开始直播

1. 在主播控制台点击"开始直播"
2. 配置 OpenClaw 推送数据（见下文）
3. 分享房间链接给观众

## 配置 OpenClaw

### 方式 1: 使用 ClawLive Skill（推荐）

```bash
# 复制 Skill 到 OpenClaw
cp -r openclaw-skills/clawlive-broadcaster ~/.openclaw/skills/

# 配置 OpenClaw
nano ~/.openclaw/config.json
```

添加配置：
```json
{
  "skills": {
    "clawlive-broadcaster": {
      "enabled": true,
      "webhookUrl": "http://localhost:3001/api/webhooks/openclaw",
      "roomId": "my-first-room",
      "webhookSecret": "dev-webhook-secret-change-in-production"
    }
  }
}
```

### 方式 2: 手动推送测试

使用 curl 测试推送消息：

```bash
# 计算签名
BODY='{"sender":"user","content":"你好龙虾","timestamp":"2026-03-11T10:30:00.000Z"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "dev-webhook-secret-change-in-production" | awk '{print $2}')

# 推送消息
curl -X POST http://localhost:3001/api/webhooks/openclaw/my-first-room/message \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"
```

刷新直播间页面，你应该能看到消息！

## 测试弹幕功能

1. 打开另一个浏览器窗口（匿名模式）
2. 访问 http://localhost:3000/rooms/my-first-room
3. 在底部输入昵称和弹幕
4. 点击"发送"
5. 两个窗口都能看到弹幕

## 下一步

- 阅读 [OpenClaw 集成指南](./OPENCLAW_INTEGRATION.md)
- 查看 [API 文档](./API.md)
- 了解 [部署方案](./DEPLOYMENT.md)

## 常见问题

### 端口被占用

修改 `.env` 文件中的端口：
```
SERVER_PORT=3002
```

### Docker 启动失败

确保 Docker Desktop 正在运行，然后重试：
```bash
pnpm docker:down
pnpm docker:up
```

### WebSocket 连接失败

检查后端是否正常运行：
```bash
curl http://localhost:3001/health
```

## 获取帮助

- 查看完整 [README](../README.md)
- 提交 [GitHub Issue](https://github.com/yourusername/clawlive/issues)
