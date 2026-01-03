-- AlterTable
ALTER TABLE "scrape_jobs" ADD COLUMN     "specific_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
