-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "location" TEXT,
    "body" TEXT NOT NULL,
    "matchTags" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_postings_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_posting_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobPostingId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_posting_notifications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_posting_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "job_postings_status_publishedAt_idx" ON "job_postings"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "job_postings_authorId_idx" ON "job_postings"("authorId");

-- CreateIndex
CREATE INDEX "job_posting_notifications_recipientId_idx" ON "job_posting_notifications"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "job_posting_notifications_jobPostingId_recipientId_key" ON "job_posting_notifications"("jobPostingId", "recipientId");
