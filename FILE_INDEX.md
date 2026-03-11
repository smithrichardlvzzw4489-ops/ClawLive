# 📁 ClawLive 文件索引

完整的项目文件清单和说明。

## 🗂️ 根目录文件

| 文件 | 用途 |
|------|------|
| `package.json` | Root package.json (Turborepo) |
| `pnpm-workspace.yaml` | pnpm 工作区配置 |
| `turbo.json` | Turborepo 构建配置 |
| `tsconfig.json` | TypeScript 基础配置 |
| `.gitignore` | Git 忽略规则 |
| `.gitattributes` | Git 换行符配置 |
| `.dockerignore` | Docker 构建忽略 |
| `.eslintrc.json` | ESLint 配置 |
| `.env.example` | 环境变量模板 |
| `README.md` | 项目主文档 |
| `LICENSE` | MIT 许可证 |
| `CHANGELOG.md` | 变更日志 |
| `CONTRIBUTING.md` | 贡献指南 |
| `START_HERE.md` | ⭐ 从这里开始 |
| `GETTING_STARTED.md` | 快速入门 |
| `PROJECT_SUMMARY.md` | 项目总结 |
| `PROJECT_COMPLETE.md` | 完成报告 |
| `FILE_INDEX.md` | 本文档 |

## 📦 apps/web (Next.js 前端)

### 配置文件
- `package.json` - 前端依赖
- `tsconfig.json` - TS 配置
- `next.config.js` - Next.js 配置
- `tailwind.config.ts` - Tailwind 配置
- `postcss.config.js` - PostCSS 配置
- `.eslintrc.json` - ESLint 配置
- `.env.local` - 本地环境变量

### 页面 (src/app/)
- `layout.tsx` - 根布局
- `page.tsx` - 首页
- `globals.css` - 全局样式
- `rooms/page.tsx` - 房间列表页
- `rooms/[roomId]/page.tsx` - 直播间页
- `rooms/create/page.tsx` - 创建房间页
- `login/page.tsx` - 登录页
- `register/page.tsx` - 注册页
- `dashboard/page.tsx` - 主播控制台

### 组件 (src/components/)
- `LiveStream.tsx` - 直播主组件
- `ChatBubble.tsx` - 聊天气泡
- `AgentLogPanel.tsx` - Agent 日志面板
- `CommentSection.tsx` - 观众弹幕区
- `ScreenshotViewer.tsx` - 截图查看器
- `RoomList.tsx` - 房间列表

### Hooks (src/hooks/)
- `useSocket.ts` - Socket.io 连接管理
- `useAuth.ts` - 用户认证状态

### 工具库 (src/lib/)
- `socket.ts` - Socket.io 客户端封装
- `api.ts` - REST API 封装
- `utils.ts` - 通用工具函数

## 🔌 apps/server (Express 后端)

### 配置文件
- `package.json` - 后端依赖
- `tsconfig.json` - TS 配置
- `.env` - 环境变量
- `Dockerfile` - Docker 镜像配置

### 核心文件 (src/)
- `index.ts` - 服务器入口
- `config/index.ts` - 配置管理

### API 路由 (src/api/routes/)
- `index.ts` - 路由聚合
- `auth.ts` - 认证路由（注册/登录）
- `rooms.ts` - 房间管理路由
- `webhooks.ts` - OpenClaw Webhook 端点

### 中间件 (src/api/middleware/)
- `auth.ts` - JWT 认证中间件
- `webhookAuth.ts` - Webhook 签名验证
- `errorHandler.ts` - 统一错误处理
- `rateLimit.ts` - 速率限制
- `validator.ts` - 输入验证

### Socket.io (src/socket/)
- `index.ts` - WebSocket 主逻辑

### 服务层 (src/services/)
- `auth.service.ts` - 认证业务逻辑
- `room.service.ts` - 房间业务逻辑
- `message.service.ts` - 消息管理
- `agentLog.service.ts` - 日志管理
- `screenshot.service.ts` - 截图处理

### 工具库 (src/lib/)
- `prisma.ts` - Prisma 客户端
- `redis.ts` - Redis 连接管理
- `logger.ts` - 日志工具

### 数据库 (prisma/)
- `schema.prisma` - Prisma Schema (6 个模型)

