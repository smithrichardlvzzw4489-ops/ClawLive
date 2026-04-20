-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN "recommendIgnoredGithubUsernames" JSONB NOT NULL DEFAULT '[]';
