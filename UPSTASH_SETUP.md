# ⚡ Upstash Redis 详细设置教程

手把手教你从 Upstash 获取免费的 Redis 数据库。

## ⏱️ 预计时间：2 分钟

---

## 第 1 步：访问 Upstash 官网

### 打开浏览器，访问：

```
https://upstash.com/
```

或直接访问控制台：

```
https://console.upstash.com/
```

### 你会看到 Upstash 首页

- 页面标题："Serverless Data for Redis® and Kafka®"
- 绿色按钮："Get Started" 或 "Sign Up"
- 如果你已经有账号，点击 "Login"

---

## 第 2 步：注册账号（如果已有账号请跳过）

### 点击 "Get Started" 或 "Sign Up"

你有 3 种注册方式：

#### 方式 1：使用 GitHub 账号（推荐 ⭐）

```
1. 点击 "Continue with GitHub"
2. 授权 Upstash 访问你的 GitHub 账号
3. 完成！自动登录
```

**优势**：最快，一键登录

#### 方式 2：使用 Google 账号

```
1. 点击 "Continue with Google"
2. 选择你的 Google 账号
3. 完成！自动登录
```

#### 方式 3：使用邮箱注册

```
1. 输入邮箱地址
2. 输入密码
3. 点击 "Sign Up"
4. 去邮箱查收验证邮件
5. 点击邮件中的验证链接
```

---

## 第 3 步：进入 Redis 控制台

### 登录后，你会看到控制台

#### 选择 Redis

```
1. 页面顶部有两个标签：
   - "Redis" ← 点击这个
   - "Kafka"

2. 点击 "Redis" 标签
```

---

## 第 4 步：创建 Redis 数据库

### 点击 "Create database" 按钮

通常在页面中央或右上角，绿色按钮。

---

## 第 5 步：填写数据库信息

### 你需要填写以下信息：

#### 1. Name（数据库名称）

```
建议填写：clawlive
或者：clawlive-redis
```

**说明**：这只是显示名称，可以随意填写

#### 2. Type（类型）

选择数据库类型：

```
✅ 选择 "Regional"（区域型）

不要选择：
❌ "Global"（全球型，付费功能）
```

**Regional 是免费的**，完全够用！

#### 3. Region（区域）

选择离你最近的区域，以获得最佳性能：

```
如果在中国，建议选择：
- ap-southeast-1  # 新加坡，推荐 ⭐
- ap-northeast-1  # 日本东京
- ap-northeast-2  # 韩国首尔

如果在美国，建议选择：
- us-east-1       # 美国东部（弗吉尼亚）
- us-west-1       # 美国西部（加利福尼亚）

如果在欧洲，建议选择：
- eu-west-1       # 欧洲西部（爱尔兰）
- eu-central-1    # 欧洲中部（法兰克福）
```

**提示**：尽量选择和 Supabase 相同或相近的区域，减少延迟

#### 4. TLS（SSL）

```
✅ 保持勾选 "Enable TLS"
```

**为什么要开启 TLS**：
- 加密数据传输
- 更安全
- 几乎没有性能损失

#### 5. Eviction（驱逐策略）

```
✅ 保持默认：noeviction
```

**说明**：当内存满时，禁止写入新数据（对我们的用例最安全）

---

## 第 6 步：创建数据库

### 点击 "Create" 按钮

```
⏳ 等待 5-10 秒
Upstash 正在为你创建 Redis...
```

你会看到加载动画，很快就完成了。

---

## 第 7 步：获取连接信息

### 数据库创建完成后，你会进入数据库详情页

#### 查看数据库信息

页面顶部会显示：
- Database name（数据库名称）
- Region（区域）
- Status（状态：Active ✅）
- Created at（创建时间）

#### 找到连接字符串

向下滚动，找到 **"REST API"** 部分

你会看到几个连接选项：

1. **UPSTASH_REDIS_REST_URL** - REST API 地址（我们不需要这个）
2. **UPSTASH_REDIS_REST_TOKEN** - REST API Token（我们不需要这个）
3. **Endpoint** - Redis 端点地址
4. **Password** - Redis 密码

#### 找到 Redis URL

继续向下滚动，找到 **"Connection"** 或 **"Properties"** 部分

你会看到一个完整的 Redis 连接字符串：

```
格式：
redis://default:YOUR_PASSWORD@HOST:PORT

或（如果启用了 TLS）：
rediss://default:YOUR_PASSWORD@HOST:PORT
```

**注意最后的双 `ss`**（`rediss://`），表示使用 TLS 加密连接

#### 复制连接字符串

