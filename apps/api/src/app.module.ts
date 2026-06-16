import { Module } from "@nestjs/common";
import { BackupsController } from "./modules/backups/backups.controller.js";
import { BackupsService } from "./modules/backups/backups.service.js";
import { DatasourcesController } from "./modules/datasources/datasources.controller.js";
import { DatasourcesService } from "./modules/datasources/datasources.service.js";
import { AiProviderService } from "./modules/ai/ai-provider.service.js";
import { PrismaService } from "./modules/database/prisma.service.js";
import { EditorController } from "./modules/editor/editor.controller.js";
import { EditorService } from "./modules/editor/editor.service.js";
import { MemoryController } from "./modules/memory/memory.controller.js";
import { MemoryService } from "./modules/memory/memory.service.js";
import { KnowledgeService } from "./modules/knowledge/knowledge.service.js";
import { ReviewController } from "./modules/review/review.controller.js";
import { ReviewService } from "./modules/review/review.service.js";
import { SettingsController } from "./modules/settings/settings.controller.js";
import { StrategiesController } from "./modules/strategies/strategies.controller.js";
import { StrategiesService } from "./modules/strategies/strategies.service.js";
import { TrendsController } from "./modules/trends/trends.controller.js";
import { TrendsService } from "./modules/trends/trends.service.js";
import { WorksController } from "./modules/works/works.controller.js";
import { WorksService } from "./modules/works/works.service.js";
import { WritingController } from "./modules/writing/writing.controller.js";
import { WritingWorkflowService } from "./modules/writing/writing-workflow.service.js";
import { WritingAssetsController } from "./modules/writing-assets/writing-assets.controller.js";
import { WritingAssetsService } from "./modules/writing-assets/writing-assets.service.js";

@Module({
  controllers: [
    WritingController,
    WorksController,
    TrendsController,
    SettingsController,
    DatasourcesController,
    BackupsController,
    EditorController,
    ReviewController,
    MemoryController,
    StrategiesController,
    WritingAssetsController
  ],
  providers: [
    AiProviderService,
    PrismaService,
    WorksService,
    EditorService,
    MemoryService,
    KnowledgeService,
    ReviewService,
    StrategiesService,
    DatasourcesService,
    TrendsService,
    BackupsService,
    WritingAssetsService,
    WritingWorkflowService
  ]
})
export class AppModule {}
