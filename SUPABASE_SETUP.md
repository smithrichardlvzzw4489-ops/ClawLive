# 🐘 Supabase PostgreSQL 详细设置教程

手把手教你从 Supabase 获取免费的 PostgreSQL 数据库。

## ⏱️ 预计时间：3 分钟

---

## 第 1 步：访问 Supabase 官网

### 打开浏览器，访问：

```
https://supabase.com/
```

### 你会看到 Supabase 首页

- 页面上有 "Start your project" 或 "Sign Up" 按钮
- 如果你已经有账号，点击 "Sign In"
- 如果没有账号，继续下面的步骤

---

## 第 2 步：注册账号（如果已有账号请跳过）

### 点击 "Start your project" 或 "Sign Up"

你有 3 种注册方式：

#### 方式 1：使用 GitHub 账号（推荐 ⭐）

```
1. 点击 "Continue with GitHub"
2. 授权 Supabase 访问你的 GitHub 账号
3. 完成！自动登录
```

**优势**：最快，一键登录，无需记密码

#### 方式 2：使用 Google 账号

```
1. 点击 "Continue with Google"
2. 选择你的 Google 账号
3. 完成！自动登录
```

#### 方式 3：使用邮箱注册

```
1. 输入邮箱地址
2. 输入密码（至少 8 个字符）
3. 点击 "Sign Up"
4. 去邮箱查收验证邮件
5. 点击邮件中的验证链接
6. 返回 Supabase 页面
```

---

## 第 3 步：创建新项目

### 登录后，你会看到控制面板（Dashboard）

#### 点击 "New project" 按钮

通常在页面右上角或中央，绿色按钮，写着 "New project" 或 "+ New project"

---

## 第 4 步：填写项目信息

### 你需要填写以下信息：

#### 1. Organization（组织）

```
- 如果是第一次使用，会自动创建一个组织
- 使用默认的组织名称即可
- 或者点击 "New organization" 创建新组织
```

#### 2. Project name（项目名称）

```
建议填写：clawlive
或者：clawlive-dev
```

**说明**：这只是显示名称，可以随意填写

#### 3. Database Password（数据库密码）⚠️ 重要！

```
点击 "Generate a password" 自动生成强密码
或者自己设置一个强密码
```

**⚠️ 重要提示**：
- 这个密码非常重要！请务必保存！
- 建议点击密码旁边的"复制"图标
- 粘贴到一个安全的地方（记事本、密码管理器等）
- 后面配置 `.env` 时需要用到

#### 4. Region（区域）

选择离你最近的区域，以获得最佳性能：

```
如果在中国，建议选择：
- Singapore (Southeast Asia)  # 新加坡，推荐
- Tokyo (Northeast Asia)      # 东京
- Seoul (Northeast Asia)      # 首尔（如果有的话）

如果在美国，建议选择：
- US East (N. Virginia)
- US West (N. California)

如果在欧洲，建议选择：
- Europe (Frankfurt)
- Europe (London)
```

#### 5. Pricing Plan（定价计划）

```
✅ 选择 "Free" （免费）
```

**免费版包含**：
- 500 MB 数据库存储
- 2 GB 数据传输/月
- 无限 API 请求
- 适合开发和小型项目

---

## 第 5 步：创建项目

### 点击 "Create new project" 按钮

```
⏳ 等待 1-2 分钟
Supabase 正在为你创建数据库...
```

你会看到进度条或加载动画，显示：
- "Setting up database..."
- "Configuring..."
- "Almost there..."

**耐心等待，不要关闭页面**

---

## 第 6 步：获取数据库连接字符串

### 项目创建完成后，你会进入项目控制面板

#### 找到 Settings（设置）

```
1. 在左侧菜单栏找到 "Settings" (齿轮图标)
2. 点击 Settings
```

#### 进入 Database 设置

```
3. 在 Settings 页面，左侧会有子菜单
4. 点击 "Database"
```

#### 找到 Connection String（连接字符串）

```
5. 向下滚动页面
6. 找到 "Connection string" 或 "Connection info" 部分
7. 你会看到几个标签页：
   - URI
   - Postgres
   - JDBC
   等等
```

#### 选择 URI 格式

