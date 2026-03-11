# 无 Docker 环境安装指南

如果你不想使用 Docker，可以直接在 Windows 上安装 PostgreSQL 和 Redis。

## 安装 PostgreSQL

### 方式 1: 使用官方安装程序

1. **下载 PostgreSQL**
   - 访问: https://www.postgresql.org/download/windows/
   - 下载最新版本 (推荐 PostgreSQL 15 或 16)

2. **安装配置**
   ```
   - 端口: 5432 (默认)
   - 超级用户: postgres
   - 密码: 记住你设置的密码
   - 安装位置: 默认即可
   ```

3. **创建数据库**
   ```sql
   -- 打开 pgAdmin 或使用 psql
   CREATE DATABASE clawlive;
   CREATE USER clawlive WITH ENCRYPTED PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE clawlive TO clawlive;
   ```

### 方式 2: 使用 Chocolatey (推荐)

```powershell
# 如果已安装 Chocolatey
choco install postgresql15

# 启动 PostgreSQL 服务
net start postgresql-x64-15
```

## 安装 Redis

### 方式 1: 使用 Memurai (Redis 的 Windows 原生实现)

1. **下载 Memurai**
   - 访问: https://www.memurai.com/
   - 下载免费开发版
   - 安装后会自动启动服务

2. **验证安装**
   ```powershell
   # Redis 默认运行在 6379 端口
   telnet localhost 6379
   ```

### 方式 2: 使用 WSL2 + Redis

```powershell
# 如果你启用了 WSL2
wsl --install
wsl

# 在 WSL 中安装 Redis
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

### 方式 3: 使用 Upstash (云 Redis - 最简单)

1. 访问: https://upstash.com/
2. 创建免费账号
3. 创建 Redis 数据库
4. 复制连接 URL

## 配置环境变量

创建 `.env` 文件并配置连接信息：

```bash
# PostgreSQL (本地安装)
DATABASE_URL="postgresql://clawlive:your_password@localhost:5432/clawlive"

# Redis (本地安装)
REDIS_URL="redis://localhost:6379"

# 或使用 Upstash Redis (云)
REDIS_URL="rediss://default:your_password@your-endpoint.upstash.io:6379"

# JWT 密钥
JWT_SECRET="your-secret-key-change-in-production"
REFRESH_TOKEN_SECRET="your-refresh-secret-change-in-production"

# 服务端口
PORT=3001
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"

# Webhook 安全
WEBHOOK_SECRET="dev-webhook-secret-change-in-production"

# Telegram (可选)
TELEGRAM_BOT_TOKEN=""
```

## 初始化数据库

```powershell
cd apps\server

# 运行数据库迁移
pnpm exec prisma migrate dev --name init

# 生成 Prisma Client
pnpm exec prisma generate

# (可选) 打开数据库管理界面
pnpm exec prisma studio
```

## 启动项目

```powershell
# 回到项目根目录
cd ..\..

# 启动开发服务器
pnpm dev
```

## 验证服务

### 检查 PostgreSQL

```powershell
# 使用 psql
psql -U clawlive -d clawlive -h localhost

# 或使用 pgAdmin (图形界面)
# 默认: http://localhost/pgadmin
```

### 检查 Redis

```powershell
# 使用 redis-cli (如果安装了 Redis CLI)
redis-cli ping
# 应该返回: PONG

# 或使用 Memurai CLI
memurai-cli ping
```

## 故障排查

### PostgreSQL 无法连接

```powershell
# 检查服务是否运行
Get-Service -Name postgresql*

# 启动服务
net start postgresql-x64-15
```

### Redis 无法连接

```powershell
# 检查 Memurai 服务
Get-Service -Name Memurai

# 启动服务
net start Memurai
```

### 端口被占用

```powershell
# 检查端口占用
netstat -ano | findstr :5432  # PostgreSQL
netstat -ano | findstr :6379  # Redis
netstat -ano | findstr :3001  # 后端服务器
netstat -ano | findstr :3000  # 前端服务器

# 杀死进程
taskkill /PID <PID> /F
```

## 推荐配置 (生产环境)

如果你打算长期使用，推荐以下配置：

1. **PostgreSQL**: 本地安装 (性能最好)
2. **Redis**: Upstash (免费，无需维护)
3. **前端**: Vercel (免费部署)
4. **后端**: Railway (免费额度)

这样可以获得最佳的开发体验和性能表现。

## 下一步

安装完成后，参考以下文档继续：

- **[START_HERE.md](./START_HERE.md)** - 项目使用指南
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - 下一步行动
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - 问题排查

---

**需要帮助?** 查看文档或提交 Issue: https://github.com/yourusername/clawlive/issues
