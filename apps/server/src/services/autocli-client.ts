/**
 * AutoCLI.ai / OpenCLI-RS 云端对接（与 https://autocli.ai 一致）。
 *
 * 说明：公开站点列表接口在对方服务器上存在 slash 重定向环，故不在此拉取站点列表；
 * 完整「站点命令 + 结构化输出」需用户本机安装 opencli-rs（见 help 文案）。
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

/** 供 Darwin 在无法执行本机 CLI 时使用的说明（与官网一致） */
export const OPENCLI_AUTOCLOUD_HELP = `## AutoCLI.ai / OpenCLI-RS（与官网一致）

- **官网**：https://autocli.ai  
- **开源 CLI**：https://github.com/nashsu/opencli-rs  
- **一键 Skill**：\`npx skills add https://github.com/nashsu/opencli-rs-skill\`

### 在 ClawLive 云端 Darwin 里

- 可使用工具 **autocli**（action=stats）查看 **AutoCLI 云端统计**（站点数、命令数等）。
- **结构化拉取任意网站数据**依赖本机 **opencli-rs**（及可选 Chrome 扩展、\`opencli-rs auth\` 获取 Token）。云端无法直接执行你电脑上的二进制。
- 若只需读公开网页正文，优先用 **url_read**（Jina）；需要 JSON/表格化站点数据时，请在本机安装 opencli-rs 后按官网步骤操作。

### 本机快速开始（摘自上游）

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/nashsu/opencli-rs/main/scripts/install.sh | sh
opencli-rs auth
opencli-rs generate https://example.com/ --goal list --ai
opencli-rs <site> <command> --format json
\`\`\`

环境变量（上游）：\`AUTOCLI_API_BASE\` 默认 \`https://www.autocli.ai\`。
`;