有两种方式：

**方式 1：直接复制完整 URL**

```
1. 找到标题为 "Redis Connect URL" 或 "Connection String" 的部分
2. 你会看到一个完整的 URL，类似：
   
   rediss://default:AbCdEf123456@us1-example-12345.upstash.io:6379

3. 点击右边的复制按钮 📋
4. 或者手动选中整个字符串，Ctrl+C 复制
```

**方式 2：手动组合（如果找不到完整 URL）**

```
1. 找到 "Endpoint":
   us1-example-12345.upstash.io
   
2. 找到 "Port":
   6379
   
3. 找到 "Password":
   AbCdEf123456
   
4. 手动组合成：
   rediss://default:AbCdEf123456@us1-example-12345.upstash.io:6379
```

**⚠️ 重要提示**：
- 使用 `rediss://`（双 s），不是 `redis://`
- `default` 是默认用户名（不要改）
- 冒号后面是密码
- `@` 后面是主机地址
- 最后是端口号（通常是 `6379`）

---

## 第 8 步：将连接字符串添加到项目

### 打开项目的 `.env` 文件

```powershell
# 在项目根目录
cd "D:\AI project\ClawLive"

# 打开 .env 文件
code .env
# 或
notepad .env
```

### 找到 `REDIS_URL` 这一行

```bash
REDIS_URL="rediss://default:YOUR_PASSWORD@xxxxx.upstash.io:6379"
```

### 替换成你的连接字符串

```bash
# 将整个字符串替换为你从 Upstash 复制的连接字符串
REDIS_URL="rediss://default:AbCdEf123456@us1-example-12345.upstash.io:6379"
```

**⚠️ 注意**：
- 保留引号 `""`
- 确保是 `rediss://`（双 s）
- 确保没有空格
- 确保是一整行，不要换行

### 保存文件

```
Ctrl + S 保存
```

---

## 第 9 步：测试连接（可选）

### 使用 redis-cli 测试（如果已安装）

```powershell
# Windows 下可能没有 redis-cli
# 如果有，可以测试
redis-cli -u "rediss://default:YOUR_PASSWORD@xxx.upstash.io:6379"

# 连接后输入
ping
# 应该返回：PONG
```

### 或者使用 Node.js 测试

```powershell
# 在项目根目录
node --eval "const redis = require('redis'); const client = redis.createClient({ url: 'rediss://default:YOUR_PASSWORD@xxx.upstash.io:6379' }); client.connect().then(() => client.ping()).then(res => console.log('Redis:', res)).then(() => client.quit());"
```

如果看到 `Redis: PONG`，说明连接成功！

---

## ✅ 完成！你已经获取了 Redis 数据库

现在你已经配置好了：
- ✅ PostgreSQL（Supabase）
- ✅ Redis（Upstash）

### 下一步：初始化数据库并启动应用

```powershell
# 1. 进入后端目录
cd apps\server

# 2. 运行数据库迁移
pnpm exec prisma migrate deploy

# 3. 生成 Prisma Client
pnpm exec prisma generate

# 4. 返回根目录
cd ..\..

# 5. 启动应用
pnpm dev
```

### 等待启动完成

你会看到：

```
✓ Ready on http://localhost:3000
✓ Server listening on http://localhost:3001
✓ Socket.io server running
✓ Connected to PostgreSQL via Prisma
✓ Connected to Redis
```

### 访问应用

打开浏览器访问：**http://localhost:3000** 🎉

---

## 🐛 常见问题排查

### 问题 1: "ECONNREFUSED" 或 "Connection refused"

**原因**：连接字符串格式错误

**解决方案**：

1. **检查协议**：
   ```bash
   # 正确（双 s）
   rediss://default:password@host:6379
   
   # 错误（单 s）
   redis://default:password@host:6379
   ```

2. **检查格式**：
   ```bash
   # 正确格式
   rediss://default:password@us1-xxx-12345.upstash.io:6379
   
   # 常见错误
   rediss://password@us1-xxx-12345.upstash.io:6379        # ❌ 缺少 "default:"
   rediss://default@us1-xxx-12345.upstash.io:6379         # ❌ 缺少密码
   rediss://default:password@us1-xxx-12345.upstash.io     # ❌ 缺少端口
   ```

3. **重新复制连接字符串**：
   - 回到 Upstash 控制台
   - 重新复制完整的连接字符串

### 问题 2: "Authentication failed"

**原因**：密码错误

**解决方案**：

1. 回到 Upstash 控制台
2. 点击你的数据库
3. 找到 "Details" 或 "Properties"
4. 重新复制 Password
5. 更新 `.env` 文件中的 `REDIS_URL`

