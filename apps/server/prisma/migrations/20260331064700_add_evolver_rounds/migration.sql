-- CreateTable
CREATE TABLE "evolver_rounds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "roundNo" INTEGER NOT NULL,
    "summary" TEXT,
    "assessmentJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "evolver_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolver_events" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolver_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evolver_rounds_userId_startedAt_idx" ON "evolver_rounds"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "evolver_events_roundId_createdAt_idx" ON "evolver_events"("roundId", "createdAt");

-- AddForeignKey
ALTER TABLE "evolver_rounds" ADD CONSTRAINT "evolver_rounds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolver_events" ADD CONSTRAINT "evolver_events_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "evolver_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
