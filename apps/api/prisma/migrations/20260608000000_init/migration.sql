-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('draft', 'published', 'serializing', 'finished');

-- CreateEnum
CREATE TYPE "MarkType" AS ENUM ('delete', 'optimize', 'rewrite', 'logic', 'emotion', 'rhythm', 'character', 'information_gap', 'scene_goal');

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cover" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'draft',
    "platform" TEXT NOT NULL,
    "platformUrl" TEXT,
    "genreTags" TEXT[],
    "styleTags" TEXT[],
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "fullText" TEXT,
    "storyPlan" JSONB,
    "commentFeedback" TEXT,
    "commentKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceLabel" TEXT,
    "sourceDetail" TEXT,
    "importedAt" TIMESTAMP(3),
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "subscriptionCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneCard" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "protagonistWant" TEXT NOT NULL,
    "obstacle" TEXT NOT NULL,
    "conflictUpgrade" TEXT NOT NULL,
    "informationGap" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "keyAction" TEXT NOT NULL,
    "keyDialogue" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "estimatedWords" INTEGER NOT NULL,
    "relatedCharacters" TEXT[],
    "relatedForeshadows" TEXT[],

    CONSTRAINT "SceneCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "sceneCardId" TEXT,
    "index" INTEGER NOT NULL,
    "selectedText" TEXT NOT NULL,
    "comment" TEXT,
    "type" "MarkType" NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkVersion" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "markId" TEXT NOT NULL,
    "markLabel" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "newText" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impactNotes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trend" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "heat" DOUBLE PRECISION NOT NULL,
    "growthRate" DOUBLE PRECISION NOT NULL,
    "opportunityScore" DOUBLE PRECISION NOT NULL,
    "saturationScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "tags" TEXT[],
    "sourceLabel" TEXT,
    "sourceDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT '手动',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlerJob" (
    "id" TEXT NOT NULL,
    "datasourceId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlerJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaderReport" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "openingScore" INTEGER NOT NULL,
    "empathyScore" INTEGER NOT NULL,
    "emotionScore" INTEGER NOT NULL,
    "reversalScore" INTEGER NOT NULL,
    "closureScore" INTEGER NOT NULL,
    "platformFitScore" INTEGER NOT NULL,
    "samenessRisk" TEXT NOT NULL,
    "problems" TEXT[],
    "suggestions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "performanceSummary" TEXT NOT NULL,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "nextWritingAdvice" TEXT[],
    "strategyLessons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingMemory" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "genre" TEXT,
    "rule" TEXT NOT NULL,
    "positiveExample" TEXT,
    "negativeExample" TEXT,
    "confidence" INTEGER NOT NULL,
    "relatedWorkIds" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalStrategy" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "confidence" INTEGER NOT NULL,
    "relatedWorkIds" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "genre" TEXT,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceType_genre_idx" ON "KnowledgeChunk"("sourceType", "genre");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_sourceType_sourceId_key" ON "KnowledgeChunk"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "SceneCard" ADD CONSTRAINT "SceneCard_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVersion" ADD CONSTRAINT "WorkVersion_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlerJob" ADD CONSTRAINT "CrawlerJob_datasourceId_fkey" FOREIGN KEY ("datasourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderReport" ADD CONSTRAINT "ReaderReport_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
