-- LinkedIn Sign In (OpenID Connect) — subject identifier `sub`
ALTER TABLE "users" ADD COLUMN "linkedInId" TEXT;

CREATE UNIQUE INDEX "users_linkedInId_key" ON "users"("linkedInId");
