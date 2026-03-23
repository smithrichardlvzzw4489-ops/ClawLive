# 直连 OpenClaw 傻瓜指南

跳过 Telegram、飞书、微信，让 ClawLive 直接和 OpenClaw 对话。按下面步骤一步一步来，照着做就行。

---

## 第一步：你手上需要有什么

在开始之前，确认你已经：

| 序号 | 东西 | 怎么检查 |
|------|------|----------|
| 1 | 已安装 Node.js 20+ | 打开终端输入 `node -v`，能看到类似 `v20.x.x` |
| 2 | 已安装 pnpm | 输入 `pnpm -v`，能看到版本号 |
| 3 | ClawLive 项目能跑起来 | 能打开 http://localhost:3000 并登录 |
| 4 | 已安装 OpenClaw | 输入 `openclaw --version` 能看到版本 |

如果第 4 条没有，先去装 OpenClaw： https://github.com/openclaw/openclaw

---

## 第二步：启动 OpenClaw 的「网关」

OpenClaw 的网关是负责接收请求、调用 Agent 的组件，必须先跑起来。

### 2.1 打开第一个终端

- Windows：按 `Win + R`，输入 `cmd` 回车，或直接打开「命令提示符」
- Mac / Linux：打开「终端」(Terminal)

### 2.2 启动网关

在终端里输入（一行一行来）：

```bash
openclaw gateway start
```

如果成功，你会看到类似：

```
Gateway started on port 18789
```

**说明**：默认端口是 `18789`，后面会用到。

### 2.3 确认网关在跑

再打开一个终端，输入：

```bash
curl http://localhost:18789/status
```

- 如果能返回一串 JSON（里面有 `status`、`version` 等），说明网关正常。
- 如果是「无法连接」「 refused」之类，说明网关没起来，回到 2.2 重新启动。

---

## 第三步：给网关设置一个 Token

Token 用来验证身份，防止别人随便调用你的 OpenClaw。

### 3.1 设置 Token

在终端输入（把 `你的密码` 换成你随便想的一个字符串，例如 `abc123xyz`）：

```bash
openclaw config set gateway.token 你的密码
```

例如：

```bash
openclaw config set gateway.token abc123xyz
```

### 3.2 记住这个值

- **Token**：你刚刚设置的 `你的密码`（例如 `abc123xyz`）
- **Gateway 地址**：`http://localhost:18789`（如果 OpenClaw 和 ClawLive 在同一台电脑）

如果 OpenClaw 跑在另一台电脑，把 `localhost` 换成那台电脑的 IP，例如：`http://192.168.1.100:18789`。

---

## 第四步：在 ClawLive 创建直播间

### 4.1 启动 ClawLive

如果还没启动，在 ClawLive 项目根目录执行：

```bash
pnpm dev
```

然后打开浏览器访问：http://localhost:3000

### 4.2 登录

- 已有账号：直接登录  
- 没有账号：先注册，再登录

### 4.3 进入创建直播间页面

1. 点击顶部导航的「直播」
2. 点击右上角「创建直播间」按钮  
   （或在首页找到创建直播间的入口）

### 4.4 填基本信息

1. **直播间标题**：随便填，例如「我的测试直播间」
2. **龙虾昵称**：例如「小龙」
3. 点击「创建并配置 Agent →」

---

## 第五步：配置「直连 OpenClaw」

创建完直播间后，页面会跳到「Agent 配置」区域。

### 5.1 选直播模式（可选）

- 视频直播：需要摄像头  
- 语音直播：只用麦克风  

按你需要选一个。

### 5.2 选「直连 OpenClaw」

在 Agent 配置区域，找到并点击：

```
🔌 直连 OpenClaw（无需 Telegram）
```

### 5.3 填两个必填项

会出现两个输入框：

| 输入项 | 填什么 | 示例 |
|--------|--------|------|
| **Gateway URL** | OpenClaw 网关地址 | `http://localhost:18789` |
| **Token** | 第三步设置的 token | `abc123xyz` |

- Gateway URL 不要漏掉 `http://` 或 `https://`
- 末尾不要多打斜杠（`/`），例如不要写成 `http://localhost:18789/`
- Token 要和你用 `openclaw config set gateway.token` 设置的完全一致

### 5.4 应用并开始直播

填好后，点击绿色按钮：

```
应用并开始直播
```

如果配置正确，会提示「直连 OpenClaw 已配置！正在开始直播...」，然后自动跳转到直播间页面。

---

## 第六步：发消息测试

### 6.1 找到输入框

在直播间页面，下方会有一个输入消息的输入框（通常是蓝色或带边框）。

### 6.2 发一条消息

在输入框里输入，例如：

```
你好，请介绍一下你自己
```

按 **Enter** 发送。

### 6.3 看结果

- **正常情况**：
  - 你的消息会立刻出现在聊天区（偏右或用户气泡）
  - 等几秒，Agent 的回复会出现在左边（Agent 气泡）

- **如果一直没回复**：
  - 看下面的「常见问题」
  - 看 ClawLive 后台日志里有没有报错

---

## 常见问题

### 1. 点击「应用并开始直播」后提示「配置失败」

- 检查 Gateway URL 是否正确，能不能在浏览器打开 `http://localhost:18789/status`
- 检查 Token 是否和 `openclaw config set gateway.token` 设置的一致
- 确认 OpenClaw 网关还在运行（`openclaw gateway start` 的窗口不要关）

### 2. 消息发出去了，但 Agent 不回复

- 确认 OpenClaw 网关在跑：`curl http://localhost:18789/status` 有正常返回
- 如果 ClawLive 在服务器、OpenClaw 在你本机，要把 `localhost` 改成你电脑的 IP，并确保端口 18789 没被防火墙挡住
- 查看 ClawLive 后端控制台或日志，是否有 `❌ OpenClaw Direct` 相关错误

### 3. 页面上没看到「直连 OpenClaw」选项

- 确认你用的是一个包含直连功能的 ClawLive 版本
- 刷新页面，清除浏览器缓存再试

### 4. OpenClaw 和 ClawLive 不在同一台电脑

- **Gateway URL** 填 OpenClaw 所在电脑的 IP，例如：`http://192.168.1.100:18789`
- 确保那台电脑的 18789 端口对外开放，且防火墙允许访问
- 同一局域网内一般可以直接访问；跨网需要做端口映射或内网穿透

---

## 快速检查清单

开始直播前，打勾确认：

- [ ] OpenClaw 网关已启动（`openclaw gateway start`）
- [ ] 已设置 gateway.token
- [ ] `curl http://localhost:18789/status` 能返回 JSON
- [ ] ClawLive 已登录
- [ ] 创建直播间时选了「直连 OpenClaw」
- [ ] Gateway URL 和 Token 都填对了

全部打勾后，再发消息测试，一般就能正常对话。
