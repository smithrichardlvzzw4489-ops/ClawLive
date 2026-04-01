/**
 * AutoCLI.ai 统计与 OpenCLI-RS 说明（与 https://autocli.ai 一致）。
 *
 * 「网站→结构化 CLI」在 **ClawLive 服务端** 通过配置 OPENCLI_RS_BIN 执行 opencli-rs（见 opencli-server.ts）；
 * 统计接口仍可向 AutoCLI 云端拉取公开数据（可选）。
 */

const DEFAULT_BASE = 'https://www.autocli.ai';

export function getAutocliApiBase(): string {
  const raw = process.env.AUTOCLI_API_BASE || process.env.AUTOCLI_API_BASE_URL || DEFAULT_BASE;
  return raw.replace(/\/$/, '');
}

export interface AutocliStats {
  total_sites: number;
  total_commands: number;
  total_categories?: number;
  active_users?: number;
  total_uses?: number;
}

export async function fetchAutocliStats(): Promise<AutocliStats> {
  const base = getAutocliApiBase();
  const url = `${base}/api/stats`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ClawLive-Darwin/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`AutoCLI stats HTTP ${resp.status}${t ? `: ${t.slice(0, 120)}` : ''}`);
  }
  return (await resp.json()) as AutocliStats;
}

/** Darwin 侧说明：服务端部署 opencli-rs + 可选 AutoCLI Token */
export const OPENCLI_SERVER_HELP = `## AutoCLI.ai / OpenCLI-RS（服务端架构）

- **官网**：https://autocli.ai  
- **开源 CLI**：https://github.com/nashsu/opencli-rs  
- **一键 Skill（本机 Agent）**：\`npx skills add https://github.com/nashsu/opencli-rs-skill\`

### ClawLive 服务端（推荐）

1. 在 **与 Node 同一台机器或同一容器** 中安装 opencli-rs（见上游 README）。  
2. 设置环境变量 **\`OPENCLI_RS_BIN\`** 为可执行文件绝对路径（如 \`/usr/local/bin/opencli-rs\`）。  
3. Darwin 工具 **\`autocli\`（action=run）** 会在**服务端子进程**中执行白名单预设（Hacker News / dev.to / Lobsters / arxiv 等），输出 JSON。  
4. 需要 **Chrome 扩展** 的站点命令无法在纯服务端运行；此类需求请用 **\`browser_*\`** 或在本机 OpenClaw 使用 opencli-rs。

### 可选：AutoCLI 社区统计

- **\`autocli\`（action=stats）** 拉取 AutoCLI 公开统计（需能访问 \`AUTOCLI_API_BASE\`，默认 https://www.autocli.ai）。  
- **\`opencli-rs auth\`** 与 **\`generate --ai\`** 仍按上游文档在**有浏览器的环境**中执行；适配器可同步到 AutoCLI 社区。

### 读网页正文

- 使用 **\`url_read\`**（Jina Reader，经服务端代请求）或 **\`browser_get_content\`**（Playwright 会话）。

环境变量：**\`AUTOCLI_API_BASE\`**（可选）、**\`OPENCLI_RS_BIN\`**（服务端跑 opencli 预设时必填）。
`;
