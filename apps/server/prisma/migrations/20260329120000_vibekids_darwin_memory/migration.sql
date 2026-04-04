-- VibeKids + Darwin：按用户持久化近期创作线索（非 Darwin 聊天正文）
CREATE TABLE "vibekids_darwin_memory" (
    "userId" TEXT NOT NULL,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vibekids_darwin_memory_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "vibekids_darwin_memory" ADD CONSTRAINT "vibekids_darwin_memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
