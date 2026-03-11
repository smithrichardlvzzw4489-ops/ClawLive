# 🦞 开始使用 ClawLive

## ✨ 项目已创建完成！

ClawLive 的完整代码结构已经搭建好了。以下是接下来的步骤。

## 📁 项目包含内容

### 代码文件
- ✅ **50+ 源代码文件** - 前端、后端、共享库
- ✅ **完整 TypeScript 类型定义** - 类型安全
- ✅ **10+ React 组件** - 直播间、聊天、日志等
- ✅ **15+ API 端点** - REST API + WebSocket
- ✅ **Prisma 数据库 Schema** - 6 个数据模型
- ✅ **隐私过滤系统** - 自动脱敏
- ✅ **OpenClaw Skill** - 自定义集成

### 配置文件
- ✅ Docker 和 docker-compose
- ✅ Turborepo 配置
- ✅ Next.js 配置
- ✅ TypeScript 配置
- ✅ Tailwind CSS
- ✅ ESLint
- ✅ GitHub Actions CI/CD

### 文档和示例
- ✅ **10 篇完整文档** - 从入门到架构
- ✅ **3 个语言示例** - TypeScript、Python、HTML/JS
- ✅ **测试脚本** - Webhook 测试工具
- ✅ **启动脚本** - 一键启动开发环境

## 🚀 立即开始 (3 步)

### 步骤 1: 启动数据库

```powershell
# Windows PowerShell
docker-compose up -d postgres redis
```

**预计时间**: 30 秒

### 步骤 2: 初始化数据库

```powershell
cd apps\server
pnpm exec prisma migrate dev --name init
cd ..\..
```

**预计时间**: 20 秒

### 步骤 3: 启动应用

```powershell
pnpm dev
```

**预计时间**: 30-60 秒 (首次编译)

然后访问:
- 🌐 前端: http://localhost:3000
- 🔌 后端: http://localhost:3001
- ❤️ 健康检查: http://localhost:3001/health

## 📖 推荐阅读顺序

1. **[GETTING_STARTED.md](./GETTING_STARTED.md)** ⭐
   - 5 分钟快速入门
   - 注册账号、创建房间、开始直播

2. **[docs/OPENCLAW_INTEGRATION.md](./docs/OPENCLAW_INTEGRATION.md)** ⭐
   - OpenClaw 集成教程
   - Webhook 配置
   - Skill 安装

3. **[docs/API.md](./docs/API.md)**
   - 完整 API 参考
   - WebSocket 事件列表

4. **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**
   - 部署到 Vercel + Railway
   - Docker 容器化
   - 生产环境配置

5. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**
   - 技术架构详解
   - 数据流说明
   - 性能优化策略

## 🧪 测试 Webhook

完成设置后，测试 OpenClaw 集成：

```powershell
# 测试推送消息和日志
.\scripts\test-webhook.ps1 -RoomId "your-room-id"
```

或打开 `examples/socket-client.html` 在浏览器中测试。

## 📊 项目目录结构

```
clawlive/
├── apps/
│   ├── web/              # Next.js 前端 (React + Tailwind)
│   │   ├── src/
│   │   │   ├── app/          # 页面路由
│   │   │   ├── components/   # React 组件
│   │   │   ├── hooks/        # 自定义 Hooks
│   │   │   └── lib/          # 工具函数
│   │   └── public/           # 静态资源
│   │
│   └── server/           # Express + Socket.io 后端
│       ├── src/
│       │   ├── api/          # REST API
│       │   │   ├── routes/       # 路由定义
│       │   │   └── middleware/   # 中间件
│       │   ├── socket/       # WebSocket 逻辑
│       │   └── index.ts      # 服务器入口
│       └── prisma/           # 数据库
│           └── schema.prisma # Schema 定义
│
├── packages/
│   ├── shared-types/     # TypeScript 类型（前后端共享）
│   ├── privacy-filter/   # 隐私过滤库
│   └── telegram-bridge/  # Telegram Bot 集成
│
├── openclaw-skills/
│   └── clawlive-broadcaster/  # OpenClaw 自定义 Skill
│
├── docs/                 # 📖 文档中心
│   ├── SETUP_GUIDE.md
│   ├── API.md
│   ├── OPENCLAW_INTEGRATION.md
│   ├── DEPLOYMENT.md
│   ├── ARCHITECTURE.md
│   ├── TROUBLESHOOTING.md
│   └── QUICKSTART.md
│
├── scripts/              # 🛠️ 实用脚本
│   ├── test-webhook.ps1
│   ├── test-webhook.sh
│   ├── start-dev.ps1
│   └── setup.sh
│
├── examples/             # 📝 代码示例
│   ├── webhook-client.ts
│   ├── python-webhook-client.py
│   └── socket-client.html
│
└── 配置文件
    ├── docker-compose.yml
    ├── turbo.json
    ├── package.json
    └── .env.example
```

