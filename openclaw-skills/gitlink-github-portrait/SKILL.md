---
name: gitlink-github-portrait
description: >-
  使用 GITLINK（clawlab.live）公开 API，根据任意 GitHub 用户名生成技术画像（爬取 + AI 分析）。
  在用户给出 GitHub handle、要「查开发者画像 / Codernet / 技术侧写」时使用。
---

# GITLINK：任意 GitHub 用户画像

## 目标

用户提供一个 **GitHub 用户名**（如 `octocat`），你应触发服务端爬取与分析，并在完成后用返回的 **结构化 JSON** 向用户总结画像；必要时附上 **网页版卡片链接**。

## 基址

默认生产环境：

- API 根：`https://clawlab.live`
- 人类可读页面：`https://clawlab.live/codernet/github/<githubUsername>`

自建实例时，将下面所有 URL 的主机替换为对应 `origin`。

## 认证

- **公开画像接口不需要 `clw_` Agent Key。** 直接调用即可。
- 若请求头里带有 **平台用户 JWT**（网站登录态那种 Bearer token，由服务端 `JWT_SECRET` 签发），服务端会按用户维度消耗 **`profile_lookup`** 月度额度；无 token 或 token 无效时，不经过该额度分支。
- **不要**把 Agent Key `clw_...` 当作这里的 Bearer：它不会被当作用户 JWT，对 Codernet 公开接口通常无作用。

## 流程（必须按顺序）

1. **规范化用户名**：去掉 `@`，trim，GitHub 用户名不区分大小写时可转小写（服务端会存小写缓存键）。
2. **触发爬取**

   ```http
   POST https://clawlab.live/api/codernet/github/<githubUsername>
   ```

   常见响应 JSON：
   - `{ "status": "started", "message": "..." }` — 已开始后台任务
   - `{ "status": "ready", "message": "Already cached." }` — 缓存仍有效（约 30 分钟内），可直接 GET 取全量
   - `{ "status": "already_running", "message": "..." }` — 已在跑，继续轮询 GET
   - `429` + `QUOTA_EXCEEDED` — 带用户 JWT 时额度用尽

3. **轮询结果**（间隔建议 **2～4 秒**，总等待可到数分钟，视 GitHub / 多平台扫描与 AI 分析负载而定）

   ```http
   GET https://clawlab.live/api/codernet/github/<githubUsername>
   ```

   直到得到其一：
   - **`status: "ready"`** — 成功；体内含 `crawl`、`analysis`、`multiPlatform`（可能为 `null`）、`avatarUrl`、`cachedAt`
   - **`status: "pending"`** — 仍在进行；可读 `progress.stage`、`progress.percent`、`progress.detail` 向用户简短汇报进度
   - **`404`** + `{ "status": "not_found" }` — 尚未有缓存且当前也无进行中的任务（应先 POST 再 GET）
   - **`progress.stage === "error"`** — 失败；将 `progress.error` 简要告知用户

4. **向用户呈现**
   - 优先用 **`analysis`** 字段组织回答（见下节字段说明）。
   - 给出页面链接：`https://clawlab.live/codernet/github/<githubUsername>`，便于对方查看完整卡片与前端展示。

## `analysis` 主要字段（成功时）

用于自然语言总结的核心字段通常包括：

| 字段 | 含义 |
|------|------|
| `oneLiner` | 一句话概括 |
| `sharpCommentary` | 锐评 / 深度点评 |
| `techTags` | 技术标签数组 |
| `languageDistribution` | `{ language, percent }[]` |
| `capabilityQuadrant` | `frontend` / `backend` / `infra` / `ai_ml` 数值（能力分布） |
| `platformsUsed` | 识别到的平台列表 |
| `multiPlatformInsights` | 多平台指标（SO、npm、PyPI、HF、LeetCode 等，可能部分为空） |
| `activityDeepDive` | 按年叙述、按仓库深层摘要、`commitPatterns` 等（若存在则丰富回答） |
| `aiEngagement` | AI 相关参与度评分对象（若存在） |

`crawl` 中含原始 GitHub 侧数据（仓库列表、近期 commit 样本等），需要事实核对或列举仓库时可引用。

## 错误与重试

- **429**：若带用户 JWT 且额度用尽，说明需用户换账号下月再试或去掉 JWT 再试（视产品策略；以响应体 `message` 为准）。
- **多次 pending**：继续轮询，不要重复疯狂 POST；若已是 `already_running`，只轮询即可。
- **用户不存在或 GitHub API 限制**：可能体现在 `error` 或 crawl 失败；如实说明。

## 与「自己的画像」区别

- **任意 GitHub 用户**：本文档的 `POST/GET /api/codernet/github/:username`。
- **当前登录用户在站内的绑定 GitHub 画像刷新**：使用需登录的 `POST /api/codernet/crawl`（用户 OAuth），与 Agent 公开查他人 **不是** 同一路径。

## 自检清单

- [ ] 已 `POST` 触发（或确认 `already_running` / 缓存 `ready`）
- [ ] 已轮询 `GET` 至 `ready` 或明确 `error`
- [ ] 回答中使用了 `analysis` 的关键字段，并附上 `/codernet/github/...` 链接（如适用）
