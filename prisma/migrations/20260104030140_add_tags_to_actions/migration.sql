-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
