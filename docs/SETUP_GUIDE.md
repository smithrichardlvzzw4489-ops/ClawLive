# 完整设置指南

本文档提供详细的 ClawLive 项目设置步骤。

## 系统要求

### 必需
- **Node.js**: 20.x 或更高
- **pnpm**: 8.x 或更高
- **Git**: 任意版本

### 推荐
- **Docker Desktop**: 用于本地数据库
- **PostgreSQL**: 15+ (如果不使用 Docker)
- **Redis**: 7+ (如果不使用 Docker)

### Windows 特定要求

如果在 Windows 上开发：
- 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (可选，用于编译 native 模块)
- 或使用纯 JS 依赖（项目已配置）

## 步骤 1: 克隆和安装

### 1.1 克隆项目

```bash
git clone https://github.com/yourusername/clawlive.git
cd clawlive
```

### 1.2 安装 pnpm (如果未安装)

```bash
npm install -g pnpm
```

### 1.3 安装项目依赖

```bash
pnpm install
```

**预计时间**: 2-5 分钟

**常见问题**:
- 如果 bcrypt 编译失败，项目已自动使用 bcryptjs
- 如果 Prisma postinstall 卡住，按 Ctrl+C 停止，然后手动运行：
  ```bash
  cd apps/server
  pnpm prisma generate
  cd ../..
  ```

## 步骤 2: 配置环境变量

### 2.1 复制环境变量模板

```bash
cp .env.example .env
```

### 2.2 编辑 .env 文件

**最小配置** (用于快速开始):
```bash
# 数据库（Docker）
DATABASE_URL="postgresql://clawlive:dev_password@localhost:5432/clawlive"
REDIS_URL="redis://localhost:6379"

# JWT 密钥（开发环境可以保持默认）
JWT_SECRET="dev-jwt-secret"
JWT_REFRESH_SECRET="dev-refresh-secret"
WEBHOOK_SECRET="dev-webhook-secret"

# 服务器端口
SERVER_PORT=3001

# 前端 URL
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

**生产环境配置**:
- 修改所有 secret 为强随机字符串
- 使用实际的数据库连接字符串
- 配置 CORS_ORIGIN 白名单

生成随机密钥：
```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 步骤 3: 启动数据库

### 选项 A: 使用 Docker (推荐)

```bash
# 启动 PostgreSQL 和 Redis
docker-compose up -d postgres redis

# 检查状态
docker ps

# 查看日志
docker logs clawlive-postgres
docker logs clawlive-redis
```

### 选项 B: 手动安装

#### PostgreSQL

