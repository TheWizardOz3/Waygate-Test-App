-- CreateEnum
CREATE TYPE "ReferenceDataStatus" AS ENUM ('active', 'inactive', 'deleted');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('pending', 'syncing', 'completed', 'failed');

-- CreateTable: reference_data
CREATE TABLE "reference_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "connection_id" UUID,
    "data_type" VARCHAR(100) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "ReferenceDataStatus" NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "synced_by_action_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reference_sync_jobs
CREATE TABLE "reference_sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "connection_id" UUID,
    "data_type" VARCHAR(100) NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "items_created" INTEGER NOT NULL DEFAULT 0,
    "items_updated" INTEGER NOT NULL DEFAULT 0,
    "items_deleted" INTEGER NOT NULL DEFAULT 0,
    "items_failed" INTEGER NOT NULL DEFAULT 0,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: reference_data unique constraint
CREATE UNIQUE INDEX "reference_data_unique_idx" ON "reference_data"("integration_id", "connection_id", "data_type", "external_id");

-- CreateIndex: reference_data indexes
CREATE INDEX "reference_data_tenant_type_idx" ON "reference_data"("tenant_id", "data_type");
CREATE INDEX "reference_data_integration_type_idx" ON "reference_data"("integration_id", "data_type");
CREATE INDEX "reference_data_connection_type_idx" ON "reference_data"("connection_id", "data_type");
CREATE INDEX "reference_data_last_synced_idx" ON "reference_data"("last_synced_at");
CREATE INDEX "reference_data_status_idx" ON "reference_data"("status");

-- CreateIndex: reference_sync_jobs indexes
CREATE INDEX "reference_sync_jobs_integration_status_idx" ON "reference_sync_jobs"("integration_id", "status");
CREATE INDEX "reference_sync_jobs_tenant_created_idx" ON "reference_sync_jobs"("tenant_id", "created_at" DESC);
CREATE INDEX "reference_sync_jobs_connection_status_idx" ON "reference_sync_jobs"("connection_id", "status");

-- AddForeignKey: reference_data -> tenants
ALTER TABLE "reference_data" ADD CONSTRAINT "reference_data_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_data -> integrations
ALTER TABLE "reference_data" ADD CONSTRAINT "reference_data_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_data -> connections
ALTER TABLE "reference_data" ADD CONSTRAINT "reference_data_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_data -> actions
ALTER TABLE "reference_data" ADD CONSTRAINT "reference_data_synced_by_action_id_fkey" FOREIGN KEY ("synced_by_action_id") REFERENCES "actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: reference_sync_jobs -> tenants
ALTER TABLE "reference_sync_jobs" ADD CONSTRAINT "reference_sync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_sync_jobs -> integrations
ALTER TABLE "reference_sync_jobs" ADD CONSTRAINT "reference_sync_jobs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_sync_jobs -> connections
ALTER TABLE "reference_sync_jobs" ADD CONSTRAINT "reference_sync_jobs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
