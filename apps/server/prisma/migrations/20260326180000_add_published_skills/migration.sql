-- CreateTable
CREATE TABLE "published_skills" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "skillMarkdown" TEXT NOT NULL,
    "tags" TEXT[],
    "creditCostPerCall" INTEGER NOT NULL DEFAULT 0,
    "platformFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "published_skills_authorId_idx" ON "published_skills"("authorId");

-- CreateIndex
CREATE INDEX "published_skills_status_createdAt_idx" ON "published_skills"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "published_skills" ADD CONSTRAINT "published_skills_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
