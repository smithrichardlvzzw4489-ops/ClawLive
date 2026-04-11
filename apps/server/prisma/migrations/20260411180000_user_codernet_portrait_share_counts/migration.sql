-- GITLINK GitHub 画像页：复制链接 / 下载长图 / 系统分享 三入口累计（已登录用户）
ALTER TABLE "users" ADD COLUMN "codernetPortraitShareCopyCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "codernetPortraitShareDownloadCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "codernetPortraitShareNativeCalls" INTEGER NOT NULL DEFAULT 0;
