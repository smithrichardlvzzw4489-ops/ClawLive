# 直连 OpenClaw 傻瓜指南（云端部署版）

ClawLive 在云端，OpenClaw 在你本机。**照着下面每一步操作**，每步都有具体命令，按顺序做即可直连，无需 Telegram。

> **无需改 OpenClaw 配置**：ClawLive 使用 Gateway 默认 WebSocket API，直接启动网关即可。

---

## 一、你需要有的东西

- [ ] ClawLive 已部署在云端，能打开网页
- [ ] 本机已安装 **OpenClaw**
- [ ] 本机已安装 **ngrok**（推荐；`choco install ngrok` 或 `brew install ngrok`）。若无，可用 `npx localtunnel --port 18789`（需 Node.js，易 408）

---

## 二、全流程傻瓜操作（一步步做）

> **执行命令**：在终端输入或粘贴命令后，按 **Enter（回车）** 才会执行。

> **注意**：第 2 步（网关）、第 4 步（穿透）执行后的窗口要**一直开着**，不要关。

---

### 第 1 步：打开终端

- **Windows**：按 `Win + R` → 输入 `cmd` → 按回车
- **Mac / Linux**：打开「终端」应用

---

### 第 2 步：启动 OpenClaw 网关

**操作**：在终端里输入或粘贴下面命令，按 **Enter** 执行。

```
openclaw gateway start
```

**你会看到**：类似 `Gateway started on port 18789` 的提示 → 说明成功。

→ **这个终端窗口不要关**，保持运行。接下来**再开一个新的终端窗口**做第 3 步。

**若失败**：提示找不到命令 → OpenClaw 未安装或未加入 PATH。

---

### 第 3 步：设置 Token

**操作**：在**新开的终端**里输入或粘贴下面命令，按 **Enter** 执行。

> 把 `abc123` 换成你自定义的密码，自己记住，后面要在 ClawLive 里填。

```
openclaw config set gateway.token abc123
```

**你会看到**：没有报错即成功。记下你设的 `abc123`（或你换成的密码），第 8 步要用。

---

**若你之前已经设置过 Token**（例如 Telegram 在用），不要执行上面命令，改用下面命令**读取**：

```
openclaw config get gateway.token
```

输入后按 **Enter** 执行，把终端**输出的那串字符**记下来或复制，第 8 步要用。

---

### 第 4 步：启动内网穿透

> **推荐 ngrok**（localtunnel 易 408 超时）。本机执行 `ngrok http 18789`，复制输出的 https 地址；若未安装：`choco install ngrok`（Windows）或 `brew install ngrok`（Mac）。

**操作**：**再开一个终端**（第 2 步的网关窗口还在运行），输入或粘贴下面命令，按 **Enter** 执行。

```
ngrok http 18789
```

**你会看到**：在输出里找到 **Forwarding** 一行，类似：

```
Forwarding   https://a1b2c3d4-e5f6.ngrok-free.app -> http://localhost:18789
```

**立刻做**：复制 `https://` 开头、到 `.ngrok-free.app` 结尾的那一串，后面第 7 步要粘贴到 ClawLive。

→ **这个终端窗口也不要关**，保持运行。

---

**若本机无 ngrok**，可用 localtunnel（零安装，但易 408）：

```
npx localtunnel --port 18789
```

复制输出的 `https://xxx.loca.lt` 或 `https://xxx.localtunnel.me` 地址。若仍 408，换 ngrok。

---

### 第 5 步：打开 ClawLive 并创建直播间

**操作**：用浏览器打开你的 ClawLive 地址（云端部署的网址），然后：

1. 点击「直播」→「创建直播间」
2. 填写「直播间标题」「龙虾昵称」
3. 点击「创建并配置 Agent →」

---

### 第 6 步：选择直连 OpenClaw

**操作**：在 Agent 配置页面，找到并点击：

```
🔌 直连 OpenClaw（无需 Telegram）
```

---

### 第 7 步：填写 Gateway URL

**操作**：在 **Gateway URL** 输入框里，粘贴第 4 步复制的地址。

- 正确示例：`https://xyz-abcd-1234.localtunnel.me` 或 `https://eight-coins-love.loca.lt`
- 错误：末尾不要加 `/`，不能填 `localhost` 或 `127.0.0.1`

