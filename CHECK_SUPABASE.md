# 🔧 检查和更新 Supabase 连接字符串

## 步骤 1：登录 Supabase

访问：https://supabase.com/dashboard/projects

---

## 步骤 2：检查项目状态

### 查找你的项目

- 项目名称应该是：**clawlive**（或你创建时用的名字）
- 查看状态标志：
  - ✅ **Active**（绿色圆点）- 项目运行中
  - 🔄 **Setting up** - 还在创建，需要等待
  - ⏸️ **Paused** - 已暂停

### 如果项目是 "Setting up" 状态

- ⏳ 等待 2-3 分钟
- 🔄 刷新页面
- ✅ 等状态变为 "Active" 后继续

### 如果项目是 "Paused" 状态

- 点击项目
- 点击 "Restore project" 或 "Resume" 按钮
- 等待恢复完成

---

## 步骤 3：重新获取正确的连接字符串

### 进入项目设置

1. 点击你的项目（clawlive）
2. 点击左侧菜单的 **Settings**（齿轮图标 ⚙️）
3. 点击 **Database**

### 找到连接字符串

向下滚动到 **"Connection string"** 部分

### 重要！选择正确的连接模式

你会看到两种连接模式：

#### ❌ 错误模式：Transaction（交易模式）
```
端口：6543
用于：连接池、Serverless 环境
❌ Prisma 不能用这个！
```

#### ✅ 正确模式：Session（会话模式）
```
端口：5432
用于：传统数据库连接、Prisma、直接连接
✅ Prisma 需要用这个！
```

### 获取 Session 模式的连接字符串

1. 在 "Connection string" 部分
2. 找到 **"Connection pooling"** 切换按钮
3. 确保**关闭** "Connection pooling"（或选择 "Session mode"）
4. 点击 **"URI"** 标签
5. 复制连接字符串

正确的格式应该是：
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

或者（旧格式）：
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**注意端口号必须是 5432！**

---

## 步骤 4：更新 .env 文件

### 打开 .env 文件

```powershell
notepad "d:\AI project\ClawLive\apps\server\.env"
```

### 更新 DATABASE_URL

将第 3 行替换为新的连接字符串：

```bash
DATABASE_URL="你刚复制的新连接字符串"
```

**⚠️ 如果密码包含特殊字符，需要 URL 编码：**

特殊字符编码对照：
- `[` → `%5B`
- `]` → `%5D`
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `^` → `%5E`
- `&` → `%26`

### 保存文件

Ctrl+S 保存

---

## 步骤 5：测试新连接

```powershell
cd "d:\AI project\ClawLive\apps\server"
pnpm exec prisma db pull
```

### 成功标志

```
✔ Introspected 0 tables and 0 enums
```

---

## 🐛 如果还是失败

### 检查清单

- [ ] 项目状态是 "Active"（绿色）
- [ ] 使用的是 Session mode（端口 5432）
- [ ] 密码特殊字符已编码
- [ ] 网络连接正常（关闭 VPN）
- [ ] 防火墙未阻止连接

### 尝试 Ping 测试

```powershell
# 测试域名解析
nslookup db.[YOUR-PROJECT-REF].supabase.co

# 测试连接
Test-NetConnection -ComputerName "db.[YOUR-PROJECT-REF].supabase.co" -Port 5432
```

### 检查 Supabase 项目 URL

在 Supabase Dashboard：
- 点击项目
- 查看 "Project URL"
- 确保和连接字符串中的域名匹配

---

## 💡 替代方案：使用连接池 URL（如果直连失败）

如果 5432 端口始终无法连接，可以尝试使用 Supabase 的 Pooler：

### 在 Supabase Dashboard：

1. Settings > Database
2. **启用** "Connection pooling"
3. 选择 **"Transaction mode"**
4. 复制新的连接字符串（端口会是 6543）

### 更新 Prisma 配置

在 `prisma/schema.prisma` 中添加：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // 添加这一行
}
```

在 `.env` 中：
```bash
DATABASE_URL="连接池URL（端口6543）"
DIRECT_URL="直连URL（端口5432）"
```

---

## 🆘 仍然无法解决？

提供以下信息：
1. Supabase 项目状态（Active/Paused/Setting up）
2. 使用的连接模式（Session/Transaction）
3. 端口号（5432 还是 6543）
4. 完整错误信息
5. 网络环境（公司网络/家庭网络/VPN）

---

继续下一步：[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)
