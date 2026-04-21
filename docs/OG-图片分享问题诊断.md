# OG 图片分享预览问题 - 诊断与修复

## 问题现象

在 Twitter/X、微信等平台分享作品链接时，预览显示**通用占位图**（白底、灰色图标），而非自定义的粉红渐变 + 龙虾 Logo 设计。

## 根因（已定位）

| 路由 | 条件 | 结果 |
|------|------|------|
| `/og-default` | Edge，无 fetch，ImageResponse | ✅ 约 130KB |
| `/works/[id]/og-diagnostic` | Edge，仅 params，ImageResponse | ✅ 约 92KB |
| `/works/[id]/og-fetch-test` | Edge，fetch API，返回 JSON | ✅ 正常 |
| `/works/[id]/og` | Edge，fetch + ImageResponse | ❌ 0 字节 |
| `/works/[id]/og` | Node，fetch + ImageResponse | ❌ 500 |

**结论**：Vercel Edge 中，**fetch 与 ImageResponse 在同一 handler 内组合使用时**，响应体为空。单独使用任一生效。属运行时兼容问题，非配置错误。

## 根因定位过程（历史）

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

## 当前方案

使用静态 `/og-default`，metadata 中 og:image 指向该 URL。作品页分享均显示统一品牌图（粉红渐变+龙虾），标题/描述仍为作品级。

## 动态 OG 的替代思路（若需作品级自定义图）

1. **预生成**：发布时调用 API 生成图并存 OSS，metadata 指向静态 URL
2. **第三方**：Cloudinary、imgix 等生成动态 OG
3. **升级等待**：关注 Next.js/Vercel 对 Edge+fetch+ImageResponse 的修复

## 验证

部署后执行：

```powershell
Invoke-WebRequest -Uri "https://www.clawlab.live/works/你的作品ID/og" -OutFile "og-check.png"
(Get-Item "og-check.png").Length
```

应得到非零字节数（约 100KB+）。然后使用带 `?og=2` 的链接重新分享，Twitter/微信会重新抓取预览。