---

### 第 8 步：填写 Token

**操作**：在 **Token** 输入框里，粘贴第 3 步设置或读取的 token（例如 `abc123`）。

---

### 第 9 步：验证连接

**操作**：点击 **「验证连接」** 按钮。

- **成功**：出现「连接成功」→ 继续第 10 步
- **失败**：检查第 2 步、第 4 步的终端窗口是否还在运行；Gateway URL、Token 是否填对

---

### 第 10 步：开始直播

**操作**：点击 **「应用并开始直播」**，等待页面跳转到直播间。

---

### 第 11 步：发消息测试

**操作**：在直播间输入框输入「你好」，按 **Enter** 发送。

- **正常**：几秒内会看到 Agent 回复
- **无回复**：看下方「排查」

---

## 三、开播前快速检查

在点「验证连接」之前，确认：

| 序号 | 检查项 |
|------|--------|
| ① | 第 2 步的 `openclaw gateway start` 终端**还在运行** |
| ② | 第 4 步的 ngrok（或 localtunnel）终端**还在运行** |
| ③ | Gateway URL 填的是 ngrok/localtunnel 输出的**完整 https 地址** |
| ④ | Token 与第 3 步设置或读取的**完全一致** |

---

## 四、其他穿透方案（若 ngrok 不可用）

### localtunnel（零安装，需 Node.js，易 408）

1. 终端输入 `npx localtunnel --port 18789`，按 Enter 执行
2. 复制输出的 `https://xxx.loca.lt` 或 `https://xxx.localtunnel.me`
3. 填到 Gateway URL（第 7 步）
4. 若遇 408，换 ngrok

---

### Cloudflare Tunnel

1. 安装：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. 终端输入 `cloudflared tunnel --url http://localhost:18789`，按 Enter 执行
3. 在输出里找 `https://xxx.trycloudflare.com` 地址，第 7 步填到 Gateway URL

---

### Tailscale（本机和云端都装了 Tailscale 时）

1. 本机和 ClawLive 所在机器加入同一 Tailscale 网络
2. 终端输入 `openclaw config set gateway.bind 0.0.0.0`，按 Enter 执行
3. 本机 Tailscale IP 类似 `100.x.x.x`，第 7 步 Gateway URL 填：`http://100.x.x.x:18789`

---

### bore（单文件，无 Node 依赖）

1. 下载：https://github.com/ekzhang/bore
2. 终端输入 `bore local 18789 --to bore.pub`，按 Enter 执行
3. 把输出的公网 URL 在第 7 步填到 Gateway URL

---

## 五、排查

### 验证连接失败 / HTTP 408 超时

**HTTP 408 根本原因**：localtunnel 存在已知缺陷（[GitHub #673](https://github.com/localtunnel/localtunnel/issues/673)）：约 60 秒后，客户端与服务端 socket 会不同步，服务端无法与本地隧道通信，返回 408。首次请求也可能因云端→本机路径延迟而超时。

- 确认第 2 步、第 4 步的终端**都没关**
- 确认 Gateway URL 是穿透工具**当前输出的地址**（localtunnel / ngrok 每次重启会换）
- 确认 Token 与 `openclaw config get gateway.token` 输出一致
- **HTTP 408 时**：建议**改用 ngrok**（localtunnel 问题无官方修复）：
  - 本机执行 `ngrok http 18789`，复制输出的 https 地址
  - 填到 Gateway URL，重新验证
  - 若本机无 ngrok：`choco install ngrok`（Windows）或 `brew install ngrok`（Mac）

### 发消息无反应

- 先点「验证连接」，确认能通过（验证用 `/health`，发消息用 WebSocket API）
- 若穿透工具重启过，地址可能变了，需重新填 Gateway URL 并再次验证
- 看 ClawLive 服务器日志：`❌ OpenClaw Direct` 或 `Agent 回复失败`，会同时推送错误到聊天区
- 确认本机 OpenClaw gateway 和 ngrok 窗口**都在运行**

### 连接关闭 / 超时

- 检查穿透工具（ngrok/localtunnel）是否支持 WebSocket（ngrok 支持；localtunnel 可能不稳定）
- 若 localtunnel 易 408，建议改用 ngrok
