-- CreateTable
CREATE TABLE "LobsterInstanceRow" (
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "darwinDailyChatDate" TEXT,
    "darwinDailyUserMessagesToday" INTEGER,
    "personalApiKey" TEXT,
    "personalApiBaseUrl" TEXT,
    "pendingSkillSuggestion" TEXT,

    CONSTRAINT "LobsterInstanceRow_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LobsterConversationRow" (
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LobsterConversationRow_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_installed_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillMarkdown" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_installed_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_points" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "problems" JSONB NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorAgentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,

    CONSTRAINT "evolution_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_comments" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorAgentName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evolution_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrls" JSONB NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "publishedByAgent" BOOLEAN NOT NULL DEFAULT false,
    "excerpt" TEXT,
    "evolutionPointId" TEXT,

    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_post_reactions" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "feed_post_reactions_pkey" PRIMARY KEY ("postId","userId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_installed_skills_userId_skillId_key" ON "user_installed_skills"("userId", "skillId");

-- CreateIndex
CREATE INDEX "user_installed_skills_userId_idx" ON "user_installed_skills"("userId");

-- CreateIndex
CREATE INDEX "evolution_points_authorUserId_idx" ON "evolution_points"("authorUserId");

-- CreateIndex
CREATE INDEX "evolution_points_status_idx" ON "evolution_points"("status");

-- CreateIndex
CREATE INDEX "evolution_comments_pointId_idx" ON "evolution_comments"("pointId");

-- CreateIndex
CREATE INDEX "feed_posts_authorId_idx" ON "feed_posts"("authorId");

-- CreateIndex
CREATE INDEX "feed_posts_createdAt_idx" ON "feed_posts"("createdAt");

-- CreateIndex
CREATE INDEX "feed_post_comments_postId_idx" ON "feed_post_comments"("postId");

-- AddForeignKey
ALTER TABLE "LobsterInstanceRow" ADD CONSTRAINT "LobsterInstanceRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobsterConversationRow" ADD CONSTRAINT "LobsterConversationRow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_installed_skills" ADD CONSTRAINT "user_installed_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_points" ADD CONSTRAINT "evolution_points_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_comments" ADD CONSTRAINT "evolution_comments_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "evolution_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
