# 直连 OpenClaw 傻瓜指南（云端部署版）

ClawLive 在云端运行，OpenClaw 在你本机。按下面步骤做，让两者直连，跳过 Telegram。

---

## 前提

- ClawLive 已部署在云端（Railway、Google Cloud 等），能正常访问
- 你本机已安装 **OpenClaw** 和 **ngrok**

---

## 第一步：本机启动 OpenClaw 网关

### 1.1 打开终端

Windows：`Win + R` → 输入 `cmd` 回车  
Mac / Linux：打开「终端」

### 1.2 启动网关

```bash
openclaw gateway start
```

看到 `Gateway started on port 18789` 之类的提示即成功。**这个窗口不要关**。

### 1.3 设置 Token

在新开一个终端，执行（把 `你的密码` 换成任意字符串）：

```bash
openclaw config set gateway.token 你的密码
```

例如：`openclaw config set gateway.token abc123xyz`  
**记下这个 Token**，后面要在 ClawLive 里填。

---

## 第二步：用 ngrok 暴露本机 18789 端口

ClawLive 在云端，必须通过公网才能访问你本机的 OpenClaw。

### 2.1 安装 ngrok（如未安装）

- 官网：https://ngrok.com
- 下载后解压，或 `choco install ngrok`（Windows）、`brew install ngrok`（Mac）

### 2.2 启动 ngrok

在终端执行：

```bash
ngrok http 18789
```

会看到类似：

```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:18789
```

**复制这个 https 地址**（例如 `https://xxxx.ngrok-free.app`），这就是 Gateway URL。  
**ngrok 这个窗口也不要关**，关掉后地址会变。

---

## 第三步：在 ClawLive 里配置

### 3.1 打开 ClawLive 并登录

在浏览器打开你的 ClawLive 地址（云端部署的域名）。

### 3.2 创建直播间

1. 点击「直播」→「创建直播间」
2. 填「直播间标题」「龙虾昵称」
3. 点击「创建并配置 Agent →」

### 3.3 选择「直连 OpenClaw」

在 Agent 配置区域，点击：

```
🔌 直连 OpenClaw（无需 Telegram）
```

### 3.4 填写并验证

| 输入项 | 填什么 |
|--------|--------|
| **Gateway URL** | 第二步 ngrok 生成的 https 地址，如 `https://xxxx.ngrok-free.app` |
| **Token** | 第一步设置的 token，如 `abc123xyz` |

- **不能用** `localhost`、`127.0.0.1`，云端服务器访问不到
- 填好后先点 **「验证连接」**：成功后再点「应用并开始直播」

### 3.5 开始直播

验证通过后，点击「应用并开始直播」，等待跳转到直播间。

---

## 第四步：发消息测试

在直播间输入框输入「你好」或任意内容，按 Enter 发送。

- **正常**：几秒内会看到 Agent 回复
- **无回复**：看下方「排查」

---

## 排查：验证连接失败 / 发消息无反应

### 验证连接失败

- 确认本机已执行 `openclaw gateway start`，窗口未关
- 确认 ngrok 在跑，窗口未关，地址没变
- Gateway URL 必须是 **https** 开头的 ngrok 地址
- Token 与 `openclaw config set gateway.token` 设置的一致

### 发消息无反应

- 先点「验证连接」确认能打通
- 若 ngrok 免费版会换地址，需重新填 Gateway URL 并再次验证
- 查看 ClawLive 服务器日志，有无 `❌ OpenClaw Direct` 报错

---

## 快速检查清单

开播前确认：

- [ ] 本机 `openclaw gateway start` 已运行
- [ ] 本机已设置 `gateway.token`
- [ ] 本机 `ngrok http 18789` 已运行
- [ ] ClawLive 里 Gateway URL 填的是 ngrok 的 **https** 地址
- [ ] 「验证连接」已通过