## 🎯 核心特性一览

| 特性 | 状态 | 说明 |
|------|------|------|
| 房间管理 | ✅ | 创建、查看、删除直播间 |
| 实时聊天 | ✅ | WebSocket 推送人虾对话 |
| Agent 日志 | ✅ | 实时追踪龙虾行为 |
| 观众弹幕 | ✅ | 匿名评论、实时互动 |
| 浏览器截图 | ✅ | 自动压缩、图片展示 |
| 隐私过滤 | ✅ | 自动脱敏敏感信息 |
| 用户认证 | ✅ | JWT + 密码登录 |
| Webhook 集成 | ✅ | OpenClaw 数据推送 |
| Dashboard 嵌入 | ✅ | iframe 嵌入仪表盘 |
| 多房间支持 | ✅ | 同时运行多个直播间 |
| 观众计数 | ✅ | 实时显示在线人数 |
| 消息历史 | ✅ | 回放最近对话 |
| 云部署 | ✅ | Vercel + Railway 配置 |
| Docker | ✅ | 容器化部署方案 |

## 🔧 开发工作流

### 日常开发

1. 确保数据库运行: `docker-compose ps`
2. 启动开发服务器: `pnpm dev`
3. 修改代码（自动热重载）
4. 测试功能
5. 提交代码

### 添加新功能

1. 修改 Prisma schema (如需)
2. 运行迁移: `cd apps/server && pnpm exec prisma migrate dev`
3. 添加后端 API (apps/server/src/api/routes/)
4. 添加前端组件 (apps/web/src/components/)
5. 更新类型定义 (packages/shared-types/)

### 调试技巧

- **后端**: 查看终端日志
- **数据库**: `pnpm db:studio` 打开 Prisma Studio
- **WebSocket**: 使用 `examples/socket-client.html`
- **API**: 使用 Postman 或 curl

## ⚠️ 常见问题

### Q: 端口被占用怎么办？

修改 `.env` 中的端口号：
```
SERVER_PORT=3002
```

### Q: 数据库连接失败？

确保 Docker 容器运行：
```powershell
docker-compose up -d postgres redis
docker ps  # 检查容器状态
```

### Q: Prisma 命令找不到？

依赖可能未完全安装：
```powershell
pnpm install --ignore-scripts
cd apps\server
pnpm exec prisma generate
```

### Q: 如何重置数据库？

```powershell
cd apps\server
pnpm exec prisma migrate reset
```

### Q: 如何测试 Webhook？

```powershell
.\scripts\test-webhook.ps1 -RoomId "test-room"
```

更多问题查看 [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## 🌟 下一步

1. **体验应用**
   - 访问 http://localhost:3000
   - 注册账号并创建第一个直播间

2. **集成 OpenClaw**
   - 阅读 [OpenClaw 集成指南](./docs/OPENCLAW_INTEGRATION.md)
   - 配置 Webhook 或安装 Skill

3. **自定义开发**
   - 添加新功能
   - 修改 UI 样式
   - 扩展 API

4. **部署上线**
   - 阅读 [部署指南](./docs/DEPLOYMENT.md)
   - 部署到 Vercel + Railway

## 🤝 需要帮助？

- 📚 查看 [完整文档](./docs/)
- 🐛 提交 [Issue](https://github.com/yourusername/clawlive/issues)
- 💬 参与 [Discussions](https://github.com/yourusername/clawlive/discussions)
- 📧 联系维护者

---

**祝你使用愉快！** 🦞✨
