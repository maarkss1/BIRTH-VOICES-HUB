/*
  Warnings:

  - Added the required column `tenantId` to the `APIKey` table.

  Deploy-safety note (fail-closed, not fail-loud): `APIKey` existed as dead schema before this
  change — no route or service ever wrote to it (see commit c33841c, "flag APIKey/.../AIProvider
  as missing tenantId before first use") — so no *legitimate* row can exist anywhere. But a plain
  `ADD COLUMN ... NOT NULL` with no default still aborts outright against any table that is not
  empty, which would fail a real `prisma migrate deploy` if a stray/test row ever slipped in,
  turning a data-safety measure into a deploy blocker instead. Add the column nullable first, purge
  any row that cannot be assigned a tenant (by construction, every existing row — there is no tenant
  to backfill from, since the column never existed), then enforce NOT NULL. On a genuinely empty
  table (the expected case) the DELETE is a no-op and this is equivalent to the direct approach.
*/
-- AlterTable
ALTER TABLE "APIKey" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "tenantId" TEXT;

-- No legitimate row can have a tenant to backfill (see note above) — any survivor is unusable
-- dead data from before tenant scoping existed and must not block enforcing NOT NULL below.
DELETE FROM "APIKey" WHERE "tenantId" IS NULL;

-- AlterTable
ALTER TABLE "APIKey" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "APIKey_tenantId_idx" ON "APIKey"("tenantId");

-- CreateIndex
CREATE INDEX "APIKey_createdByUserId_idx" ON "APIKey"("createdByUserId");

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
