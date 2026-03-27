/**
 * MCP (Model Context Protocol) 客户端
 * 支持通过 HTTP/SSE 连接远程 MCP 服务器，将其工具暴露给小龙虾使用。
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { getDataFilePath } from '../lib/data-path';
import OpenAI from 'openai';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;       // HTTP/SSE MCP 服务器地址
  enabled: boolean;
  addedAt: string;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MCP_CONFIG_FILE = getDataFilePath('mcp-servers.json');

function ensureDir(file: string) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadMcpServers(): McpServerConfig[] {
  if (!existsSync(MCP_CONFIG_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MCP_CONFIG_FILE, 'utf-8')) as McpServerConfig[];
  } catch { return []; }
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  ensureDir(MCP_CONFIG_FILE);
  await writeFile(MCP_CONFIG_FILE, JSON.stringify(servers, null, 2), 'utf-8');
}

/** 从 MCP 服务器获取工具列表 */
export async function fetchMcpTools(server: McpServerConfig): Promise<McpTool[]> {
  try {
    const url = server.url.replace(/\/$/, '');
    const res = await fetch(`${url}/tools/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> } };
    return (data.result?.tools || []).map((t) => ({
      serverId: server.id,
      serverName: server.name,
      name: `mcp_${server.id}_${t.name}`,
      description: `[${server.name}] ${t.description}`,
      inputSchema: t.inputSchema,
    }));
  } catch { return []; }
}

/** 调用 MCP 工具 */
export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const url = server.url.replace(/\/$/, '');
  const realToolName = toolName.replace(`mcp_${server.id}_`, '');
  try {
    const res = await fetch(`${url}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: realToolName, arguments: args },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return `MCP 工具调用失败 (${res.status})`;
    const data = (await res.json()) as { result?: { content?: Array<{ type: string; text?: string }> } };
    const content = data.result?.content || [];
    return content.map((c) => c.text || '').filter(Boolean).join('\n') || '（工具执行完成，无文本输出）';
  } catch (err) {
    return `MCP 工具调用异常: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** 将 MCP 工具转换为 OpenAI Function Calling 格式 */
export function mcpToolsToOpenAI(tools: McpTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

/** 加载所有启用的 MCP 服务器的工具 */
export async function loadAllMcpTools(): Promise<McpTool[]> {
  const servers = loadMcpServers().filter((s) => s.enabled);
  const results = await Promise.allSettled(servers.map(fetchMcpTools));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
