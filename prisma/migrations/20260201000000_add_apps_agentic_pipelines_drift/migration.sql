-- Baseline migration for models added via `prisma db push` after the composite_tools migration.
-- Covers: App flow (5 tables), Agentic tools (2 tables), Pipelines (4 tables),
-- Async jobs (2 tables), Drift/Maintenance (2 tables), and missing ALTER columns.
--
-- For existing dev databases where these tables already exist, run:
--   npx prisma migrate resolve --applied 20260201000000_add_apps_agentic_pipelines_drift

-- =============================================================================
-- ENUMS
-- =============================================================================

-- CreateEnum
CREATE TYPE "AgenticToolExecutionMode" AS ENUM ('parameter_interpreter', 'autonomous_agent');

-- CreateEnum
CREATE TYPE "AgenticToolStatus" AS ENUM ('draft', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "AgenticToolExecutionStatus" AS ENUM ('success', 'error', 'timeout');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('draft', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "PipelineStepToolType" AS ENUM ('simple', 'composite', 'agentic');

-- CreateEnum
CREATE TYPE "StepOnError" AS ENUM ('fail_pipeline', 'continue', 'skip_remaining');

-- CreateEnum
CREATE TYPE "PipelineExecutionStatus" AS ENUM ('running', 'completed', 'failed', 'timeout', 'cancelled');

-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ConnectSessionStatus" AS ENUM ('pending', 'completed', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "DriftSeverity" AS ENUM ('info', 'warning', 'breaking');

-- CreateEnum
CREATE TYPE "DriftReportStatus" AS ENUM ('detected', 'acknowledged', 'resolved', 'dismissed');

-- =============================================================================
-- ALTER EXISTING TABLES (missing columns)
-- =============================================================================

-- AlterTable: integrations — add drift and maintenance config
ALTER TABLE "integrations" ADD COLUMN "drift_config" JSONB;
ALTER TABLE "integrations" ADD COLUMN "maintenance_config" JSONB;

-- AlterTable: connections — add app_id for consuming app association
ALTER TABLE "connections" ADD COLUMN "app_id" UUID;

-- AlterTable: request_logs — add app_id and app_user_id for per-app tracking
ALTER TABLE "request_logs" ADD COLUMN "app_id" UUID;
ALTER TABLE "request_logs" ADD COLUMN "app_user_id" UUID;

-- AlterTable: health_checks — add user credential health stats
ALTER TABLE "health_checks" ADD COLUMN "user_credential_health" JSONB;

-- AlterTable: reference_data — add app_user_credential_id for per-user reference data
ALTER TABLE "reference_data" ADD COLUMN "app_user_credential_id" UUID;

-- AlterTable: reference_sync_jobs — add app_user_credential_id for per-user sync
ALTER TABLE "reference_sync_jobs" ADD COLUMN "app_user_credential_id" UUID;

-- =============================================================================
-- APP FLOW TABLES
-- =============================================================================

-- CreateTable
CREATE TABLE "apps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "api_key_hash" VARCHAR(255) NOT NULL,
    "api_key_index" VARCHAR(64) NOT NULL,
    "status" "AppStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_integration_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "encrypted_client_id" BYTEA,
    "encrypted_client_secret" BYTEA,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" UUID NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "email" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "credential_type" "CredentialType" NOT NULL,
    "encrypted_data" BYTEA NOT NULL,
    "expires_at" TIMESTAMP(3),
    "encrypted_refresh_token" BYTEA,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CredentialStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connect_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "connection_id" UUID,
    "token" VARCHAR(255) NOT NULL,
    "redirect_url" TEXT,
    "status" "ConnectSessionStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connect_sessions_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- AGENTIC TOOL TABLES
-- =============================================================================

-- CreateTable
CREATE TABLE "agentic_tools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "execution_mode" "AgenticToolExecutionMode" NOT NULL,
    "embedded_llm_config" JSONB NOT NULL DEFAULT '{}',
    "system_prompt" TEXT NOT NULL,
    "tool_allocation" JSONB NOT NULL DEFAULT '{}',
    "context_config" JSONB NOT NULL DEFAULT '{}',
    "input_schema" JSONB NOT NULL DEFAULT '{}',
    "tool_description" TEXT,
    "safety_limits" JSONB NOT NULL DEFAULT '{"maxToolCalls": 10, "timeoutSeconds": 300, "maxTotalCost": 1.0}',
    "status" "AgenticToolStatus" NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentic_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentic_tool_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agentic_tool_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_request" JSONB NOT NULL,
    "llm_calls" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "tool_calls" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "result" JSONB,
    "status" "AgenticToolExecutionStatus" NOT NULL,
    "error" JSONB,
    "total_cost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "trace_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agentic_tool_executions_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- PIPELINE TABLES
-- =============================================================================

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "input_schema" JSONB NOT NULL DEFAULT '{}',
    "output_mapping" JSONB NOT NULL DEFAULT '{}',
    "tool_description" TEXT,
    "tool_success_template" TEXT,
    "tool_error_template" TEXT,
    "safety_limits" JSONB NOT NULL DEFAULT '{"maxCostUsd": 5, "maxDurationSeconds": 1800}',
    "reasoning_config" JSONB NOT NULL DEFAULT '{}',
    "status" "PipelineStatus" NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "tool_id" UUID,
    "tool_type" "PipelineStepToolType",
    "tool_slug" VARCHAR(200),
    "input_mapping" JSONB NOT NULL DEFAULT '{}',
    "on_error" "StepOnError" NOT NULL DEFAULT 'fail_pipeline',
    "retry_config" JSONB NOT NULL DEFAULT '{"maxRetries": 0, "backoffMs": 1000}',
    "timeout_seconds" INTEGER NOT NULL DEFAULT 300,
    "condition" JSONB,
    "reasoning_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reasoning_prompt" TEXT,
    "reasoning_config" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "state" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "status" "PipelineExecutionStatus" NOT NULL DEFAULT 'running',
    "current_step_number" INTEGER NOT NULL DEFAULT 1,
    "total_steps" INTEGER NOT NULL,
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "error" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_execution_id" UUID NOT NULL,
    "pipeline_step_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "status" "StepExecutionStatus" NOT NULL DEFAULT 'pending',
    "resolved_input" JSONB,
    "tool_output" JSONB,
    "reasoning_output" JSONB,
    "error" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_executions_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- ASYNC JOB TABLES
-- =============================================================================

-- CreateTable
CREATE TABLE "async_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progress_details" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 300,
    "next_run_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "async_job_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "async_job_items_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- DRIFT & MAINTENANCE TABLES
-- =============================================================================

-- CreateTable
CREATE TABLE "drift_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "fingerprint" VARCHAR(255) NOT NULL,
    "issue_code" VARCHAR(50) NOT NULL,
    "severity" "DriftSeverity" NOT NULL,
    "status" "DriftReportStatus" NOT NULL DEFAULT 'detected',
    "field_path" VARCHAR(255) NOT NULL,
    "expected_type" VARCHAR(50),
    "current_type" VARCHAR(50),
    "description" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL,
    "scan_count" INTEGER NOT NULL DEFAULT 1,
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drift_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "severity" VARCHAR(20) NOT NULL,
    "current_input_schema" JSONB NOT NULL,
    "current_output_schema" JSONB NOT NULL,
    "proposed_input_schema" JSONB,
    "proposed_output_schema" JSONB,
    "changes" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "drift_report_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affected_tools" JSONB,
    "description_suggestions" JSONB,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "reverted_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_proposals_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- INDEXES: Apps
-- =============================================================================

-- CreateIndex
CREATE UNIQUE INDEX "apps_api_key_hash_key" ON "apps"("api_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "apps_api_key_index_key" ON "apps"("api_key_index");

-- CreateIndex
CREATE UNIQUE INDEX "apps_tenant_id_slug_key" ON "apps"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "apps_tenant_id_idx" ON "apps"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_integration_configs_app_id_integration_id_key" ON "app_integration_configs"("app_id", "integration_id");

-- CreateIndex
CREATE INDEX "app_integration_configs_app_id_idx" ON "app_integration_configs"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_app_id_external_id_key" ON "app_users"("app_id", "external_id");

-- CreateIndex
CREATE INDEX "app_users_app_id_idx" ON "app_users"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_credentials_connection_id_app_user_id_key" ON "app_user_credentials"("connection_id", "app_user_id");

-- CreateIndex
CREATE INDEX "app_user_credentials_connection_id_idx" ON "app_user_credentials"("connection_id");

-- CreateIndex
CREATE INDEX "app_user_credentials_app_user_id_idx" ON "app_user_credentials"("app_user_id");

-- CreateIndex
CREATE INDEX "app_user_credentials_expires_at_idx" ON "app_user_credentials"("expires_at");

-- CreateIndex
CREATE INDEX "app_user_credentials_status_idx" ON "app_user_credentials"("status");

-- CreateIndex
CREATE UNIQUE INDEX "connect_sessions_token_key" ON "connect_sessions"("token");

-- CreateIndex
CREATE INDEX "connect_sessions_token_idx" ON "connect_sessions"("token");

-- CreateIndex
CREATE INDEX "connect_sessions_app_id_idx" ON "connect_sessions"("app_id");

-- CreateIndex
CREATE INDEX "connect_sessions_expires_at_idx" ON "connect_sessions"("expires_at");

-- =============================================================================
-- INDEXES: Agentic Tools
-- =============================================================================

-- CreateIndex
CREATE UNIQUE INDEX "agentic_tools_tenant_slug_idx" ON "agentic_tools"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "agentic_tools_tenant_id_idx" ON "agentic_tools"("tenant_id");

-- CreateIndex
CREATE INDEX "agentic_tools_status_idx" ON "agentic_tools"("status");

-- CreateIndex
CREATE INDEX "agentic_tool_executions_tool_created_idx" ON "agentic_tool_executions"("agentic_tool_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agentic_tool_executions_tenant_created_idx" ON "agentic_tool_executions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agentic_tool_executions_status_idx" ON "agentic_tool_executions"("status");

-- =============================================================================
-- INDEXES: Pipelines
-- =============================================================================

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_tenant_slug_idx" ON "pipelines"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "pipelines_tenant_id_idx" ON "pipelines"("tenant_id");

-- CreateIndex
CREATE INDEX "pipelines_status_idx" ON "pipelines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_steps_pipeline_step_number_idx" ON "pipeline_steps"("pipeline_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_steps_pipeline_slug_idx" ON "pipeline_steps"("pipeline_id", "slug");

-- CreateIndex
CREATE INDEX "pipeline_steps_pipeline_id_idx" ON "pipeline_steps"("pipeline_id");

-- CreateIndex
CREATE INDEX "pipeline_executions_pipeline_created_idx" ON "pipeline_executions"("pipeline_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_executions_tenant_created_idx" ON "pipeline_executions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_executions_status_idx" ON "pipeline_executions"("status");

-- CreateIndex
CREATE INDEX "step_executions_execution_step_idx" ON "step_executions"("pipeline_execution_id", "step_number");

-- CreateIndex
CREATE INDEX "step_executions_step_id_idx" ON "step_executions"("pipeline_step_id");

-- CreateIndex
CREATE INDEX "step_executions_status_idx" ON "step_executions"("status");

-- =============================================================================
-- INDEXES: Async Jobs
-- =============================================================================

-- CreateIndex
CREATE INDEX "async_jobs_tenant_created_idx" ON "async_jobs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "async_jobs_type_status_idx" ON "async_jobs"("type", "status");

-- CreateIndex
CREATE INDEX "async_jobs_status_next_run_idx" ON "async_jobs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "async_job_items_job_status_idx" ON "async_job_items"("job_id", "status");

-- =============================================================================
-- INDEXES: Drift & Maintenance
-- =============================================================================

-- CreateIndex
CREATE UNIQUE INDEX "drift_reports_integration_fingerprint_idx" ON "drift_reports"("integration_id", "fingerprint");

-- CreateIndex
CREATE INDEX "drift_reports_integration_severity_status_idx" ON "drift_reports"("integration_id", "severity", "status");

-- CreateIndex
CREATE INDEX "drift_reports_tenant_status_idx" ON "drift_reports"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "drift_reports_action_idx" ON "drift_reports"("action_id");

-- CreateIndex
CREATE INDEX "maintenance_proposals_integration_status_idx" ON "maintenance_proposals"("integration_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_proposals_tenant_status_idx" ON "maintenance_proposals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_proposals_action_status_idx" ON "maintenance_proposals"("action_id", "status");

-- =============================================================================
-- FOREIGN KEYS: Apps
-- =============================================================================

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_integration_configs" ADD CONSTRAINT "app_integration_configs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_integration_configs" ADD CONSTRAINT "app_integration_configs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_credentials" ADD CONSTRAINT "app_user_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_credentials" ADD CONSTRAINT "app_user_credentials_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: connections.app_id → apps.id
ALTER TABLE "connections" ADD CONSTRAINT "connections_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- FOREIGN KEYS: Agentic Tools
-- =============================================================================

-- AddForeignKey
ALTER TABLE "agentic_tools" ADD CONSTRAINT "agentic_tools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentic_tool_executions" ADD CONSTRAINT "agentic_tool_executions_agentic_tool_id_fkey" FOREIGN KEY ("agentic_tool_id") REFERENCES "agentic_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentic_tool_executions" ADD CONSTRAINT "agentic_tool_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- FOREIGN KEYS: Pipelines
-- =============================================================================

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_executions" ADD CONSTRAINT "pipeline_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_executions" ADD CONSTRAINT "pipeline_executions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_pipeline_execution_id_fkey" FOREIGN KEY ("pipeline_execution_id") REFERENCES "pipeline_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_pipeline_step_id_fkey" FOREIGN KEY ("pipeline_step_id") REFERENCES "pipeline_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- FOREIGN KEYS: Async Jobs
-- =============================================================================

-- AddForeignKey
ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_job_items" ADD CONSTRAINT "async_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "async_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- FOREIGN KEYS: Drift & Maintenance
-- =============================================================================

-- AddForeignKey
ALTER TABLE "drift_reports" ADD CONSTRAINT "drift_reports_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_reports" ADD CONSTRAINT "drift_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_reports" ADD CONSTRAINT "drift_reports_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_proposals" ADD CONSTRAINT "maintenance_proposals_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_proposals" ADD CONSTRAINT "maintenance_proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_proposals" ADD CONSTRAINT "maintenance_proposals_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- FOREIGN KEYS & INDEXES: Existing table alterations
-- =============================================================================

-- AddForeignKey: reference_data.app_user_credential_id → app_user_credentials.id
ALTER TABLE "reference_data" ADD CONSTRAINT "reference_data_app_user_credential_id_fkey" FOREIGN KEY ("app_user_credential_id") REFERENCES "app_user_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reference_sync_jobs.app_user_credential_id → app_user_credentials.id
ALTER TABLE "reference_sync_jobs" ADD CONSTRAINT "reference_sync_jobs_app_user_credential_id_fkey" FOREIGN KEY ("app_user_credential_id") REFERENCES "app_user_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex: update reference_data unique index to include app_user_credential_id
DROP INDEX "reference_data_unique_idx";

-- CreateIndex: recreate with app_user_credential_id included
CREATE UNIQUE INDEX "reference_data_unique_idx" ON "reference_data"("integration_id", "connection_id", "app_user_credential_id", "data_type", "external_id");
