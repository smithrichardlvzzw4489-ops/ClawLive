-- AlterTable: add GitHub OAuth user id
ALTER TABLE "users" ADD COLUMN "githubId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");
