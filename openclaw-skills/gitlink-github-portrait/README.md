# GITLINK GitHub 画像 Skill

用 **GitHub 用户名** 生成 **开发者技术画像**（对话总结 + 可选网页卡片）。

---

## 第一步：安装（复制粘贴）

在 **ClawLive 仓库根目录** 打开终端，执行下面**其中一种**。

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force -Path ".cursor\skills" | Out-Null
Copy-Item -Recurse -Force "openclaw-skills\gitlink-github-portrait" ".cursor\skills\gitlink-github-portrait"
```

### Mac / Linux

```bash
mkdir -p .cursor/skills && cp -r openclaw-skills/gitlink-github-portrait .cursor/skills/gitlink-github-portrait
```

### 从 GitHub 单独拉 skill（与主仓库无关时）

```bash
mkdir -p .cursor/skills && git clone https://github.com/smithrichardlvzzw4489-ops/gitprofile-skill.git .cursor/skills/gitprofile-skill
```

装好后**重开 Cursor 或项目**。

---

## 第二步：使用

在 Agent 对话里输入（把 `octocat` 换成目标用户名）：

```text
帮我查一下 GitHub 用户 octocat 的技术画像
```

---

## 你会得到什么

- 对话里的文字解读。  
- 可能附带 GITLINK 上的画像页面链接。

装不好或报错 → 交给负责环境的人排查；不必改 skill 内文件。

MIT
