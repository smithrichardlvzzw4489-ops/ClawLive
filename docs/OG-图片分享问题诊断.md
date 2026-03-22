# OG 图片分享预览问题 - 诊断与修复

## 问题现象

在 Twitter/X、微信等平台分享作品链接时，预览显示**通用占位图**（白底、灰色图标），而非自定义的粉红渐变 + 龙虾 Logo 设计。

## 根因定位过程

### 1. 验证 HTML 元数据

```powershell
(Invoke-WebRequest -Uri "https://www.clawlab.live/works/work-test-123").Content | Select-String "og:image"
```

**结果**：`og:image` 的 URL 正确，指向 `https://www.clawlab.live/works/work-test-123/opengraph-image`。

### 2. 验证图片 URL 响应

```powershell
Invoke-WebRequest -Uri "https://www.clawlab.live/works/work-test-123/opengraph-image" -OutFile "og-test.png"
(Get-Item "og-test.png").Length
```

**结果**：`0` 字节 —— 图片返回空内容。

### 3. 对比静态 OG 路由

```powershell
Invoke-WebRequest -Uri "https://www.clawlab.live/og-default" -OutFile "og-default-test.png"
(Get-Item "og-default-test.png").Length
```

**结果**：`179879` 字节（约 180KB）—— `/og-default` 返回有效图片。

### 4. 结论

| 路由 | 实现方式 | 返回结果 |
|------|----------|----------|
| `/og-default` | Route Handler (`route.tsx`) | ✅ 有效图片 |
| `/works/[workId]/opengraph-image` | 文件约定 (`opengraph-image.tsx`) | ❌ 0 字节 |

**根因**：Next.js 在**动态路由**中使用 `opengraph-image.tsx` 存在已知问题（[Issue #57349](https://github.com/vercel/next.js/issues/57349)），导致生成的图片为空。

## 修复方案

将 `opengraph-image.tsx` 文件约定改为 **Route Handler**：

1. **删除** `apps/web/src/app/works/[workId]/opengraph-image.tsx`
2. **新建** `apps/web/src/app/works/[workId]/opengraph-image/route.tsx`
3. 在 Route Handler 中使用 `params` 从 URL 获取 `workId`，逻辑与原实现一致
4. 在 layout 中，当 work 不存在时也返回 og:image，避免无预览

## 修复后验证

部署后执行：

```powershell
Invoke-WebRequest -Uri "https://www.clawlab.live/works/你的作品ID/opengraph-image" -OutFile "og-check.png"
(Get-Item "og-check.png").Length
```

应得到非零字节数（约 100KB+）。然后使用带 `?og=2` 的链接重新分享，Twitter/微信会重新抓取预览。