```
8. 点击 "URI" 标签（通常是第一个）
9. 你会看到一个连接字符串，类似：

   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijk.supabase.co:5432/postgres
```

#### 复制连接字符串

```
10. 点击连接字符串右边的"复制"图标 📋
11. 或者手动选中整个字符串，Ctrl+C 复制
```

---

## 第 7 步：替换密码占位符

### 你复制的连接字符串中有 `[YOUR-PASSWORD]`

这是一个占位符，你需要替换成你在第 4 步设置的密码。

#### 示例：

**复制的字符串**：
```
postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijk.supabase.co:5432/postgres
```

**假设你的密码是**：`MyStrongPass123`

**替换后的字符串**：
```
postgresql://postgres:MyStrongPass123@db.abcdefghijk.supabase.co:5432/postgres
```

**⚠️ 注意事项**：

1. **如果密码包含特殊字符**（如 `@`、`:`、`/`、`#` 等），需要进行 URL 编码：

   | 特殊字符 | 编码后 |
   |---------|--------|
   | `@` | `%40` |
   | `:` | `%3A` |
   | `/` | `%2F` |
   | `#` | `%23` |
   | `?` | `%3F` |
   | `&` | `%26` |
   | `=` | `%3D` |
   | `%` | `%25` |
   | 空格 | `%20` |

   **例如**：
   - 密码是 `Pass@123`
   - 编码后：`Pass%40123`
   - 完整连接字符串：
     ```
     postgresql://postgres:Pass%40123@db.abcdefghijk.supabase.co:5432/postgres
     ```

2. **建议**：使用自动生成的密码（只包含字母和数字），避免特殊字符

---

## 第 8 步：将连接字符串添加到项目

### 打开项目的 `.env` 文件

```powershell
# 在项目根目录
cd "D:\AI project\ClawLive"

# 如果还没有 .env 文件，从模板复制
Copy-Item .env.cloud-template .env

# 打开 .env 文件
code .env
# 或
notepad .env
```

### 找到 `DATABASE_URL` 这一行

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"
```

### 替换成你的连接字符串

```bash
# 将整个字符串替换为你从 Supabase 复制的连接字符串
DATABASE_URL="postgresql://postgres:MyStrongPass123@db.abcdefghijk.supabase.co:5432/postgres"
```

**⚠️ 注意**：
- 保留引号 `""`
- 确保没有空格
- 确保是一整行，不要换行

### 保存文件

```
Ctrl + S 保存
```

---

## 第 9 步：测试连接

### 回到 PowerShell，测试数据库连接

```powershell
# 进入后端目录
cd apps\server

# 测试 Prisma 是否能连接数据库
pnpm exec prisma db pull
```

### 成功的标志

如果连接成功，你会看到：

```
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "db.xxx.supabase.co:5432"

✔ Introspected 0 tables and 0 enums
```

如果看到错误，请查看下面的"常见问题"部分。

---

## ✅ 完成！你已经获取了 PostgreSQL 数据库

现在你可以继续下一步：获取 Redis

查看完整指南：[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md#步骤-2-获取-redis-upstash---1-分钟)

或者，如果你想跳过 Redis（使用内存缓存），可以直接初始化数据库：

```powershell
# 在 apps\server 目录
pnpm exec prisma migrate deploy

# 返回根目录
cd ..\..

