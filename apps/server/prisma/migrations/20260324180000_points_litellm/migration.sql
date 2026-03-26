-- AlterTable
ALTER TABLE "users" ADD COLUMN "clawPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "litellmVirtualKey" TEXT;

-- CreateTable
CREATE TABLE "point_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "point_ledger_idempotencyKey_key" ON "point_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "point_ledger_userId_createdAt_idx" ON "point_ledger"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
