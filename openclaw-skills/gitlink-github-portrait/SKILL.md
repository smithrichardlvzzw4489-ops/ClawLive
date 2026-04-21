---
name: gitlink-github-portrait
description: >-
  使用 GITLINK（gitlink.top）Open API 与 Agent 自己的 API Key（clw_），根据任意 GitHub 用户名生成技术画像。
  在用户给出 GitHub handle、要「查开发者画像 / Codernet / 技术侧写」时使用。
---

# GITLINK：任意 GitHub 用户画像（Agent Key）

## 目标

用户提供一个 **GitHub 用户名**（如 `octocat`），你应使用 **Agent 自己的 API Key**（`clw_...`）调用 Open API，触发服务端爬取与分析，并在完成后用返回的 **结构化 JSON** 向用户总结画像；必要时附上 **网页版卡片链接**。

**不要**使用人类浏览器里的 **用户 JWT** 或把终端用户的登录态当作 Bearer——本 Skill 只走 Agent Key。

## 基址与 Key

默认生产环境：

- API 根：`https://gitlink.top`
- 人类可读页面：`https://gitlink.top/codernet/github/<githubUsername>`

**Agent Key 获取**：引导用户在 https://gitlink.top/agent-keys 生成 Key，由 **运行你的宿主**（而非对话里的终端用户）安全保存，例如环境变量 `GITLINK_AGENT_API_KEY=clw_...`。你在调用 API 时使用该值，**不要**向用户复述完整 Key。

## 认证（必须）

所有请求：

```http
Authorization: Bearer clw_<Agent API Key>
```

- Key 无效或缺失 → `401`
- **额度**：每次 **实际触发新的** 公开画像爬取时，会扣 **创建该 Key 的 GITLINK 用户** 的 `profile_lookup` 月度额度（与 Key 绑定，不是对话对象的个人 JWT）

## 流程（必须按顺序）

1. **规范化用户名**：去掉 `@`，trim；可转小写（与服务端缓存键一致）。
2. **触发爬取**

   ```http
   POST https://gitlink.top/api/open/codernet/github/<githubUsername>
   Authorization: Bearer clw_<你的 Agent Key>
   ```

   常见响应 JSON：
   - `{ "status": "started", "message": "..." }` — 已开始后台任务
   - `{ "status": "ready", "message": "Already cached." }` — 缓存仍有效（约 30 分钟内），可直接 GET 取全量
   - `{ "status": "already_running", "message": "..." }` — 已在跑，继续轮询 GET
   - `429` + `QUOTA_EXCEEDED` — Key 所属用户本月画像额度用尽

3. **轮询结果**（间隔建议 **2～4 秒**，总等待可到数分钟）

   ```http
   GET https://gitlink.top/api/open/codernet/github/<githubUsername>
   Authorization: Bearer clw_<你的 Agent Key>
   ```

   直到得到其一：
   - **`status: "ready"`** — 成功；体内含 `crawl`、`analysis`、`multiPlatform`（可能为 `null`）、`avatarUrl`、`cachedAt`
   - **`status: "pending"`** — 仍在进行；可读 `progress.stage`、`progress.percent`、`progress.detail` 向用户简短汇报进度
   - **`404`** + `{ "status": "not_found" }` — 尚无缓存且无进行中任务（应先 POST 再 GET）
   - **`progress.stage === "error"`** — 失败；将 `progress.error` 简要告知用户

4. **向用户呈现**
   - 优先用 **`analysis`** 字段组织回答（见下节）。
   - 给出页面链接：`https://gitlink.top/codernet/github/<githubUsername>`。

## `analysis` 主要字段（成功时）

| 字段 | 含义 |
|------|------|
| `oneLiner` | 一句话概括 |
| `sharpCommentary` | 锐评 / 深度点评 |
| `techTags` | 技术标签数组 |
| `languageDistribution` | `{ language, percent }[]` |
| `capabilityQuadrant` | `frontend` / `backend` / `infra` / `ai_ml` |
| `platformsUsed` | 识别到的平台列表 |
| `multiPlatformInsights` | 多平台指标（可能部分为空） |
| `activityDeepDive` | 按年 / 按仓库叙述等（若存在） |
| `aiEngagement` | AI 参与度评分（若存在） |

`crawl` 中含原始 GitHub 侧数据，需要列仓库或核对事实时可引用。

## 与旧版公开路径的区别

- **本 Skill**：仅使用 **`/api/open/codernet/github/...` + `Authorization: Bearer clw_...`**。
- **`/api/codernet/github/...`**（无 Open 前缀）仍为站内/匿名兼容接口；**不要**在本 Skill 中改用该路径代替 Open API，以免与「只用 Agent Key」的要求混淆。

## 错误与重试

- **401**：检查宿主配置的 Key 是否以 `clw_` 开头、是否被撤销。
- **429**：Key 所属账号画像额度用尽；如实告知，不要改用他人 JWT「绕过」。
- **pending**：继续轮询；勿高频重复 POST（已为 `already_running` 时只轮询 GET）。

## 与「自己的画像」区别

- **任意 GitHub 用户**：本文档的 `POST/GET /api/open/codernet/github/:username`。
- **当前登录用户绑定 GitHub 的站内刷新**：`POST /api/codernet/crawl`（用户 OAuth），与本 Skill **无关**。

## 自检清单

- [ ] 所有请求均带 `Authorization: Bearer clw_...`（Agent Key，非用户 JWT）
- [ ] 已 `POST` 触发（或 `already_running` / 缓存 `ready`）
- [ ] 已轮询 `GET` 至 `ready` 或明确 `error`
- [ ] 回答使用 `analysis` 要点，并附上 `/codernet/github/...` 页面链接（如适用）
