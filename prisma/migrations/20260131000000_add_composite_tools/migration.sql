-- CreateEnum
CREATE TYPE "CompositeToolRoutingMode" AS ENUM ('rule_based', 'agent_driven');

-- CreateEnum
CREATE TYPE "CompositeToolStatus" AS ENUM ('draft', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "RoutingConditionType" AS ENUM ('contains', 'equals', 'matches', 'starts_with', 'ends_with');

-- CreateTable
CREATE TABLE "composite_tools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "routing_mode" "CompositeToolRoutingMode" NOT NULL,
    "default_operation_id" UUID,
    "unified_input_schema" JSONB NOT NULL DEFAULT '{}',
    "tool_description" TEXT,
    "tool_success_template" TEXT,
    "tool_error_template" TEXT,
    "status" "CompositeToolStatus" NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composite_tool_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "composite_tool_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "operation_slug" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "parameter_mapping" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composite_tool_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "composite_tool_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "condition_type" "RoutingConditionType" NOT NULL,
    "condition_field" VARCHAR(100) NOT NULL,
    "condition_value" TEXT NOT NULL,
    "case_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composite_tools_tenant_id_idx" ON "composite_tools"("tenant_id");

-- CreateIndex
CREATE INDEX "composite_tools_status_idx" ON "composite_tools"("status");

-- CreateIndex
CREATE UNIQUE INDEX "composite_tools_tenant_slug_idx" ON "composite_tools"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "composite_tool_operations_composite_tool_id_idx" ON "composite_tool_operations"("composite_tool_id");

-- CreateIndex
CREATE INDEX "composite_tool_operations_action_id_idx" ON "composite_tool_operations"("action_id");

-- CreateIndex
CREATE UNIQUE INDEX "composite_tool_operations_slug_idx" ON "composite_tool_operations"("composite_tool_id", "operation_slug");

-- CreateIndex
CREATE UNIQUE INDEX "composite_tool_operations_action_idx" ON "composite_tool_operations"("composite_tool_id", "action_id");

-- CreateIndex
CREATE INDEX "routing_rules_composite_tool_priority_idx" ON "routing_rules"("composite_tool_id", "priority");

-- CreateIndex
CREATE INDEX "routing_rules_operation_id_idx" ON "routing_rules"("operation_id");

-- AddForeignKey
ALTER TABLE "composite_tools" ADD CONSTRAINT "composite_tools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_tools" ADD CONSTRAINT "composite_tools_default_operation_id_fkey" FOREIGN KEY ("default_operation_id") REFERENCES "composite_tool_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_tool_operations" ADD CONSTRAINT "composite_tool_operations_composite_tool_id_fkey" FOREIGN KEY ("composite_tool_id") REFERENCES "composite_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_tool_operations" ADD CONSTRAINT "composite_tool_operations_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_composite_tool_id_fkey" FOREIGN KEY ("composite_tool_id") REFERENCES "composite_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "composite_tool_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
