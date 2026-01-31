-- CreateEnum
CREATE TYPE "VariableType" AS ENUM ('string', 'number', 'boolean', 'json');

-- CreateTable
CREATE TABLE "variables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "connection_id" UUID,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "value_type" "VariableType" NOT NULL DEFAULT 'string',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_value" BYTEA,
    "environment" VARCHAR(50),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variables_tenant_idx" ON "variables"("tenant_id");

-- CreateIndex
CREATE INDEX "variables_connection_idx" ON "variables"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "variables_unique_idx" ON "variables"("tenant_id", "connection_id", "key", "environment");

-- AddForeignKey
ALTER TABLE "variables" ADD CONSTRAINT "variables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variables" ADD CONSTRAINT "variables_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
