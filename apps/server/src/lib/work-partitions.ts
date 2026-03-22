/**
 * 作品分区（参考 OpenClaw Skills 分类）
 * 分区必选，含「其它」兜底
 */
export const WORK_PARTITIONS = [
  { id: 'productivity', nameKey: 'productivity' },
  { id: 'writing', nameKey: 'writing' },
  { id: 'coding', nameKey: 'coding' },
  { id: 'data', nameKey: 'data' },
  { id: 'documents', nameKey: 'documents' },
  { id: 'communication', nameKey: 'communication' },
  { id: 'search', nameKey: 'search' },
  { id: 'marketing', nameKey: 'marketing' },
  { id: 'media', nameKey: 'media' },
  { id: 'automation', nameKey: 'automation' },
  { id: 'notes', nameKey: 'notes' },
  { id: 'calendar', nameKey: 'calendar' },
  { id: 'ai', nameKey: 'ai' },
  { id: 'finance', nameKey: 'finance' },
  { id: 'smart_home', nameKey: 'smart_home' },
  { id: 'other', nameKey: 'other' },
] as const;

export type WorkPartitionId = (typeof WORK_PARTITIONS)[number]['id'];

export const DEFAULT_PARTITION: WorkPartitionId = 'other';

export function isValidPartition(id: string): id is WorkPartitionId {
  return WORK_PARTITIONS.some((p) => p.id === id);
}
