# 🎯 你的选择 - 如何启动 ClawLive

遇到 Docker 问题？没关系！我们为你准备了**多种启动方式**。

---

## 🤔 我该选哪个？

### 💚 推荐：云服务快速启动

**适合人群**:
- ✅ 想要最快启动（5 分钟）
- ✅ 不想安装 Docker
- ✅ 电脑磁盘空间有限
- ✅ 想要稳定的生产级服务

**优势**:
- 🚀 启动最快（5 分钟）
- 💾 零磁盘占用
- 🌐 自动备份
- 🔒 生产级安全
- 💰 完全免费

**查看指南**: [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md) ⭐

---

### 🐳 Docker 本地启动

**适合人群**:
- ✅ 已经安装了 Docker Desktop
- ✅ 喜欢本地开发环境
- ✅ 需要完全离线工作
- ✅ 熟悉容器技术

**优势**:
- 📦 完全隔离的环境
- 🔄 易于重置和清理
- 📊 资源控制更精确

**前提条件**:
- 需要安装 Docker Desktop（2-5 GB）
- 需要足够的系统资源

**查看指南**: [START_HERE.md](./START_HERE.md#-方案-2-docker-本地启动-需要-docker-desktop)

---

### 🔧 本地直接安装

**适合人群**:
- ✅ 高级用户
- ✅ 需要调试数据库
- ✅ 想要最大性能
- ✅ 已经有 PostgreSQL/Redis

**优势**:
- ⚡ 性能最佳
- 🛠️ 完全控制
- 🔍 易于调试

**前提条件**:
- 需要手动安装 PostgreSQL
- 需要手动安装 Redis 或 Memurai
- 需要一定的数据库知识

**查看指南**: [SETUP_WITHOUT_DOCKER.md](./SETUP_WITHOUT_DOCKER.md)

---

## 📋 快速对比

| 特性 | 云服务 ⭐ | Docker 🐳 | 本地安装 🔧 |
|------|-----------|-----------|------------|
| **启动时间** | 5 分钟 | 10-30 分钟 | 15-30 分钟 |
| **磁盘占用** | 0 GB | 2-5 GB | 1-2 GB |
| **前置需求** | 无 | Docker Desktop | PostgreSQL + Redis |
| **性能** | 优秀 | 良好 | 最佳 |
| **稳定性** | 最高 | 良好 | 取决于配置 |
| **备份** | 自动 | 需配置 | 手动 |
| **维护** | 零维护 | Docker 维护 | 需要维护 |
| **成本** | 免费 | 免费 | 免费 |
| **适合人群** | 所有人 | Docker 用户 | 高级用户 |
| **推荐指数** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 🎯 你当前的情况

### ❌ 遇到的问题

```powershell
'docker-compose' 不是内部或外部命令，也不是可运行的程序或批处理文件。
```

### ✅ 解决方案

你有两个选择：

#### 选项 A: 安装 Docker (需要 30 分钟)

1. 下载 Docker Desktop
   - https://www.docker.com/products/docker-desktop/
2. 安装并重启电脑
3. 启动 Docker Desktop
4. 回到项目，使用命令：
   ```powershell
   # 注意：使用空格，不是连字符
   docker compose up -d postgres redis
   ```

#### 选项 B: 使用云服务 (推荐 - 5 分钟)

直接跳过 Docker，使用云服务：

```powershell
# 1. 复制环境变量模板
Copy-Item .env.cloud-template .env

# 2. 编辑 .env 文件
code .env
```

然后按照 [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md) 的指引操作。

---

## 💡 我的推荐

基于你的情况（Windows 系统，遇到 Docker 问题），我强烈推荐：

### 🌟 使用云服务快速启动

**原因**:
1. ✅ **最快**: 5 分钟内启动，无需下载安装任何软件
2. ✅ **稳定**: Supabase 和 Upstash 是生产级服务，比本地更可靠
3. ✅ **免费**: 完全免费，额度足够开发和小规模生产使用
4. ✅ **简单**: 只需注册账号，复制连接字符串，无需配置
5. ✅ **未来友好**: 部署到生产环境时无需改动代码

### 📖 立即开始

打开这个文件，跟着步骤走：

**[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)** ⭐

只需要：
1. 访问 Supabase，创建数据库（1 分钟）
2. 访问 Upstash，创建 Redis（1 分钟）
3. 复制连接字符串到 `.env`（1 分钟）
4. 运行 `pnpm exec prisma migrate deploy`（1 分钟）
5. 运行 `pnpm dev`（1 分钟）

---

## 🚀 下一步

### 1. 选择你的方式

- **快速开始**: [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md) ⭐
- **使用 Docker**: [START_HERE.md](./START_HERE.md)
- **本地安装**: [SETUP_WITHOUT_DOCKER.md](./SETUP_WITHOUT_DOCKER.md)

### 2. 完成启动后

查看 [NEXT_STEPS.md](./NEXT_STEPS.md) 了解：
- 如何创建第一个直播间
- 如何集成 OpenClaw
- 如何测试功能
- 如何部署上线

### 3. 需要帮助？

- 📖 查看文档: [docs/](./docs/)
- 🐛 问题排查: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
- 💬 提问: [GitHub Issues](https://github.com/yourusername/clawlive/issues)

---

<div align="center">

## 🎊 准备好了吗？

**推荐路径**: [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md) → [NEXT_STEPS.md](./NEXT_STEPS.md)

**5 分钟后见！** 🦞

</div>
