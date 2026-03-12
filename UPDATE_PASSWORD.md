# 🔑 重置 Supabase 密码后的配置步骤

## 第 1 步：在 Supabase 重置密码

1. 访问：https://supabase.com/dashboard/projects
2. 点击你的项目（clawlive）
3. Settings > Database
4. 找到 "Reset Database Password" 部分
5. 点击 "Generate a password" 生成新密码
6. **⚠️ 重要：立即复制并保存这个密码！**
7. 点击 "Reset password"
8. 等待 5-10 秒

---

## 第 2 步：获取新的连接字符串

密码重置后：

1. 在同一页面，向上滚动到 "Connection string"
2. Method: 确保选择 "Session pooler"
3. 你会看到更新后的连接字符串
4. 直接复制整个 URI

格式应该是：
```
postgresql://postgres.enbkexuusexqpqydbkuf:新密码@aws-0-us-west-2.pooler.supabase.com:5432/postgres
```

---

## 第 3 步：更新 .env 文件

### 打开 .env 文件

```powershell
notepad "d:\AI project\ClawLive\apps\server\.env"
```

### 更新 DATABASE_URL

找到第 3 行，替换为新的连接字符串：

```bash
DATABASE_URL="postgresql://postgres.enbkexuusexqpqydbkuf:新密码@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
```

**⚠️ 注意**：
- 新生成的密码通常只包含字母和数字
- 不需要 URL 编码
- 保持一整行，不要换行
- 保留引号

### 保存文件

Ctrl+S 保存

---

## 第 4 步：测试连接

```powershell
cd "d:\AI project\ClawLive\apps\server"
pnpm exec prisma db pull
```

### 成功标志

```
✔ Introspected 0 tables and 0 enums
```

---

## 第 5 步：运行迁移

```powershell
pnpm exec prisma migrate deploy
pnpm exec prisma generate
cd ..\..
pnpm dev
```

---

## 🆘 如果还是失败

1. 确认密码重置成功（Supabase 会有通知）
2. 等待 10-20 秒让密码生效
3. 检查连接字符串格式是否正确
4. 确保没有多余的空格或换行
5. 告诉我具体的错误信息

---

## 💡 提示

- 新密码通常是 20-30 位的字母数字组合
- 示例：`AbCd1234EfGh5678IjKl9012`
- 不包含特殊字符，避免了 URL 编码问题
- 更安全，更易于配置

---

继续下一步：[QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)
