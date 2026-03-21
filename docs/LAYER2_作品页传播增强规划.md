# 第 2 层：作品页传播增强 - 详细规划

> 目标：让作品页成为可裂变的「结果卡片」—— 一句话结果 + 强 CTA + 优化分享体验

---

## 一、核心改动概览

| 模块 | 改动 | 目的 |
|------|------|------|
| 数据模型 | 新增 `resultSummary`（一句话结果） | 3 秒内让路人看懂「AI 干了什么」 |
| 创作流程 | 发布前填写 resultSummary | 引导作者产出可传播内容 |
| 作品详情页 | 显眼展示 resultSummary + 强 CTA | 提升分享转化率 |
| OG 图 | 突出 resultSummary | 社交/IM 分享时更好看 |
| 分享文案 | 使用 resultSummary 作为默认描述 | 转发时自带「钩子」 |

---

## 二、数据模型

### 2.1 新增字段

**字段名**：`resultSummary`  
**类型**：`string | undefined`  
**含义**：一句话描述 AI 达成的结果，适合转发。  

**示例**：
- 「这个 AI 帮我把 137 封邮件清到了 9 封待处理」
- 「这个 AI 用 11 分钟做完一份行业研究框架」
- 「这个 AI 自己跑完了一次跨工具工作流」

**涉及文件**：
- `apps/server/src/services/works-persistence.ts` - Work 类型定义
- `apps/server/src/api/routes/rooms-simple.ts` - works Map 的 Work 类型
- `apps/server/src/api/routes/works.ts` - 创建、更新、返回、publish 时读写
- `apps/server/src/services/recommendation.ts` - WorkWithScore 接口（可选，用于推荐加权）

### 2.2 兼容性

- 老作品无 `resultSummary`，展示时回退到 `description` 或标题
- 新增为可选字段，不破坏现有数据

---

## 三、创作流程改动

### 3.1 入口设计

**方案 A：发布前弹窗（推荐）**  
- 在 Studio 点击「发布」时，先弹出「发布前填写」对话框
- 必填/选填：`resultSummary`（建议 50 字以内）
- 示例占位：`如：这个 AI 帮我 10 分钟整理完了一份周报`
- 优点：不打断创作，发布时集中填写，心智负担小

**方案 B：创建时增加字段**  
- 在 `works/create` 表单增加「一句话结果（可选）」
- 缺点：创作前很难预知结果，通常要到和 Agent 聊完才有

**方案 C：Studio 侧边栏/顶部**  
- 在 Studio 增加可折叠的「作品信息」区域，包含 title / description / resultSummary 编辑
- 发布时校验 resultSummary 是否填写，未填则提示

**建议**：采用 **方案 A**，发布弹窗中增加 resultSummary 输入。若已有 description 且较短，可预填为 resultSummary 默认值。

### 3.2 涉及文件

- `apps/web/src/app/works/[workId]/studio/page.tsx` - 发布弹窗 + resultSummary 输入
- `apps/server/src/api/routes/works.ts` - `POST /:workId/publish` 接收 `resultSummary`
- `apps/server/src/api/routes/works.ts` - `PUT /:workId` 支持更新 resultSummary（草稿时可编辑）

---

## 四、作品详情页

### 4.1 布局结构（由上到下）

