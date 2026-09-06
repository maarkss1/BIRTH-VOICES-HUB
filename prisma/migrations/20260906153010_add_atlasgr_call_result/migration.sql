-- CreateTable
CREATE TABLE "AtlasGRCallResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "leadId" TEXT,
    "callId" TEXT NOT NULL,
    "status" TEXT,
    "completed" BOOLEAN,
    "callLength" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtlasGRCallResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtlasGRCallResult_callId_key" ON "AtlasGRCallResult"("callId");

-- CreateIndex
CREATE INDEX "AtlasGRCallResult_tenantId_idx" ON "AtlasGRCallResult"("tenantId");

-- CreateIndex
CREATE INDEX "AtlasGRCallResult_leadId_idx" ON "AtlasGRCallResult"("leadId");

-- AddForeignKey
ALTER TABLE "AtlasGRCallResult" ADD CONSTRAINT "AtlasGRCallResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
