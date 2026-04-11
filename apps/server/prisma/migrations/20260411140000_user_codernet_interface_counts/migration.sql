-- GITLINK 三入口统计：持久化在 users 表（原 .data/codernet-interface-usage.json 可由启动时迁移合并）
ALTER TABLE "users" ADD COLUMN "codernetMinePortraitCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "codernetGithubPortraitCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "codernetLinkSearchCalls" INTEGER NOT NULL DEFAULT 0;
