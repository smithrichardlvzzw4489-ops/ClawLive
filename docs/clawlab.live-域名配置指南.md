# clawlab.live 域名配置指南

本指南帮助你将 ClawLive 前端绑定到自定义域名 `clawlab.live`。

## 架构说明

- **前端**：Vercel → 绑定 `clawlab.live`
- **后端**：Railway → 继续使用 `*.up.railway.app`（无需改）
- **CORS**：后端已内置允许 `clawlab.live`，无需额外配置

---

## 一、在 Vercel 添加自定义域名

### 1. 进入 Vercel 项目

1. 打开 [vercel.com](https://vercel.com) 并登录
2. 进入 **clawlive-web**（或你的前端项目）
3. 点击 **Settings** → **Domains**

### 2. 添加域名

1. 在输入框输入 `clawlab.live`
2. 点击 **Add**
3. Vercel 会显示 DNS 配置说明（见下一步）

### 3. 可选：同时添加 www

如需支持 `www.clawlab.live`，再添加 `www.clawlab.live`。

---

## 二、在域名注册商配置 DNS

到你购买 `clawlab.live` 的注册商（如 Cloudflare、阿里云、腾讯云、Namecheap 等）的 DNS 管理页面，添加以下记录：

### 根域名 clawlab.live

| 类型 | 名称 | 值 | TTL |
|------|------|-----|-----|
| **A** | `@` 或留空 | `76.76.21.21` | 3600 |

> 若注册商不支持根域名 A 记录，可使用 **ALIAS** 或 **ANAME** 指向 `cname.vercel-dns.com`（部分注册商支持）

### www 子域名（可选）

| 类型 | 名称 | 值 | TTL |
|------|------|-----|-----|
| **CNAME** | `www` | `cname.vercel-dns.com` | 3600 |

### 常见注册商说明

- **Cloudflare**：添加 A 记录 `@` → `76.76.21.21`，关闭代理（灰色云）以加快生效
- **阿里云 / 腾讯云**：添加 A 记录，主机记录填 `@`
- **Vercel 注册**：若域名在 Vercel 购买，可一键使用 Vercel DNS，无需手动添加

---

## 三、验证与生效

1. **Vercel 验证**：回到 Vercel Domains 页面，等待状态变为 **Valid**
2. **DNS 生效**：通常 5 分钟～48 小时，国内常见 10～30 分钟
3. **访问测试**：在浏览器打开 `https://clawlab.live`

---

## 四、无需修改的配置

以下配置**保持不变**：

| 位置 | 变量 | 说明 |
|------|------|------|
| Vercel | `NEXT_PUBLIC_API_URL` | 继续指向 Railway 后端地址 |
| Vercel | `NEXT_PUBLIC_SOCKET_URL` | 同上 |
| Railway | `CORS_ORIGIN` | 可选，代码已内置允许 clawlab.live |

---

## 五、可选：后端使用 api.clawlab.live

若希望后端也使用自定义域名（如 `https://api.clawlab.live`）：

### 1. Railway 添加自定义域名

1. Railway → clawlive-server → **Settings** → **Networking**
2. 在 **Custom Domain** 添加 `api.clawlab.live`
3. Railway 会给出 CNAME 目标（如 `xxx.up.railway.app`）

### 2. 在域名注册商添加 CNAME

| 类型 | 名称 | 值 |
|------|------|-----|
| **CNAME** | `api` | Railway 提供的目标（如 `clawlive-server-production.up.railway.app`） |

### 3. 更新 Vercel 环境变量

```
NEXT_PUBLIC_API_URL=https://api.clawlab.live
NEXT_PUBLIC_SOCKET_URL=https://api.clawlab.live
```

保存后重新部署前端。后端 CORS 已支持 `*.clawlab.live`，无需额外配置。

---

## 六、常见问题

### 1. 域名添加后显示「Invalid Configuration」

- 检查 DNS 记录是否正确添加
- 使用 [dnschecker.org](https://dnschecker.org) 查询 `clawlab.live` 的 A 记录是否已生效

### 2. 访问显示「无法连接服务器」

- 确认 Vercel 环境变量 `NEXT_PUBLIC_API_URL` 正确
- 后端 CORS 已内置 clawlab.live，一般无需修改 Railway 变量

### 3. HTTPS 证书

- Vercel 会自动为自定义域名申请 SSL 证书，通常几分钟内完成
