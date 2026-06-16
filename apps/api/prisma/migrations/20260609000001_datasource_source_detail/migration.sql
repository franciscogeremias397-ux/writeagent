-- Store source URL/file path as structured data instead of only embedding it in notes.
ALTER TABLE "DataSource"
ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT;

ALTER TABLE "CrawlerJob"
ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT;
