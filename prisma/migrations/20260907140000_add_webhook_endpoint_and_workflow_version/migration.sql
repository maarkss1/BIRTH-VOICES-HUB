/*
  Migração puramente aditiva (Agente 01 — Onda 5): duas tabelas novas, nenhuma alteração em tabela
  existente.

  - TenantWebhookEndpoint: pedido por .agents/handoffs/onda-5/05-para-01-schema-webhook-endpoint.md
    (Agente 05). Persiste endpoints de webhook configuráveis por tenant admin; secretHash é sempre
    o hash SHA-256 do segredo, nunca o texto plano.
  - WorkflowVersion: pedido por .agents/handoffs/onda-5/07-para-01-schema-workflow-version.md
    (Agente 07). Histórico de publish navegável para Workflow; substitui, a partir desta migração,
    o mecanismo interino baseado em `Workflow.metadata.publishedVersions` — sem backfill retroativo
    do JSON antigo, que permanece congelado e não é lido pela tabela nova.
*/

-- CreateTable
CREATE TABLE "TenantWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastDeliveryStatus" TEXT,

    CONSTRAINT "TenantWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantWebhookEndpoint_tenantId_idx" ON "TenantWebhookEndpoint"("tenantId");

-- CreateIndex
CREATE INDEX "WorkflowVersion_workflowId_idx" ON "WorkflowVersion"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");

-- AddForeignKey
ALTER TABLE "TenantWebhookEndpoint" ADD CONSTRAINT "TenantWebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
