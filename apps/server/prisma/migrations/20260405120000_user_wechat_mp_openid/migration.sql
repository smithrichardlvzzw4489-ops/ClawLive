-- AlterTable
ALTER TABLE "users" ADD COLUMN "wechatMpOpenid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_wechatMpOpenid_key" ON "users"("wechatMpOpenid");
