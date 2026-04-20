-- AlterTable
ALTER TABLE "job_posting_candidates" ADD COLUMN "intro" TEXT;
ALTER TABLE "job_posting_candidates" ADD COLUMN "matchScore" DOUBLE PRECISION;
ALTER TABLE "job_posting_candidates" ADD COLUMN "systemRecommendedAt" TIMESTAMP(3);
