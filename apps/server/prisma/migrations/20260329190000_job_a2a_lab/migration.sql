-- CreateTable
CREATE TABLE "job_a2a_seeker_profiles" (
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "city" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "skills" JSONB NOT NULL,
    "narrative" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_a2a_seeker_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "job_a2a_employer_profiles" (
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "jobTitle" TEXT NOT NULL,
    "city" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "skills" JSONB NOT NULL,
    "companyName" TEXT,
    "narrative" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_a2a_employer_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "job_a2a_matches" (
    "id" TEXT NOT NULL,
    "seekerUserId" TEXT NOT NULL,
    "employerUserId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_agent',
    "agentExchangeRounds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_a2a_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_a2a_agent_messages" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_a2a_agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_a2a_human_messages" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_a2a_human_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_a2a_events" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_a2a_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "job_a2a_seeker_profiles" ADD CONSTRAINT "job_a2a_seeker_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_employer_profiles" ADD CONSTRAINT "job_a2a_employer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_matches" ADD CONSTRAINT "job_a2a_matches_seekerUserId_fkey" FOREIGN KEY ("seekerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_matches" ADD CONSTRAINT "job_a2a_matches_employerUserId_fkey" FOREIGN KEY ("employerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_agent_messages" ADD CONSTRAINT "job_a2a_agent_messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "job_a2a_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_human_messages" ADD CONSTRAINT "job_a2a_human_messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "job_a2a_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_a2a_events" ADD CONSTRAINT "job_a2a_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "job_a2a_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "job_a2a_matches_seekerUserId_employerUserId_key" ON "job_a2a_matches"("seekerUserId", "employerUserId");

-- CreateIndex
CREATE INDEX "job_a2a_matches_seekerUserId_idx" ON "job_a2a_matches"("seekerUserId");

-- CreateIndex
CREATE INDEX "job_a2a_matches_employerUserId_idx" ON "job_a2a_matches"("employerUserId");

-- CreateIndex
CREATE INDEX "job_a2a_matches_status_idx" ON "job_a2a_matches"("status");

-- CreateIndex
CREATE INDEX "job_a2a_agent_messages_matchId_createdAt_idx" ON "job_a2a_agent_messages"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "job_a2a_human_messages_matchId_createdAt_idx" ON "job_a2a_human_messages"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "job_a2a_events_createdAt_idx" ON "job_a2a_events"("createdAt");

-- CreateIndex
CREATE INDEX "job_a2a_events_matchId_idx" ON "job_a2a_events"("matchId");
