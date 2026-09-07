-- CreateTable
CREATE TABLE "TenantAiConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAiConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantAiConsent_tenantId_key" ON "TenantAiConsent"("tenantId");

-- CreateIndex
CREATE INDEX "TenantAiConsent_tenantId_idx" ON "TenantAiConsent"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantAiConsent" ADD CONSTRAINT "TenantAiConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
