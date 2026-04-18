/**
 * 单行结构化日志，供 Railway 等仅 stdout 环境检索。
 * 搜索 token：`[clawlive-diag]`；建议再按 `area` / `event` / `jobPostingId` / `requestId` 过滤。
 */
export type RailwayDiagLevel = 'info' | 'error';

export function railwayDiag(
  payload: { area: string; event: string; level?: RailwayDiagLevel } & Record<string, unknown>,
): void {
  const { area, event, level = 'info', ...rest } = payload;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    area,
    event,
    ...rest,
  });
  const msg = `[clawlive-diag] ${line}`;
  if (level === 'error') {
    console.error(msg);
  } else {
    console.log(msg);
  }
}
