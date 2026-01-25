-- Migration: Add Connections for Multi-App Support
-- This migration adds the Connection entity to enable multiple consuming apps 
-- to connect to the same integration with separate credentials.

-- =============================================================================
-- Step 1: Create ConnectionStatus enum
-- =============================================================================
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'error', 'disabled');

-- =============================================================================
-- Step 2: Create connections table
-- =============================================================================
CREATE TABLE "connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "base_url" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- Step 3: Add connection_id to integration_credentials (nullable for migration)
-- =============================================================================
ALTER TABLE "integration_credentials" ADD COLUMN "connection_id" UUID;

-- =============================================================================
-- Step 4: Add connection_id to request_logs (nullable, for tracking)
-- =============================================================================
ALTER TABLE "request_logs" ADD COLUMN "connection_id" UUID;

-- =============================================================================
-- Step 5: Create indexes for connections
-- =============================================================================
CREATE UNIQUE INDEX "connections_tenant_integration_slug_idx" ON "connections"("tenant_id", "integration_id", "slug");
CREATE INDEX "connections_tenant_id_idx" ON "connections"("tenant_id");
CREATE INDEX "connections_integration_id_idx" ON "connections"("integration_id");
CREATE INDEX "connections_status_idx" ON "connections"("status");

-- =============================================================================
-- Step 6: Create index for credentials connection lookup
-- =============================================================================
CREATE INDEX "credentials_connection_id_idx" ON "integration_credentials"("connection_id");

-- =============================================================================
-- Step 7: Create index for request_logs connection lookup
-- =============================================================================
CREATE INDEX "logs_connection_created_idx" ON "request_logs"("connection_id", "created_at" DESC);

-- =============================================================================
-- Step 8: Add foreign key constraints for connections
-- =============================================================================
ALTER TABLE "connections" ADD CONSTRAINT "connections_tenant_id_fkey" 
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connections" ADD CONSTRAINT "connections_integration_id_fkey" 
    FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Step 9: Add foreign key constraint for credentials -> connections
-- =============================================================================
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_connection_id_fkey" 
    FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Step 10: Add foreign key constraint for request_logs -> connections (SetNull on delete)
-- =============================================================================
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_connection_id_fkey" 
    FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Step 11: Data Migration - Create default connections for existing integrations
-- =============================================================================
-- For each integration, create a default "Primary" connection
INSERT INTO "connections" ("id", "tenant_id", "integration_id", "name", "slug", "is_primary", "status", "metadata", "created_at", "updated_at")
SELECT 
    gen_random_uuid(),
    i."tenant_id",
    i."id",
    'Default',
    'default',
    true,
    'active'::"ConnectionStatus",
    '{}',
    NOW(),
    NOW()
FROM "integrations" i
WHERE NOT EXISTS (
    SELECT 1 FROM "connections" c 
    WHERE c."integration_id" = i."id"
);

-- =============================================================================
-- Step 12: Link existing credentials to their integration's default connection
-- =============================================================================
UPDATE "integration_credentials" ic
SET "connection_id" = c."id"
FROM "connections" c
WHERE c."integration_id" = ic."integration_id"
  AND c."is_primary" = true
  AND ic."connection_id" IS NULL;

