-- CreateEnum
CREATE TYPE "ScrapeJobStatus" AS ENUM ('PENDING', 'CRAWLING', 'PARSING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "status" "ScrapeJobStatus" NOT NULL DEFAULT 'PENDING',
    "documentation_url" TEXT NOT NULL,
    "wishlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" JSONB,
    "cached_content_key" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_jobs_tenant_id_idx" ON "scrape_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "scrape_jobs_status_idx" ON "scrape_jobs"("status");

-- CreateIndex
CREATE INDEX "scrape_jobs_tenant_created_idx" ON "scrape_jobs"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "scrape_jobs" ENABLE ROW LEVEL SECURITY;

-- Policy: Tenants can only see their own scrape jobs
CREATE POLICY "scrape_jobs_tenant_isolation" ON "scrape_jobs"
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Policy: Service role can access all records (for background jobs)
CREATE POLICY "scrape_jobs_service_access" ON "scrape_jobs"
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

