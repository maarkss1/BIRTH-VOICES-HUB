/*
  Warnings:

  - Added the required column `tenantId` to the `APIKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "APIKey" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "APIKey_tenantId_idx" ON "APIKey"("tenantId");

-- CreateIndex
CREATE INDEX "APIKey_createdByUserId_idx" ON "APIKey"("createdByUserId");

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
