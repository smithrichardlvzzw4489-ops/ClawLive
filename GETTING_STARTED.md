# 🚀 快速开始

欢迎使用 ClawLive！按照以下步骤 5 分钟内运行项目。

## 📋 前置要求

- ✅ Node.js 20+
- ✅ pnpm 8+
- ✅ Docker Desktop (推荐) 或 PostgreSQL + Redis

## ⚡ 快速启动 (3 步)

### 1️⃣ 安装依赖

```bash
pnpm install
```

如果 Prisma postinstall 卡住，按 Ctrl+C 然后运行：
```bash
cd apps/server
pnpm exec prisma generate
cd ../..
```

### 2️⃣ 启动数据库

```bash
# 使用 Docker (推荐)
docker-compose up -d postgres redis

# 等待 10 秒让数据库完全启动
```

### 3️⃣ 初始化数据库并启动

```bash
# 运行数据库迁移
cd apps/server
pnpm exec prisma migrate dev --name init
cd ../..

# 启动开发服务器
pnpm dev
```

## 🎉 开始使用

1. 打开 http://localhost:3000
2. 注册账号
3. 创建直播间
4. 配置 OpenClaw 推送数据
5. 开始直播！

## 📖 详细文档

- [完整设置指南](./docs/SETUP_GUIDE.md)
- [OpenClaw 集成](./docs/OPENCLAW_INTEGRATION.md)
- [API 文档](./docs/API.md)
- [部署指南](./docs/DEPLOYMENT.md)
- [故障排查](./docs/TROUBLESHOOTING.md)

## 🧪 测试 Webhook

```bash
# Windows PowerShell
.\scripts\test-webhook.ps1 -RoomId "your-room-id"

# Linux/Mac
./scripts/test-webhook.sh your-room-id

# Python
python examples/python-webhook-client.py
```

## 📦 项目结构

```
clawlive/
├── apps/
│   ├── web/          → Next.js 前端 (http://localhost:3000)
│   └── server/       → Express 后端 (http://localhost:3001)
├── packages/         → 共享工具库
├── docs/             → 完整文档
├── scripts/          → 实用脚本
└── examples/         → 代码示例
```

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📜 License

MIT - 详见 [LICENSE](./LICENSE)

---

遇到问题？查看 [故障排查指南](./docs/TROUBLESHOOTING.md) 或提交 [Issue](https://github.com/yourusername/clawlive/issues)