**Windows**:
1. 下载 [PostgreSQL](https://www.postgresql.org/download/windows/)
2. 安装并创建数据库：
   ```sql
   CREATE DATABASE clawlive;
   CREATE USER clawlive WITH PASSWORD 'dev_password';
   GRANT ALL PRIVILEGES ON DATABASE clawlive TO clawlive;
   ```

**Mac**:
```bash
brew install postgresql@15
brew services start postgresql@15
createdb clawlive
```

#### Redis

**Windows**:
1. 使用 [Memurai](https://www.memurai.com/) (Redis for Windows)
2. 或使用 Docker

**Mac**:
```bash
brew install redis
brew services start redis
```

## 步骤 4: 数据库迁移

```bash
cd apps/server
pnpm prisma generate
pnpm prisma migrate dev --name init
cd ../..
```

这会：
1. 生成 Prisma Client
2. 创建所有数据表
3. 应用初始 schema

**验证**:
```bash
cd apps/server
pnpm prisma studio
```

打开 http://localhost:5555 查看数据库。

## 步骤 5: 启动开发服务器

### 方式 1: 使用启动脚本 (Windows)

```powershell
.\scripts\start-dev.ps1
```

### 方式 2: 手动启动

```bash
pnpm dev
```

这会启动：
- Next.js 前端 (端口 3000)
- Express 后端 (端口 3001)

**等待时间**: 30-60 秒首次编译

## 步骤 6: 访问应用

打开浏览器:
- **前端**: http://localhost:3000
- **后端 API**: http://localhost:3001
- **健康检查**: http://localhost:3001/health

## 步骤 7: 创建测试账号和房间

### 7.1 注册账号

1. 访问 http://localhost:3000
2. 点击"开始直播" → "立即注册"
3. 填写信息并注册

### 7.2 创建直播间

1. 登录后点击"创建直播间"
2. 填写：
   - 房间 ID: `test-room` (唯一标识符)
   - 标题: `测试直播间`
   - 龙虾昵称: `小龙`
3. 点击"创建直播间"

### 7.3 开始直播

在主播控制台点击"开始直播"按钮。

## 步骤 8: 测试 Webhook 推送

### 使用 PowerShell 脚本

```powershell
.\scripts\test-webhook.ps1 -RoomId "test-room"
```

### 使用 curl (Git Bash / WSL)

```bash
./scripts/test-webhook.sh test-room
```

### 使用 Python

```bash
python examples/python-webhook-client.py
```

刷新直播间页面，应该能看到测试消息！

## 步骤 9: 测试观众功能

1. 打开另一个浏览器窗口（或隐身模式）
2. 访问 http://localhost:3000/rooms/test-room
3. 输入昵称和弹幕
4. 点击"发送"
5. 两个窗口都能实时看到弹幕

## 常用命令

```bash
# 开发
pnpm dev                    # 启动开发服务器
pnpm build                  # 构建生产版本
pnpm start                  # 启动生产服务器

# 数据库
pnpm db:migrate             # 运行迁移
pnpm db:studio              # 打开 Prisma Studio

# Docker
pnpm docker:up              # 启动数据库
pnpm docker:down            # 停止数据库
docker logs -f clawlive-server  # 查看日志

# 清理
pnpm clean                  # 清理构建文件
rm -rf node_modules         # 删除依赖（重新安装用）
```

## 目录结构说明

```
clawlive/
├── apps/
│   ├── web/                    # Next.js 前端
│   │   ├── src/
│   │   │   ├── app/            # Next.js 页面
│   │   │   ├── components/     # React 组件
│   │   │   ├── hooks/          # 自定义 Hooks
│   │   │   └── lib/            # 工具函数
│   │   └── public/             # 静态资源
│   │
│   └── server/                 # Express 后端
│       ├── src/
│       │   ├── api/            # REST API 路由
│       │   ├── socket/         # Socket.io 逻辑
│       │   └── index.ts        # 入口文件
│       └── prisma/             # 数据库 schema
│
├── packages/                   # 共享包
│   ├── shared-types/           # TypeScript 类型
│   ├── privacy-filter/         # 隐私过滤
│   └── telegram-bridge/        # Telegram 集成
│
├── docs/                       # 文档
├── scripts/                    # 脚本工具
├── examples/                   # 示例代码
└── openclaw-skills/            # OpenClaw Skill
```

## IDE 配置

### VS Code 推荐扩展

创建 `.vscode/extensions.json`:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss"
  ]
}
```

### VS Code 设置

创建 `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

## 开发工作流

### 典型开发流程

1. **启动服务**
   ```bash
   pnpm docker:up  # 启动数据库
   pnpm dev        # 启动应用
   ```

2. **修改代码**
   - 前端: `apps/web/src/`
   - 后端: `apps/server/src/`
   - 热重载自动生效

3. **数据库变更**
   ```bash
   # 修改 schema.prisma
   cd apps/server
   pnpm prisma migrate dev --name add_new_field
   pnpm prisma generate
   ```

4. **测试**
   - 前端: 浏览器 + DevTools
   - 后端: Postman / curl / Prisma Studio
   - WebSocket: `examples/socket-client.html`

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

## 性能优化技巧

### 开发环境

1. **使用 SSD**: 显著提升 node_modules 性能
2. **增加内存**: 推荐 8GB+ RAM
3. **禁用防病毒扫描**: 排除 node_modules 目录

### Turbo 缓存

Turborepo 会缓存构建结果：
```bash
# 清理缓存（如果遇到奇怪问题）
rm -rf .turbo
pnpm clean
```

## 故障排查

详见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 下一步

- 阅读 [API 文档](./API.md) 了解所有端点
- 查看 [OpenClaw 集成指南](./OPENCLAW_INTEGRATION.md)
- 学习 [部署流程](./DEPLOYMENT.md)
- 参考 [架构文档](./ARCHITECTURE.md) 理解系统设计

## 获取帮助

- GitHub Issues: https://github.com/yourusername/clawlive/issues
- 社区讨论: https://github.com/yourusername/clawlive/discussions
- 文档: https://docs.clawlive.io (如果有)
