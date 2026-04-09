-- AlterTable
ALTER TABLE "users" ADD COLUMN "openToOpportunities" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "openToOpportunitiesUpdatedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "jobSeekingExternalProfiles" JSONB;
ALTER TABLE "users" ADD COLUMN "jobSeekingDetectedSignals" JSONB;