### 问题 3: "Connection timeout"

**原因**：防火墙或网络问题

**解决方案**：

1. **检查网络连接**：
   ```powershell
   # 测试是否能访问 Upstash
   ping us1-xxx-12345.upstash.io
   ```

2. **关闭 VPN**（如果在使用）

3. **检查防火墙**：
   - 确保 6379 端口未被阻止
   - 尝试暂时关闭防火墙测试

4. **尝试使用手机热点**（排除网络问题）

### 问题 4: 找不到连接字符串

**解决方案**：

1. 确保数据库状态是 "Active"（绿色）
2. 刷新页面（F5）
3. 查看以下几个位置：
   - "REST API" 部分下面
   - "Connection" 或 "Properties" 部分
   - "Details" 标签页
4. 如果实在找不到，手动组合：
   ```
   rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379
   ```

### 问题 5: Redis 连接成功但应用报错

**可能原因**：Socket.io Redis adapter 配置问题

**解决方案**：

查看服务器日志：
```powershell
# 查看详细错误信息
cd apps\server
pnpm run dev
```

如果看到 "Error: node_modules/@socket.io/redis-adapter"，可能需要：
```powershell
# 重新安装依赖
pnpm install --force
```

---

## 📸 关键页面截图说明

### 1. Upstash 控制台首页
- 顶部标签："Redis" | "Kafka"
- 中央或右上角：绿色按钮 "Create database"
- 左侧：数据库列表（如果已有数据库）

### 2. 创建数据库页面
- 表单标题："Create Redis Database"
- 输入框：
  - Name（数据库名称）
  - Type（类型：**Regional** 或 Global）
  - Region（区域下拉菜单）
  - Enable TLS（勾选框）
  - Eviction（下拉菜单）
- 底部：绿色按钮 "Create"

### 3. 数据库详情页面
- 顶部：数据库名称、状态、区域
- "REST API" 部分：
  - UPSTASH_REDIS_REST_URL
  - UPSTASH_REDIS_REST_TOKEN
- "Connection" 或 "Properties" 部分：
  - **Redis Connect URL** ← 复制这个
  - Endpoint
  - Port
  - Password
- 底部：数据使用统计、命令统计等

---

## 💡 关于 Upstash 免费额度

```
✅ 10,000 条命令/天
✅ 256 MB 内存
✅ 连接池
✅ 自动备份
✅ TLS/SSL 加密
✅ 全球低延迟
```

**这些额度足够**：
- 开发和测试
- 中小型应用
- ClawLive 的所有实时通信
- 100+ 并发观众

### 如何监控使用量

1. 登录 Upstash 控制台
2. 点击你的数据库
3. 查看 "Metrics" 或 "Usage" 标签
4. 监控：
   - 每日命令数
   - 内存使用
   - 连接数

### 如果超过免费额度

Upstash 会：
1. 发邮件通知你
2. 暂时限制访问
3. 你可以：
   - 优化代码减少命令数
   - 升级到付费计划（$0.2/100K 命令）
   - 创建新的免费数据库

### 优化 Redis 使用

```typescript
// 1. 使用连接池（项目已配置）
// 2. 批量操作（减少命令数）
// 3. 设置过期时间（释放内存）

// 示例：设置缓存，1 小时后过期
await redis.setex('room:123:messages', 3600, JSON.stringify(messages));
```

---

## 🎯 完成清单

检查你是否完成了所有步骤：

- [x] 注册 Upstash 账号
- [x] 创建 Redis 数据库（Regional 类型）
- [x] 选择了离你最近的区域
- [x] 启用了 TLS 加密
- [x] 复制了连接字符串（`rediss://...`）
- [x] 更新了 `.env` 文件中的 `REDIS_URL`
- [x] 保存了 `.env` 文件

### 全部完成？

🎉 **恭喜！你现在可以启动 ClawLive 了！**

---

## 🚀 下一步

### 初始化数据库并启动应用

```powershell
# 1. 进入后端目录
cd apps\server

# 2. 运行数据库迁移
pnpm exec prisma migrate deploy

# 3. 返回根目录并启动
cd ..\..
pnpm dev
```

### 访问应用

**http://localhost:3000** 🦞

### 查看完整指南

**[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)**

---

<div align="center">

## 🎊 全部完成！

你现在拥有：
- ✅ PostgreSQL 数据库（Supabase）
- ✅ Redis 缓存（Upstash）
- ✅ 完整的 ClawLive 应用

**开始你的龙虾直播之旅吧！** 🦞

</div>
