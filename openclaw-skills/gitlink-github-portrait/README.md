# GITLINK GitHub 画像 Skill（OpenClaw 小龙虾）

给 **OpenClaw 小龙虾** 用：聊天里给一个 **GitHub 用户名**，生成 **开发者技术画像**。

---

## 安装（复制到小龙虾技能目录）

### 从本仓库（你在开发 ClawLive 时）

**Windows PowerShell**（在 ClawLive 仓库根目录执行）：

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.openclaw\skills" | Out-Null
Copy-Item -Recurse -Force "openclaw-skills\gitlink-github-portrait" "$env:USERPROFILE\.openclaw\skills\gitlink-github-portrait"
```

**Mac / Linux**：

```bash
mkdir -p ~/.openclaw/skills && cp -r openclaw-skills/gitlink-github-portrait ~/.openclaw/skills/gitlink-github-portrait
```

### 从 GitHub 拉独立包（发给用户时）

```bash
mkdir -p ~/.openclaw/skills && git clone https://github.com/smithrichardlvzzw4489-ops/gitprofile-skill.git ~/.openclaw/skills/gitprofile-skill
```

装完 **重启 OpenClaw / 小龙虾**；若客户端里要 **启用技能**，勾选对应目录名即可。

---

## 使用

对小龙虾发（替换用户名）：

```text
帮我查一下 GitHub 用户 octocat 的技术画像
```

---

## 效果

对话总结 + 可能出现的 GITLINK 画像网页链接。

装不好 → 找负责环境的人；不必改 skill 内文件。

MIT