```
┌─────────────────────────────────────────────────────────┐
│ ← 返回作品列表                                    [分享] │
├─────────────────────────────────────────────────────────┤
│  【主标题】 work.title                                   │
│                                                          │
│  【一句话结果】resultSummary（醒目展示，大字号/高亮）       │  ← 新增，最显眼
│  若无则用 description，再无则隐去                         │
│                                                          │
│  作者 · 🦞 lobsterName · 👁 viewCount · 💬 messages      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  【CTA 区】让我的 AI 也试一次                             │  ← 新增
│  [创建直播间] 或 [登录后创建]                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  封面图 / 主视频                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  创作过程（对话记录）                                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 一句话结果展示

- 若有 `resultSummary`：单独一块，背景色区分（如浅紫/浅蓝），字号略大于正文
- 若无：用 `description` 兜底；若 description 过长，可截断 +「...」

### 4.3 CTA 按钮

**文案**：「让我的 AI 也试一次」  
**行为**：
- 已登录 → 跳转 `/rooms/create`
- 未登录 → 跳转 `/login?redirect=/rooms/create`

**样式**：主按钮（与「创建直播间」一致）

### 4.4 涉及文件

- `apps/web/src/app/works/[workId]/page.tsx` - 布局、resultSummary 展示、CTA
- `apps/web/src/lib/i18n/translations.ts` - 新增 `workDetail.resultSummary`, `workDetail.tryMyAI`

---

## 五、OG 图优化

### 5.1 当前

- 使用 title、description、lobsterName、author、viewCount
- 背景渐变色

### 5.2 改动

- **优先展示**：`resultSummary`（若有）
- **次选**：`description`（截断 80 字）
- **布局**：主标题 + 结果摘要各占一块，结果摘要字号略小但更突出（如加粗/不同色）

### 5.3 涉及文件

- `apps/web/src/app/works/[workId]/opengraph-image.tsx`
- API 返回需包含 `resultSummary`（当前 GET /api/works/:workId 已返回完整 work，补充字段即可）

---

## 六、分享文案

### 6.1 ShareButton / Web Share API

- 当前：复制 URL，部分场景用 `text` 参数
- 改动：若传入 `resultSummary`，作为 `text` 用于 Web Share 或复制时的提示
- 示例：分享时复制 `「这个 AI 帮我把 137 封邮件清到了 9 封」 https://clawlab.live/works/xxx`

### 6.2 涉及文件

- `apps/web/src/components/ShareButton.tsx` - 支持 `resultSummary` 作为分享文案
- `apps/web/src/app/works/[workId]/page.tsx` - 调用 ShareButton 时传入 resultSummary

---

## 七、推荐算法（可选，属第 3 层）

- 在 `scoreWork` 中：有 `resultSummary` 时加分，或根据「结果型」关键词加分
- 可后续迭代，不阻塞第 2 层

---

## 八、实施顺序

| 步骤 | 内容 | 预估 |
|------|------|------|
| 1 | 后端：Work 增加 resultSummary，持久化 + API 读写 | 0.5h |
| 2 | 后端：PUT /works/:id、POST publish 支持 resultSummary | 0.5h |
| 3 | 前端 Studio：发布弹窗增加 resultSummary 输入 | 1h |
| 4 | 前端作品详情：展示 resultSummary + CTA「让我的 AI 也试一次」 | 1h |
| 5 | OG 图：优先展示 resultSummary | 0.5h |
| 6 | ShareButton：分享文案使用 resultSummary | 0.5h |
| 7 | i18n：新增翻译 key | 0.25h |
| 8 | 联调 + 回归测试 | 0.5h |

**合计**：约 4.75 小时

---

## 九、文案与 i18n

| Key | 中文 | 英文 |
|-----|------|------|
| workDetail.resultSummary | 一句话结果 | Result in one sentence |
| workDetail.tryMyAI | 让我的 AI 也试一次 | Try with my AI |
| workDetail.resultSummaryPlaceholder | 如：这个 AI 帮我 10 分钟整理完了一份周报 | e.g. This AI helped me finish a weekly report in 10 mins |
| workDetail.publishModalTitle | 发布前填写 | Before publishing |
| workDetail.resultSummaryLabel | 一句话描述 AI 达成的结果（适合转发） | One-sentence result (shareable) |

---

## 十、验收标准

- [ ] 发布作品时可填写 resultSummary
- [ ] 作品详情页显眼展示 resultSummary（无则用 description）
- [ ] CTA「让我的 AI 也试一次」存在，未登录点击跳转登录并带回
- [ ] OG 图在社交/IM 中展示时，优先显示 resultSummary
- [ ] 分享时，复制/分享文案包含 resultSummary（若有）
- [ ] 老作品无 resultSummary 时，页面正常、无报错