# 启动应用（如果跳过 Redis，需要修改代码）
pnpm dev
```

---

## 🐛 常见问题排查

### 问题 1: "Can't reach database server"

**原因**：连接字符串错误或网络问题

**解决方案**：

1. **检查连接字符串格式**：
   ```bash
   # 正确格式
   postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
   
   # 常见错误
   postgresql://postgres@db.xxx.supabase.co:5432/postgres  # ❌ 缺少密码
   postgresql://postgres:password@localhost:5432/postgres   # ❌ 错误的主机
   ```

2. **检查密码是否正确**：
   - 回到 Supabase
   - Settings > Database > Connection string
   - 重新复制密码

3. **检查特殊字符是否编码**：
   - 如果密码有 `@` 等特殊字符
   - 使用 URL 编码（见上面的表格）

4. **检查网络连接**：
   ```powershell
   # 测试是否能连接到 Supabase
   ping db.xxx.supabase.co
   ```

### 问题 2: "Invalid authentication credentials"

**原因**：密码错误

**解决方案**：

1. 回到 Supabase Dashboard
2. Settings > Database
3. 点击 "Reset Database Password"
4. 生成新密码
5. 更新 `.env` 文件中的 `DATABASE_URL`

### 问题 3: 忘记了数据库密码

**解决方案**：

1. 登录 Supabase
2. 选择你的项目
3. Settings > Database
4. 滚动到 "Database password" 部分
5. 点击 "Reset Database Password"
6. 生成新密码并保存
7. 获取新的连接字符串
8. 更新 `.env` 文件

### 问题 4: "Connection timeout"

**原因**：防火墙或网络限制

**解决方案**：

1. **关闭 VPN**（如果在使用）
2. **检查防火墙设置**：
   ```powershell
   # 允许 PowerShell 访问网络
   # 在管理员 PowerShell 中运行
   netsh advfirewall firewall add rule name="Allow PostgreSQL" dir=out action=allow protocol=TCP remoteport=5432
   ```

3. **尝试使用手机热点**测试（排除网络问题）

### 问题 5: 找不到 Settings 或 Database 菜单

**解决方案**：

1. 确保项目已创建完成（绿色的 "Active" 标志）
2. 刷新页面（F5）
3. 检查左侧菜单栏：
   - 看起来像齿轮图标 ⚙️
   - 或者写着 "Settings"
4. 如果还是找不到，尝试：
   - 点击左上角的项目名称
   - 进入项目详情页
   - 从那里找到 Settings

---

## 📸 关键页面截图说明

### 1. Supabase 首页
- 大标题："The Open Source Firebase Alternative"
- 绿色按钮："Start your project"
- 或者右上角："Sign Up" / "Sign In"

### 2. 创建项目页面
- 表单标题："Create a new project"
- 输入框：
  - Organization（组织下拉菜单）
  - Name（项目名称输入框）
  - Database Password（密码输入框 + 生成按钮）
  - Region（区域下拉菜单）
  - Pricing Plan（Free 选项）
- 底部：绿色按钮 "Create new project"

### 3. Settings > Database 页面
- 左侧：Settings 菜单展开
  - General
  - **Database** ← 点击这里
  - API
  - etc.
- 右侧：Database 设置页面
  - Connection info
  - Connection string
    - 标签：**URI** | Postgres | JDBC | etc.
  - Connection pooling
  - etc.

### 4. Connection String 部分
- 标题："Connection string"
- 说明文字："Use these connection strings to connect to your database"
- 标签页：
  - **URI** ← 选择这个
  - Postgres
  - JDBC
- 连接字符串框（灰色背景）：
  ```
  postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
  ```
- 右侧：复制按钮 📋

---

## 🎯 下一步

获取 PostgreSQL 后，继续获取 Redis：

**[UPSTASH_SETUP.md](./UPSTASH_SETUP.md)** ← 接下来创建这个

或查看完整云服务启动指南：

**[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)**

---

## 💡 小贴士

### 关于 Supabase 免费额度

```
✅ 500 MB 存储空间
✅ 2 GB 数据传输/月
✅ 无限 API 请求
✅ 自动备份
✅ SSL/TLS 加密
✅ 全球 CDN
```

**这些额度足够**：
- 开发和测试
- 小型应用（100-1000 用户）
- ClawLive 的所有直播数据

### 如果超过免费额度

Supabase 会：
1. 发邮件通知你
2. 暂时限制访问（不会删除数据）
3. 你可以：
   - 清理旧数据
   - 升级到付费计划（$25/月）
   - 迁移到新的免费项目

### 保持数据库健康

```sql
-- 定期清理旧数据（7 天前的消息）
DELETE FROM messages WHERE timestamp < NOW() - INTERVAL '7 days';
DELETE FROM agent_logs WHERE timestamp < NOW() - INTERVAL '1 day';
DELETE FROM screenshots WHERE timestamp < NOW() - INTERVAL '1 day';
```

可以在 Supabase 的 SQL Editor 中运行这些命令。

---

<div align="center">

## 🎊 恭喜！你已经完成了第一步

**下一步**: 获取 Redis（1 分钟）

**或直接查看**: [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)

</div>
