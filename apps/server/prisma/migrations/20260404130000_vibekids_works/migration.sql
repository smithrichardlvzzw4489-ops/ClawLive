-- CreateTable
CREATE TABLE "vibekids_works" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL DEFAULT 'unified',
    "prompt" TEXT,
    "kind" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vibekids_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vibekids_work_favorite_dedupe" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vibekids_work_favorite_dedupe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vibekids_works_userId_createdAt_idx" ON "vibekids_works"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "vibekids_works_published_createdAt_idx" ON "vibekids_works"("published", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "vibekids_work_favorite_dedupe_workId_idx" ON "vibekids_work_favorite_dedupe"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "vibekids_work_favorite_dedupe_clientId_workId_key" ON "vibekids_work_favorite_dedupe"("clientId", "workId");

-- AddForeignKey
ALTER TABLE "vibekids_works" ADD CONSTRAINT "vibekids_works_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vibekids_work_favorite_dedupe" ADD CONSTRAINT "vibekids_work_favorite_dedupe_workId_fkey" FOREIGN KEY ("workId") REFERENCES "vibekids_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
