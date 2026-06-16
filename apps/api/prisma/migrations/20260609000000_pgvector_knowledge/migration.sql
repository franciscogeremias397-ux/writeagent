-- Enable pgvector for the local writing memory knowledge index.
CREATE EXTENSION IF NOT EXISTS vector;

-- Keep the existing Float[] embedding for Prisma/local fallback, and add a
-- pgvector column for PostgreSQL similarity search when Docker is available.
ALTER TABLE "KnowledgeChunk"
ADD COLUMN IF NOT EXISTS "embeddingVector" vector(96);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embeddingVector_idx"
ON "KnowledgeChunk"
USING ivfflat ("embeddingVector" vector_cosine_ops)
WITH (lists = 16);
