# 🚀 5 分钟云端快速启动 (无需 Docker)

不想安装 Docker？使用完全免费的云服务快速启动 ClawLive！

## ⏱️ 总耗时: 5 分钟

---

## 步骤 1: 获取 PostgreSQL (Supabase - 1 分钟)

### 注册并创建数据库

1. 访问 **https://supabase.com/**
2. 点击 **"Start your project"**
3. 使用 GitHub 登录（或邮箱注册）
4. 创建新项目:
   - **Name**: `clawlive`
   - **Database Password**: 设置一个强密码（记住它！）
   - **Region**: 选择离你最近的区域
   - 点击 **"Create new project"**

### 获取连接字符串

1. 等待项目创建完成（约 1 分钟）
2. 在左侧菜单点击 **Settings** (齿轮图标)
3. 点击 **Database**
4. 滚动到 **Connection string**
5. 选择 **URI** 标签
6. 点击 **Copy** 复制连接字符串

格式示例:
```
postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijk.supabase.co:5432/postgres
```

---

## 步骤 2: 获取 Redis (Upstash - 1 分钟)

### 注册并创建数据库

1. 访问 **https://upstash.com/**
2. 点击 **"Get Started"**
3. 使用 GitHub 或 Google 登录
4. 选择 **Redis** 标签
5. 点击 **"Create database"**:
   - **Name**: `clawlive`
   - **Type**: Regional (免费)
   - **Region**: 选择离你最近的区域
   - 点击 **"Create"**

### 获取连接字符串

1. 在数据库详情页面
2. 找到 **REST API** 部分
3. 复制 **UPSTASH_REDIS_REST_URL** 下面的 Redis URL

格式示例:
```
rediss://default:AbCdEf123456@us1-example-12345.upstash.io:6379
```

---

## 步骤 3: 配置环境变量 (1 分钟)

### 创建 .env 文件

```powershell
# 在项目根目录
Copy-Item .env.cloud-template .env

# 用 VSCode 或记事本打开
code .env
# 或
notepad .env
```

### 填写配置

```bash
# 替换为你的 Supabase 连接字符串
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# 替换为你的 Upstash Redis URL
REDIS_URL="rediss://default:YOUR_PASSWORD@xxxxx.upstash.io:6379"

# 生成随机密钥 (在 PowerShell 中运行)
# -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
JWT_SECRET="your-generated-secret"
REFRESH_TOKEN_SECRET="your-another-generated-secret"

# 其他保持默认
PORT=3001
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
WEBHOOK_SECRET="dev-webhook-secret"
```

### 生成 JWT 密钥

```powershell
# 运行此命令生成 JWT_SECRET
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})

# 再运行一次生成 REFRESH_TOKEN_SECRET
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})

# 复制输出结果到 .env 文件
```

---

## 步骤 4: 初始化数据库 (1 分钟)

```powershell
# 进入后端目录
cd apps\server

# 运行数据库迁移
pnpm exec prisma migrate deploy

# 生成 Prisma Client
pnpm exec prisma generate

# 返回根目录
cd ..\..
```

---

## 步骤 5: 启动应用 (1 分钟)

```powershell
# 启动开发服务器
pnpm dev
```

看到以下输出表示成功:

```
✓ Ready on http://localhost:3000
✓ Server listening on http://localhost:3001
✓ Socket.io server running
✓ Connected to PostgreSQL
✓ Connected to Redis
```

---

## 步骤 6: 访问应用 🎉

打开浏览器访问: **http://localhost:3000**

1. 点击 **"开始直播"**
2. 点击 **"立即注册"**
3. 创建账号并登录
4. 创建你的第一个直播间！

---

## 🎯 快速测试

### 测试 Webhook 推送

```powershell
# 测试消息推送
.\scripts\test-webhook.ps1 -RoomId "your-room-id"
```

刷新浏览器，你应该能看到测试消息！

---

## 📊 云服务免费额度

### Supabase PostgreSQL
- ✅ 500 MB 数据库存储
- ✅ 2 GB 带宽/月
- ✅ 无限 API 请求
- ✅ 适合 1000+ 用户

### Upstash Redis
- ✅ 10,000 条命令/天
- ✅ 256 MB 内存
- ✅ 全球 CDN
- ✅ 适合 100+ 并发

**足够运行一个活跃的直播平台！**

---

## 🔧 常见问题

### Q: 数据库连接失败

**检查连接字符串**
```powershell
# 测试 PostgreSQL 连接
cd apps\server
pnpm exec prisma db pull
```

**常见错误:**
- 密码中的特殊字符需要 URL 编码
- 确保复制了完整的连接字符串
- 检查网络连接

### Q: Redis 连接超时

**使用 TLS 连接**
```bash
# 确保使用 rediss:// (注意双 s)
REDIS_URL="rediss://default:password@endpoint.upstash.io:6379"
```

### Q: Prisma 迁移失败

**手动创建表**
```powershell
cd apps\server

# 强制重置数据库
pnpm exec prisma migrate reset

# 重新迁移
pnpm exec prisma migrate deploy
```

---

## 🚀 下一步

### 1. 集成 OpenClaw

查看 **[docs/OPENCLAW_INTEGRATION.md](./docs/OPENCLAW_INTEGRATION.md)**

### 2. 部署到云端

查看 **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**

### 3. 定制化开发

查看 **[NEXT_STEPS.md](./NEXT_STEPS.md)**

---

## 💡 为什么选择云服务？

| 对比项 | 本地 Docker | 云服务 |
|--------|-------------|---------|
| 安装时间 | 30+ 分钟 | 5 分钟 |
| 磁盘占用 | 2-5 GB | 0 GB |
| 性能 | 取决于电脑 | 稳定高速 |
| 可访问性 | 仅本地 | 全球 CDN |
| 备份 | 手动 | 自动 |
| 扩展性 | 有限 | 无限 |
| 维护 | 需要 | 无需 |
| 成本 | 电费 | 免费 |

---

## 🎊 完成了！

你现在拥有：

- ✅ 生产级 PostgreSQL 数据库
- ✅ 高性能 Redis 缓存
- ✅ 完整的 ClawLive 应用
- ✅ 零本地依赖

**开始你的龙虾直播之旅吧！** 🦞

---

<div align="center">

**需要帮助？** 查看 [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

**遇到问题？** 提交 [GitHub Issue](https://github.com/yourusername/clawlive/issues)

</div>
