-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN "recommendBacklogHits" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "job_postings" ADD COLUMN "recommendBootstrapStartedAt" TIMESTAMP(3);
ALTER TABLE "job_postings" RENAME COLUMN "lastWeeklyRecommendAt" TO "lastDailyRecommendAt";
