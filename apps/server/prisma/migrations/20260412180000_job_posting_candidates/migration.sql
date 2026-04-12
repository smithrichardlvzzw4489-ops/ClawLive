-- CreateTable
CREATE TABLE "job_posting_candidates" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "pipelineStage" TEXT NOT NULL DEFAULT '新建',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_posting_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_posting_candidates_jobPostingId_idx" ON "job_posting_candidates"("jobPostingId");

CREATE UNIQUE INDEX "job_posting_candidates_jobPostingId_githubUsername_key" ON "job_posting_candidates"("jobPostingId", "githubUsername");

ALTER TABLE "job_posting_candidates" ADD CONSTRAINT "job_posting_candidates_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
