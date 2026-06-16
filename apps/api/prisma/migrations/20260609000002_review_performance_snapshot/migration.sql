-- Preserve review input metrics and diagnostics on the review itself.
ALTER TABLE "ReviewReport"
ADD COLUMN IF NOT EXISTS "readCount" INTEGER,
ADD COLUMN IF NOT EXISTS "revenue" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "completionRate" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "rankingChange" TEXT,
ADD COLUMN IF NOT EXISTS "recommendationChange" TEXT,
ADD COLUMN IF NOT EXISTS "commentFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "contentDiagnostics" JSONB;
