/** 未指定名称时的 Agent 展示名（微信自动开通、免问卷申请等） */
export function defaultDarwinDisplayName(): string {
  const v = process.env.DEFAULT_DARWIN_NAME?.trim();
  return v && v.length > 0 ? v : 'GITLINK';
}
