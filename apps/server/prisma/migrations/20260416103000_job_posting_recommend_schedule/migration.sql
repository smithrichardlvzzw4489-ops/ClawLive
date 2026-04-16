-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN "firstRecommendAt" TIMESTAMP(3),
ADD COLUMN "lastWeeklyRecommendAt" TIMESTAMP(3),
ADD COLUMN "pendingRecommendHits" JSONB NOT NULL DEFAULT '[]';
