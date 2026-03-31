-- Darwin 对话 Auto-Compact：持久化滚动摘要
ALTER TABLE "LobsterConversationRow" ADD COLUMN IF NOT EXISTS "contextCompact" JSONB;
