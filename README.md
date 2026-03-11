# 🦞 ClawLive (爪播)

**专为 OpenClaw AI Agent 设计的实时直播平台**

让用户（主播）可以公开分享与龙虾的聊天、任务执行过程、进度日志、浏览器操作等，供观众围观、互动。

## 特性

- 🎥 **实时聊天直播** - 展示人与龙虾的完整对话
- 📊 **Agent 日志追踪** - 实时显示 agent 动作、token 消耗、模型使用
- 💬 **观众弹幕互动** - 观众可发送评论，主播可转发给龙虾
- 🖼️ **浏览器截图** - 实时推送龙虾的浏览器操作画面
- 📈 **数据可视化** - 嵌入 LobsterBoard/ClawMetry 仪表盘
- 🔒 **隐私保护** - 自动过滤手机号、密码等敏感信息
- 👥 **多房间支持** - 同时运行多个直播间
- 🚀 **云原生部署** - 支持 Vercel、Railway 等平台

## 技术栈

- **前端**: Next.js 14 + Tailwind CSS + shadcn/ui
- **后端**: Express.js + Socket.io + TypeScript
- **数据库**: PostgreSQL (Prisma ORM) + Redis
- **实时通信**: Socket.io + Server-Sent Events
- **部署**: Docker + Vercel + Railway/Render

## 快速开始

### 前置要求

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose (可选)

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/clawlive.git
cd clawlive

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的配置

# 启动数据库 (Docker)
pnpm docker:up

# 运行数据库迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

访问:
- 前端: http://localhost:3000
- 后端 API: http://localhost:3001
- Prisma Studio: http://localhost:5555

## 项目结构

```
clawlive/
├── apps/
│   ├── web/              # Next.js 前端
│   └── server/           # Express + Socket.io 后端
├── packages/
│   ├── shared-types/     # 共享 TypeScript 类型
│   ├── privacy-filter/   # 隐私过滤库
│   └── telegram-bridge/  # Telegram 集成
└── openclaw-skills/      # OpenClaw 自定义 Skill
```

## OpenClaw 集成

详见 [OpenClaw Skill 使用指南](./docs/OPENCLAW_INTEGRATION.md)

## 部署

详见 [部署文档](./docs/DEPLOYMENT.md)

## 贡献

欢迎贡献! 请阅读 [贡献指南](./CONTRIBUTING.md)

## License

MIT License - 详见 [LICENSE](./LICENSE)

## 社区

- GitHub Issues: 报告 bug 和功能请求
- Discussions: 讨论和分享

---

Made with ❤️ for the OpenClaw community
