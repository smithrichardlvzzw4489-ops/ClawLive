-- CreateTable
CREATE TABLE "site_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" VARCHAR(300) NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_messages_recipientId_createdAt_idx" ON "site_messages"("recipientId", "createdAt" DESC);
CREATE INDEX "site_messages_senderId_createdAt_idx" ON "site_messages"("senderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "site_messages" ADD CONSTRAINT "site_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_messages" ADD CONSTRAINT "site_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
