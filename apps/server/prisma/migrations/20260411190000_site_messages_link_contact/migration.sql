-- CreateTable
CREATE TABLE "site_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'link',

    CONSTRAINT "site_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_contact_pending" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetGithubUsername" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_contact_pending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_messages_recipientId_createdAt_idx" ON "site_messages"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "site_messages_senderId_idx" ON "site_messages"("senderId");

-- CreateIndex
CREATE INDEX "link_contact_pending_targetGithubUsername_idx" ON "link_contact_pending"("targetGithubUsername");

-- AddForeignKey
ALTER TABLE "site_messages" ADD CONSTRAINT "site_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_messages" ADD CONSTRAINT "site_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_contact_pending" ADD CONSTRAINT "link_contact_pending_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