## 📚 packages (共享包)

### shared-types
- `package.json`
- `tsconfig.json`
- `src/index.ts` - 20+ TypeScript 接口定义

### privacy-filter
- `package.json`
- `tsconfig.json`
- `src/index.ts` - 隐私过滤算法

### telegram-bridge
- `package.json`
- `tsconfig.json`
- `src/index.ts` - Telegram Bot 桥接

## 🦞 openclaw-skills

### clawlive-broadcaster
- `package.json` - Skill 配置
- `skill.ts` - Skill 主逻辑
- `README.md` - 使用说明

## 📖 docs (文档中心)

| 文档 | 内容 | 页数 |
|------|------|------|
| `SETUP_GUIDE.md` | 详细设置步骤 | ~8 页 |
| `API.md` | 完整 API 参考 | ~12 页 |
| `OPENCLAW_INTEGRATION.md` | OpenClaw 集成教程 | ~6 页 |
| `DEPLOYMENT.md` | 部署指南 | ~10 页 |
| `ARCHITECTURE.md` | 技术架构 | ~8 页 |
| `TROUBLESHOOTING.md` | 故障排查 | ~6 页 |
| `QUICKSTART.md` | 5 分钟快速开始 | ~3 页 |

## 🛠️ scripts (脚本工具)

| 脚本 | 平台 | 用途 |
|------|------|------|
| `test-webhook.ps1` | Windows | Webhook 测试 |
| `test-webhook.sh` | Linux/Mac | Webhook 测试 |
| `start-dev.ps1` | Windows | 一键启动开发环境 |
| `setup.sh` | Linux/Mac | 自动设置项目 |

## 💻 examples (示例代码)

| 文件 | 语言 | 用途 |
|------|------|------|
| `webhook-client.ts` | TypeScript | Webhook 客户端封装 |
| `python-webhook-client.py` | Python | Python 集成示例 |
| `socket-client.html` | HTML/JS | 浏览器端 WebSocket 测试 |

## 🐳 Docker 配置

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 开发环境配置 |
| `docker-compose.prod.yml` | 生产环境覆盖 |
| `apps/server/Dockerfile` | 后端 Docker 镜像 |
| `apps/web/Dockerfile` | 前端 Docker 镜像 |

## 🔄 CI/CD (.github/workflows/)

| 文件 | 用途 |
|------|------|
| `ci.yml` | 持续集成（测试、构建） |
| `deploy.yml` | 自动部署（Vercel + Railway） |

## 📊 文件统计

| 类别 | 数量 |
|------|------|
| TypeScript/JavaScript 源文件 | 60+ |
| 配置文件 | 20+ |
| 文档文件 | 18 |
| 示例和脚本 | 7 |
| 总文件（含依赖） | 1016+ |

## 🔍 重要文件快速查找

### 想修改前端样式？
→ `apps/web/src/app/globals.css`
→ `apps/web/tailwind.config.ts`

### 想添加新 API？
→ `apps/server/src/api/routes/`

### 想修改数据模型？
→ `apps/server/prisma/schema.prisma`

### 想理解 WebSocket 逻辑？
→ `apps/server/src/socket/index.ts`
→ `apps/web/src/hooks/useSocket.ts`

### 想集成 OpenClaw？
→ `docs/OPENCLAW_INTEGRATION.md`
→ `openclaw-skills/clawlive-broadcaster/`

### 想部署到云？
→ `docs/DEPLOYMENT.md`
→ `docker-compose.yml`

### 遇到问题？
→ `docs/TROUBLESHOOTING.md`

## 🎓 推荐阅读顺序

1. **START_HERE.md** ⭐⭐⭐ (必读)
2. **GETTING_STARTED.md** ⭐⭐
3. **docs/API.md** ⭐⭐
4. **docs/OPENCLAW_INTEGRATION.md** ⭐⭐
5. **docs/DEPLOYMENT.md** ⭐
6. **docs/ARCHITECTURE.md** ⭐
7. 其他文档（按需）

---

**文件总数**: 90+ 源文件 + 文档  
**代码总行数**: ~3500 行  
**文档总字数**: ~20,000 字

**项目状态**: ✅ MVP 完成，可投入使用
