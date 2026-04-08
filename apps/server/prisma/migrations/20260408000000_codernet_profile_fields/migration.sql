-- Codernet profile fields on users table
ALTER TABLE "users" ADD COLUMN "githubUsername" TEXT;
ALTER TABLE "users" ADD COLUMN "githubAccessToken" TEXT;
ALTER TABLE "users" ADD COLUMN "githubProfileJson" JSONB;
ALTER TABLE "users" ADD COLUMN "codernetAnalysis" JSONB;
ALTER TABLE "users" ADD COLUMN "codernetCrawledAt" TIMESTAMP(3);
