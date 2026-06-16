import { Inject, Injectable } from "@nestjs/common";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { trends as seedTrends, works as seedWorks, writingMemories as seedMemories } from "@shenbi/shared";
import type {
  BackupExportResult,
  BackupListItem,
  BackupRestoreResult,
  CrawlerJobRecord,
  DatasourceRecord,
  EditorMarkRecord,
  EditorVersionRecord,
  KnowledgeChunk,
  LocalCleanupResult,
  LocalMaintenanceResult,
  LocalResetResult,
  PersonalStrategy,
  ReviewReportResult,
  Trend,
  Work,
  WritingAssetLibrary,
  WritingMemory
} from "@shenbi/shared";
import { DatasourcesService } from "../datasources/datasources.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { EditorService } from "../editor/editor.service.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { ReviewService } from "../review/review.service.js";
import { StrategiesService } from "../strategies/strategies.service.js";
import { TrendsService } from "../trends/trends.service.js";
import { WorksService } from "../works/works.service.js";
import { WritingAssetsService } from "../writing-assets/writing-assets.service.js";

@Injectable()
export class BackupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorksService) private readonly worksService: WorksService,
    @Inject(TrendsService) private readonly trendsService: TrendsService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(DatasourcesService) private readonly datasourcesService: DatasourcesService,
    @Inject(ReviewService) private readonly reviewService: ReviewService,
    @Inject(EditorService) private readonly editorService: EditorService,
    @Inject(WritingAssetsService) private readonly writingAssetsService: WritingAssetsService,
    @Inject(StrategiesService) private readonly strategiesService: StrategiesService,
    @Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService
  ) {}

  async exportAll(): Promise<BackupExportResult> {
    const createdAt = new Date();
    const works = await this.worksService.listWorks();
    const [trends, memories, strategies, knowledgeChunks, datasources, crawlerJobs, writingAssets] = await Promise.all([
      this.trendsService.listTrends(),
      this.memoryService.listMemory(),
      this.strategiesService.listStrategies(),
      this.knowledgeService.listChunks(),
      this.datasourcesService.listDatasources(),
      this.datasourcesService.listJobs(),
      this.writingAssetsService.listAssets()
    ]);
    const reviews = await Promise.all(works.map((work) => this.reviewService.getReview(work.id)));
    const marksByWork = await Promise.all(works.map((work) => this.editorService.listMarks(work.id)));
    const versionsByWork = await Promise.all(works.map((work) => this.editorService.listVersions(work.id)));
    const marks = marksByWork.flat();
    const versions = versionsByWork.flat();
    const backup = {
      app: "神笔马良短篇小说 Agent",
      version: "0.1.0",
      createdAt: createdAt.toISOString(),
      privacyNote: "此备份不包含 OPENAI_API_KEY 等密钥原文。",
      settings: {
        aiProvider: process.env.AI_PROVIDER ?? "openai",
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
        storageDir: process.env.LOCAL_STORAGE_DIR ?? "./storage",
        workspaceDir: process.env.WORKSPACE_DIR ?? "./workspace",
        logDir: process.env.LOG_DIR ?? "./logs"
      },
      data: {
        works,
        trends,
        memories,
        strategies,
        knowledgeChunks,
        datasources,
        crawlerJobs,
        writingAssets,
        reviews,
        marks,
        versions
      }
    };
    const backupDir = this.backupRoot();
    const fileName = `shenbi-backup-${this.timestamp(createdAt)}.json`;
    const filePath = path.join(backupDir, fileName);

    await mkdir(backupDir, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

    return {
      id: fileName.replace(".json", ""),
      fileName,
      path: filePath,
      createdAt: createdAt.toISOString(),
      counts: {
        works: works.length,
        trends: trends.length,
        memories: memories.length,
        strategies: strategies.length,
        knowledgeChunks: knowledgeChunks.length,
        writingAssets: this.countWritingAssets(writingAssets),
        datasources: datasources.length,
        crawlerJobs: crawlerJobs.length,
        reviews: reviews.length,
        marks: marks.length,
        versions: versions.length
      },
      message: "全部数据已导出为本地备份文件。"
    };
  }

  async listBackups(): Promise<BackupListItem[]> {
    const backupDir = this.backupRoot();

    try {
      const fileNames = (await readdir(backupDir)).filter((fileName) => fileName.endsWith(".json")).sort().reverse();
      const items = await Promise.all(
        fileNames.map(async (fileName) => {
          const filePath = path.join(backupDir, fileName);
          const [metadata, backup] = await Promise.all([stat(filePath), this.readBackupFile(filePath)]);

          return {
            id: fileName.replace(".json", ""),
            fileName,
            path: filePath,
            createdAt: backup.createdAt,
            counts: this.countBackupData(backup),
            sizeBytes: metadata.size,
            message: "已读取本地备份文件。"
          };
        })
      );

      return items;
    } catch {
      return [];
    }
  }

  async restoreLatest(): Promise<BackupRestoreResult> {
    const backups = await this.listBackups();
    const latest = backups[0];

    if (!latest) {
      return {
        fileName: "",
        path: this.backupRoot(),
        restored: false,
        counts: this.emptyCounts(),
        message: "还没有找到可恢复的备份文件。"
      };
    }

    const backup = await this.readBackupFile(latest.path);
    const counts = this.countBackupData(backup);

    try {
      await this.restoreToDatabase(backup);

      return {
        fileName: latest.fileName,
        path: latest.path,
        restored: true,
        counts,
        message: "最新备份已恢复到本地数据库。"
      };
    } catch {
      await this.restoreToLocalFiles(backup);

      return {
        fileName: latest.fileName,
        path: latest.path,
        restored: true,
        counts,
        message: "数据库还没有连接成功，最新备份已恢复到本地文件。"
      };
    }
  }

  async cleanupImportedAndVerificationData(): Promise<LocalCleanupResult> {
    const backup = await this.exportAll();

    try {
      const counts = await this.cleanupDatabaseData();

      return {
        cleaned: true,
        backupFileName: backup.fileName,
        backupPath: backup.path,
        counts,
        message: `已清理导入/验证数据。清理前已自动备份到 ${backup.fileName}。`
      };
    } catch {
      const counts = await this.cleanupLocalFiles();

      return {
        cleaned: true,
        backupFileName: backup.fileName,
        backupPath: backup.path,
        counts,
        message: `数据库暂时不可用，已清理本地文件里的导入/验证数据。清理前已自动备份到 ${backup.fileName}。`
      };
    }
  }

  async resetToStarterData(): Promise<LocalResetResult> {
    const backup = await this.exportAll();

    try {
      const counts = await this.resetDatabaseData();

      return {
        reset: true,
        backupFileName: backup.fileName,
        backupPath: backup.path,
        counts,
        starterCounts: this.countBackupData(this.starterBackupFile()),
        message: `已重置为初始数据。重置前已自动备份到 ${backup.fileName}。`
      };
    } catch {
      const counts = await this.resetLocalFiles();

      return {
        reset: true,
        backupFileName: backup.fileName,
        backupPath: backup.path,
        counts,
        starterCounts: this.countBackupData(this.starterBackupFile()),
        message: `数据库暂时不可用，已把本地文件重置为初始数据。重置前已自动备份到 ${backup.fileName}。`
      };
    }
  }

  async clearRuntimeCache(dryRun = false): Promise<LocalMaintenanceResult> {
    const storageRoot = path.dirname(this.localDataRoot());
    const items = await Promise.all([
      this.clearDirectoryTarget("截图缓存", path.resolve(storageRoot, "uploads", "screenshots"), dryRun),
      this.clearDirectoryTarget("临时缓存", path.resolve(storageRoot, "tmp"), dryRun),
      this.clearDirectoryTarget("运行缓存", path.resolve(storageRoot, "cache"), dryRun)
    ]);
    const totalFiles = items.reduce((sum, item) => sum + item.fileCount, 0);
    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

    return {
      cleaned: !dryRun,
      dryRun,
      action: "cache",
      items,
      totalFiles,
      totalBytes,
      message: dryRun ? "已预览可清理的运行缓存，没有删除任何文件。" : "运行缓存已清理，作品和备份没有被删除。"
    };
  }

  async clearLocalLogs(dryRun = false): Promise<LocalMaintenanceResult> {
    const logRoot = this.resolveProjectPath(process.env.LOG_DIR ?? "logs");
    const items = [await this.clearDirectoryTarget("日志目录", logRoot, dryRun)];
    const totalFiles = items.reduce((sum, item) => sum + item.fileCount, 0);
    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

    return {
      cleaned: !dryRun,
      dryRun,
      action: "logs",
      items,
      totalFiles,
      totalBytes,
      message: dryRun ? "已预览可清理的日志，没有删除任何文件。" : "日志目录已清空，后续采集会继续写入新日志。"
    };
  }

  private backupRoot() {
    return path.resolve(this.projectRoot(), process.env.LOCAL_STORAGE_DIR ?? "storage", "backups");
  }

  private timestamp(value: Date) {
    return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  private async readBackupFile(filePath: string): Promise<BackupFile> {
    return JSON.parse(await readFile(filePath, "utf8")) as BackupFile;
  }

  private countBackupData(backup: BackupFile) {
    return {
      works: backup.data.works.length,
      trends: backup.data.trends.length,
      memories: backup.data.memories.length,
      strategies: backup.data.strategies?.length ?? 0,
      knowledgeChunks: backup.data.knowledgeChunks?.length ?? 0,
      writingAssets: this.countWritingAssets(backup.data.writingAssets),
      datasources: backup.data.datasources.length,
      crawlerJobs: backup.data.crawlerJobs.length,
      reviews: backup.data.reviews.length,
      marks: backup.data.marks.length,
      versions: backup.data.versions.length
    };
  }

  private emptyCounts(): BackupExportResult["counts"] {
    return {
      works: 0,
      trends: 0,
      memories: 0,
      strategies: 0,
      knowledgeChunks: 0,
      writingAssets: 0,
      datasources: 0,
      crawlerJobs: 0,
      reviews: 0,
      marks: 0,
      versions: 0
    };
  }

  private async restoreToDatabase(backup: BackupFile) {
    for (const work of backup.data.works) {
      await this.prisma.work.upsert({
        where: { id: work.id },
        update: {
          title: work.title,
          cover: work.cover,
          status: work.status,
          platform: work.platform,
          genreTags: work.genreTags,
          styleTags: work.styleTags,
          wordCount: work.wordCount,
          summary: work.summary,
          fullText: work.fullText,
          ...(work.storyPlan ? { storyPlan: this.toJson(work.storyPlan) } : {}),
          commentFeedback: work.commentFeedback,
          commentKeywords: work.commentKeywords ?? [],
          sourceLabel: work.sourceLabel,
          sourceDetail: work.sourceDetail,
          importedAt: work.importedAt ? new Date(work.importedAt) : null,
          readCount: work.readCount,
          subscriptionCount: work.subscriptionCount,
          revenue: work.revenue,
          completionRate: work.completionRate
        },
        create: {
          id: work.id,
          title: work.title,
          cover: work.cover,
          status: work.status,
          platform: work.platform,
          genreTags: work.genreTags,
          styleTags: work.styleTags,
          wordCount: work.wordCount,
          summary: work.summary,
          fullText: work.fullText,
          ...(work.storyPlan ? { storyPlan: this.toJson(work.storyPlan) } : {}),
          commentFeedback: work.commentFeedback,
          commentKeywords: work.commentKeywords ?? [],
          sourceLabel: work.sourceLabel,
          sourceDetail: work.sourceDetail,
          importedAt: work.importedAt ? new Date(work.importedAt) : null,
          readCount: work.readCount,
          subscriptionCount: work.subscriptionCount,
          revenue: work.revenue,
          completionRate: work.completionRate,
          createdAt: new Date(work.createdAt),
          updatedAt: new Date(work.updatedAt)
        }
      });
    }

    for (const trend of backup.data.trends) {
      await this.prisma.trend.upsert({
        where: { id: trend.id },
        update: {
          platform: trend.platform,
          genre: trend.genre,
          heat: trend.heat,
          growthRate: trend.growthRate,
          opportunityScore: trend.opportunityScore,
          saturationScore: trend.saturationScore,
          reason: trend.reason,
          tags: trend.tags,
          sourceLabel: trend.sourceLabel,
          sourceDetail: trend.sourceDetail,
          createdAt: new Date(trend.createdAt)
        },
        create: {
          id: trend.id,
          platform: trend.platform,
          genre: trend.genre,
          heat: trend.heat,
          growthRate: trend.growthRate,
          opportunityScore: trend.opportunityScore,
          saturationScore: trend.saturationScore,
          reason: trend.reason,
          tags: trend.tags,
          sourceLabel: trend.sourceLabel,
          sourceDetail: trend.sourceDetail,
          createdAt: new Date(trend.createdAt)
        }
      });
    }

    for (const memory of backup.data.memories) {
      await this.prisma.writingMemory.upsert({
        where: { id: memory.id },
        update: {
          sourceType: memory.sourceType,
          genre: memory.genre,
          rule: memory.rule,
          positiveExample: memory.positiveExample,
          negativeExample: memory.negativeExample,
          confidence: memory.confidence,
          relatedWorkIds: memory.relatedWorkIds,
          enabled: memory.enabled
        },
        create: {
          id: memory.id,
          sourceType: memory.sourceType,
          genre: memory.genre,
          rule: memory.rule,
          positiveExample: memory.positiveExample,
          negativeExample: memory.negativeExample,
          confidence: memory.confidence,
          relatedWorkIds: memory.relatedWorkIds,
          enabled: memory.enabled,
          createdAt: new Date(memory.createdAt),
          updatedAt: new Date(memory.updatedAt)
        }
      });
    }

    for (const datasource of backup.data.datasources) {
      await this.prisma.dataSource.upsert({
        where: { id: datasource.id },
        update: {
          name: datasource.name,
          type: datasource.type,
          enabled: datasource.enabled,
          frequency: datasource.frequency,
          sourceDetail: datasource.sourceDetail,
          note: datasource.note ?? ""
        },
        create: {
          id: datasource.id,
          name: datasource.name,
          type: datasource.type,
          enabled: datasource.enabled,
          frequency: datasource.frequency,
          sourceDetail: datasource.sourceDetail,
          note: datasource.note ?? "",
          createdAt: new Date(datasource.createdAt),
          updatedAt: new Date(datasource.updatedAt)
        }
      });
    }

    for (const job of backup.data.crawlerJobs) {
      await this.prisma.crawlerJob.upsert({
        where: { id: job.id },
        update: {
          datasourceId: job.datasourceId,
          name: job.name,
          type: job.type,
          status: job.status,
          lastRunAt: this.parseOptionalDate(job.lastRunAt),
          successCount: job.successCount,
          failureReason: job.failureReason,
          sourceDetail: job.sourceDetail
        },
        create: {
          id: job.id,
          datasourceId: job.datasourceId,
          name: job.name,
          type: job.type,
          status: job.status,
          lastRunAt: this.parseOptionalDate(job.lastRunAt),
          successCount: job.successCount,
          failureReason: job.failureReason,
          sourceDetail: job.sourceDetail,
          createdAt: new Date(job.createdAt),
          updatedAt: new Date(job.createdAt)
        }
      });
    }

    for (const review of backup.data.reviews) {
      await this.prisma.reviewReport.upsert({
        where: { id: review.id },
        update: {
          performanceSummary: review.performanceSummary,
          strengths: review.strengths,
          weaknesses: review.weaknesses,
          nextWritingAdvice: review.nextWritingAdvice,
          strategyLessons: review.strategyLessons
        },
        create: {
          id: review.id,
          workId: review.workId,
          performanceSummary: review.performanceSummary,
          strengths: review.strengths,
          weaknesses: review.weaknesses,
          nextWritingAdvice: review.nextWritingAdvice,
          strategyLessons: review.strategyLessons,
          createdAt: new Date(review.createdAt)
        }
      });
    }

    for (const mark of backup.data.marks) {
      await this.prisma.mark.upsert({
        where: { id: mark.id },
        update: {
          index: mark.index,
          type: mark.type,
          selectedText: mark.selectedText,
          comment: mark.comment,
          startOffset: mark.startOffset,
          endOffset: mark.endOffset
        },
        create: {
          id: mark.id,
          workId: mark.workId,
          index: mark.index,
          type: mark.type,
          selectedText: mark.selectedText,
          comment: mark.comment,
          startOffset: mark.startOffset,
          endOffset: mark.endOffset,
          createdAt: new Date(mark.createdAt)
        }
      });
    }

    for (const version of backup.data.versions) {
      await this.prisma.workVersion.upsert({
        where: { id: version.id },
        update: {
          markId: version.markId,
          markLabel: version.markLabel,
          originalText: version.originalText,
          newText: version.newText,
          reason: version.reason,
          impactNotes: version.impactNotes
        },
        create: {
          id: version.id,
          workId: version.workId,
          markId: version.markId,
          markLabel: version.markLabel,
          originalText: version.originalText,
          newText: version.newText,
          reason: version.reason,
          impactNotes: version.impactNotes,
          createdAt: new Date(version.createdAt)
        }
      });
    }

    await this.writingAssetsService.replaceAll(backup.data.writingAssets);
    await this.strategiesService.replaceAll(backup.data.strategies ?? []);
    await this.knowledgeService.replaceAll(backup.data.knowledgeChunks ?? []);
  }

  private parseOptionalDate(value: string) {
    if (!value || value === "-") {
      return null;
    }

    return new Date(value);
  }

  private async restoreToLocalFiles(backup: BackupFile) {
    const updatedAt = new Date().toISOString();

    await Promise.all([
      this.writeLocalJson("works.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        works: backup.data.works
      }),
      this.writeLocalJson("trends.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        trends: backup.data.trends
      }),
      this.writeLocalJson("writing-memories.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        memories: backup.data.memories
      }),
      this.writeLocalJson("personal-strategies.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        strategies: backup.data.strategies ?? []
      }),
      this.writeLocalJson("knowledge-index.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        vectorSize: 96,
        chunks: backup.data.knowledgeChunks ?? []
      }),
      this.writeLocalJson("datasources.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        datasources: backup.data.datasources,
        jobs: backup.data.crawlerJobs
      }),
      this.writeLocalJson("reviews.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        reviews: backup.data.reviews
      }),
      this.writeLocalJson("editor.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        marks: backup.data.marks,
        versions: backup.data.versions
      }),
      this.writeLocalJson("writing-assets.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        inspirations: backup.data.writingAssets?.inspirations ?? [],
        presets: backup.data.writingAssets?.presets ?? []
      })
    ]);
  }

  private async cleanupDatabaseData(): Promise<LocalCleanupResult["counts"]> {
    const worksToDelete = await this.prisma.work.findMany({
      where: {
        OR: [
          { id: { startsWith: "platform-" } },
          { title: { contains: "验证" } },
          { title: { contains: "测试" } }
        ]
      },
      select: { id: true }
    });
    const workIds = worksToDelete.map((work) => work.id);

    const [reviews, marks, versions, memories, knowledgeChunks, trends, crawlerJobs, datasources] = await Promise.all([
      workIds.length ? this.prisma.reviewReport.deleteMany({ where: { workId: { in: workIds } } }) : Promise.resolve({ count: 0 }),
      workIds.length ? this.prisma.mark.deleteMany({ where: { workId: { in: workIds } } }) : Promise.resolve({ count: 0 }),
      workIds.length ? this.prisma.workVersion.deleteMany({ where: { workId: { in: workIds } } }) : Promise.resolve({ count: 0 }),
      this.prisma.writingMemory.deleteMany({
        where: {
          OR: [
            { rule: { contains: "验证" } },
            { rule: { contains: "测试" } },
            { sourceType: "platform_result" },
            ...(workIds.length ? [{ relatedWorkIds: { hasSome: workIds } }] : [])
          ]
        }
      }),
      this.prisma.knowledgeChunk.deleteMany(),
      this.prisma.trend.deleteMany({
        where: {
          OR: [
            { id: { startsWith: "csv-" } },
            { id: { startsWith: "manual-" } },
            { id: { startsWith: "public-page-" } },
            { id: { startsWith: "screenshot-" } },
            { reason: { contains: "公开页面片段" } },
            { genre: { contains: "验证" } },
            { genre: { contains: "测试" } }
          ]
        }
      }),
      this.prisma.crawlerJob.deleteMany({
        where: {
          OR: [
            { type: { in: ["csv", "manual", "screenshot"] } },
            { AND: [{ type: "public_page" }, { failureReason: { contains: "公开页面" } }] },
            { name: { contains: "验证" } },
            { name: { contains: "测试" } }
          ]
        }
      }),
      this.prisma.dataSource.deleteMany({
        where: {
          OR: [
            { type: { in: ["csv", "manual", "screenshot"] } },
            { AND: [{ type: "public_page" }, { note: { contains: "本次识别" } }] },
            { name: { contains: "验证" } },
            { name: { contains: "测试" } }
          ]
        }
      })
    ]);
    const works = workIds.length ? await this.prisma.work.deleteMany({ where: { id: { in: workIds } } }) : { count: 0 };
    const screenshots = await this.cleanupScreenshotUploads();
    const writingAssets = await this.cleanupTemporaryWritingAssets();
    const strategies = await this.cleanupTemporaryStrategies(new Set(workIds));

    return {
      works: works.count,
      trends: trends.count,
      memories: memories.count,
      strategies,
      knowledgeChunks: knowledgeChunks.count,
      writingAssets,
      datasources: datasources.count,
      crawlerJobs: crawlerJobs.count,
      reviews: reviews.count,
      marks: marks.count,
      versions: versions.count,
      screenshots
    };
  }

  private async cleanupLocalFiles(): Promise<LocalCleanupResult["counts"]> {
    const [worksFile, trendsFile, memoryFile, strategyFile, knowledgeFile, datasourceFile, reviewsFile, editorFile] = await Promise.all([
      this.readLocalJson<{ works?: Work[] }>("works.json", {}),
      this.readLocalJson<{ trends?: Trend[] }>("trends.json", {}),
      this.readLocalJson<{ memories?: WritingMemory[] }>("writing-memories.json", {}),
      this.readLocalJson<{ strategies?: PersonalStrategy[] }>("personal-strategies.json", {}),
      this.readLocalJson<{ chunks?: KnowledgeChunk[] }>("knowledge-index.json", {}),
      this.readLocalJson<{ datasources?: DatasourceRecord[]; jobs?: CrawlerJobRecord[] }>("datasources.json", {}),
      this.readLocalJson<{ reviews?: ReviewReportResult[] }>("reviews.json", {}),
      this.readLocalJson<{ marks?: EditorMarkRecord[]; versions?: EditorVersionRecord[] }>("editor.json", {})
    ]);
    const works = worksFile.works ?? [];
    const trends = trendsFile.trends ?? [];
    const memories = memoryFile.memories ?? [];
    const strategies = strategyFile.strategies ?? [];
    const knowledgeChunks = knowledgeFile.chunks ?? [];
    const datasources = datasourceFile.datasources ?? [];
    const jobs = datasourceFile.jobs ?? [];
    const reviews = reviewsFile.reviews ?? [];
    const marks = editorFile.marks ?? [];
    const versions = editorFile.versions ?? [];
    const removedWorkIds = new Set(works.filter((work) => this.shouldRemoveWork(work)).map((work) => work.id));
    const keptWorks = works.filter((work) => !removedWorkIds.has(work.id));
    const keptTrends = trends.filter((trend) => !this.shouldRemoveTrend(trend));
    const keptMemories = memories.filter((memory) => !this.shouldRemoveMemory(memory, removedWorkIds));
    const keptStrategies = strategies.filter((strategy) => !this.shouldRemoveStrategy(strategy, removedWorkIds));
    const keptKnowledgeChunks = knowledgeChunks.filter((chunk) => this.shouldKeepKnowledgeChunk(chunk, keptMemories, keptStrategies));
    const keptDatasources = datasources.filter((datasource) => !this.shouldRemoveDatasource(datasource));
    const keptJobs = jobs.filter((job) => !this.shouldRemoveJob(job));
    const keptReviews = reviews.filter((review) => !removedWorkIds.has(review.workId) && !this.isTemporaryText(review.performanceSummary));
    const keptMarks = marks.filter((mark) => !removedWorkIds.has(mark.workId));
    const keptVersions = versions.filter((version) => !removedWorkIds.has(version.workId));
    const updatedAt = new Date().toISOString();
    const screenshots = await this.cleanupScreenshotUploads();
    const writingAssets = await this.cleanupTemporaryWritingAssets();

    await Promise.all([
      this.writeLocalJson("works.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        works: keptWorks
      }),
      this.writeLocalJson("trends.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        trends: keptTrends
      }),
      this.writeLocalJson("writing-memories.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        memories: keptMemories
      }),
      this.writeLocalJson("personal-strategies.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        strategies: keptStrategies
      }),
      this.writeLocalJson("knowledge-index.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        vectorSize: 96,
        chunks: keptKnowledgeChunks
      }),
      this.writeLocalJson("datasources.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        datasources: keptDatasources,
        jobs: keptJobs
      }),
      this.writeLocalJson("reviews.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        reviews: keptReviews
      }),
      this.writeLocalJson("editor.json", {
        app: "神笔马良短篇小说 Agent",
        updatedAt,
        marks: keptMarks,
        versions: keptVersions
      })
    ]);

    return {
      works: works.length - keptWorks.length,
      trends: trends.length - keptTrends.length,
      memories: memories.length - keptMemories.length,
      strategies: strategies.length - keptStrategies.length,
      knowledgeChunks: knowledgeChunks.length - keptKnowledgeChunks.length,
      writingAssets,
      datasources: datasources.length - keptDatasources.length,
      crawlerJobs: jobs.length - keptJobs.length,
      reviews: reviews.length - keptReviews.length,
      marks: marks.length - keptMarks.length,
      versions: versions.length - keptVersions.length,
      screenshots
    };
  }

  private async resetDatabaseData(): Promise<LocalResetResult["counts"]> {
    const screenshots = await this.cleanupScreenshotUploads();
    const currentWritingAssets = this.countWritingAssets(await this.writingAssetsService.listAssets());
    const currentStrategies = (await this.strategiesService.listStrategies()).length;
    const currentKnowledgeChunks = (await this.knowledgeService.listChunks()).length;
    const [reviews, marks, versions, memories, knowledgeChunks, trends, crawlerJobs, datasources] = await Promise.all([
      this.prisma.reviewReport.deleteMany(),
      this.prisma.mark.deleteMany(),
      this.prisma.workVersion.deleteMany(),
      this.prisma.writingMemory.deleteMany(),
      this.prisma.knowledgeChunk.deleteMany(),
      this.prisma.trend.deleteMany(),
      this.prisma.crawlerJob.deleteMany(),
      this.prisma.dataSource.deleteMany()
    ]);
    await Promise.all([this.prisma.readerReport.deleteMany(), this.prisma.sceneCard.deleteMany()]);
    const works = await this.prisma.work.deleteMany();
    const starter = this.starterBackupFile();
    await this.writingAssetsService.replaceAll(starter.data.writingAssets);
    await this.strategiesService.replaceAll(starter.data.strategies ?? []);

    await this.prisma.work.createMany({
      data: starter.data.works.map((work) => ({
        id: work.id,
        title: work.title,
        cover: work.cover,
        status: work.status,
        platform: work.platform,
        genreTags: work.genreTags,
        styleTags: work.styleTags,
        wordCount: work.wordCount,
        summary: work.summary,
        fullText: work.fullText,
        commentFeedback: work.commentFeedback,
        commentKeywords: work.commentKeywords ?? [],
        sourceLabel: work.sourceLabel,
        sourceDetail: work.sourceDetail,
        importedAt: work.importedAt ? new Date(work.importedAt) : null,
        readCount: work.readCount,
        subscriptionCount: work.subscriptionCount,
        revenue: work.revenue,
        completionRate: work.completionRate,
        createdAt: new Date(work.createdAt),
        updatedAt: new Date(work.updatedAt)
      })),
      skipDuplicates: true
    });
    await this.prisma.trend.createMany({
      data: starter.data.trends.map((trend) => ({
        id: trend.id,
        platform: trend.platform,
        genre: trend.genre,
        heat: trend.heat,
        growthRate: trend.growthRate,
        opportunityScore: trend.opportunityScore,
        saturationScore: trend.saturationScore,
        reason: trend.reason,
        tags: trend.tags,
        sourceLabel: trend.sourceLabel,
        sourceDetail: trend.sourceDetail,
        createdAt: new Date(trend.createdAt)
      })),
      skipDuplicates: true
    });
    await this.prisma.writingMemory.createMany({
      data: starter.data.memories.map((memory) => ({
        id: memory.id,
        sourceType: memory.sourceType,
        genre: memory.genre,
        rule: memory.rule,
        positiveExample: memory.positiveExample,
        negativeExample: memory.negativeExample,
        confidence: memory.confidence,
        relatedWorkIds: memory.relatedWorkIds,
        enabled: memory.enabled,
        createdAt: new Date(memory.createdAt),
        updatedAt: new Date(memory.updatedAt)
      })),
      skipDuplicates: true
    });
    for (const datasource of starter.data.datasources) {
      await this.prisma.dataSource.create({
        data: {
          id: datasource.id,
          name: datasource.name,
          type: datasource.type,
          enabled: datasource.enabled,
          frequency: datasource.frequency,
          sourceDetail: datasource.sourceDetail,
          note: datasource.note,
          createdAt: new Date(datasource.createdAt),
          updatedAt: new Date(datasource.updatedAt)
        }
      });
    }
    await this.prisma.crawlerJob.createMany({
      data: starter.data.crawlerJobs.map((job) => ({
        id: job.id,
        datasourceId: job.datasourceId,
        name: job.name,
        type: job.type,
        status: job.status,
        lastRunAt: this.parseOptionalDate(job.lastRunAt),
        successCount: job.successCount,
        failureReason: job.failureReason,
        sourceDetail: job.sourceDetail,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.createdAt)
      })),
      skipDuplicates: true
    });

    return {
      works: works.count,
      trends: trends.count,
      memories: memories.count,
      strategies: currentStrategies,
      knowledgeChunks: Math.max(currentKnowledgeChunks, knowledgeChunks.count),
      writingAssets: currentWritingAssets,
      datasources: datasources.count,
      crawlerJobs: crawlerJobs.count,
      reviews: reviews.count,
      marks: marks.count,
      versions: versions.count,
      screenshots
    };
  }

  private async resetLocalFiles(): Promise<LocalResetResult["counts"]> {
    const current = await this.currentLocalCounts();
    const screenshots = await this.cleanupScreenshotUploads();

    await this.restoreToLocalFiles(this.starterBackupFile());

    return {
      ...current,
      screenshots
    };
  }

  private async currentLocalCounts(): Promise<BackupExportResult["counts"]> {
    const [worksFile, trendsFile, memoryFile, strategyFile, knowledgeFile, datasourceFile, reviewsFile, editorFile, writingAssetsFile] = await Promise.all([
      this.readLocalJson<{ works?: Work[] }>("works.json", {}),
      this.readLocalJson<{ trends?: Trend[] }>("trends.json", {}),
      this.readLocalJson<{ memories?: WritingMemory[] }>("writing-memories.json", {}),
      this.readLocalJson<{ strategies?: PersonalStrategy[] }>("personal-strategies.json", {}),
      this.readLocalJson<{ chunks?: KnowledgeChunk[] }>("knowledge-index.json", {}),
      this.readLocalJson<{ datasources?: DatasourceRecord[]; jobs?: CrawlerJobRecord[] }>("datasources.json", {}),
      this.readLocalJson<{ reviews?: ReviewReportResult[] }>("reviews.json", {}),
      this.readLocalJson<{ marks?: EditorMarkRecord[]; versions?: EditorVersionRecord[] }>("editor.json", {}),
      this.readLocalJson<Partial<WritingAssetLibrary>>("writing-assets.json", {})
    ]);

    return {
      works: worksFile.works?.length ?? 0,
      trends: trendsFile.trends?.length ?? 0,
      memories: memoryFile.memories?.length ?? 0,
      strategies: strategyFile.strategies?.length ?? 0,
      knowledgeChunks: knowledgeFile.chunks?.length ?? 0,
      writingAssets: this.countWritingAssets(writingAssetsFile),
      datasources: datasourceFile.datasources?.length ?? 0,
      crawlerJobs: datasourceFile.jobs?.length ?? 0,
      reviews: reviewsFile.reviews?.length ?? 0,
      marks: editorFile.marks?.length ?? 0,
      versions: editorFile.versions?.length ?? 0
    };
  }

  private async readLocalJson<T>(fileName: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(path.join(this.localDataRoot(), fileName), "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  private shouldRemoveWork(work: Work) {
    return work.id.startsWith("platform-") || this.isTemporaryText(work.title);
  }

  private shouldRemoveTrend(trend: Trend) {
    return (
      trend.id.startsWith("csv-") ||
      trend.id.startsWith("manual-") ||
      trend.id.startsWith("public-page-") ||
      trend.id.startsWith("screenshot-") ||
      trend.reason.includes("公开页面片段") ||
      this.isTemporaryText(trend.genre) ||
      this.isTemporaryText(trend.reason)
    );
  }

  private shouldRemoveMemory(memory: WritingMemory, removedWorkIds: Set<string>) {
    return (
      this.isTemporaryText(memory.rule) ||
      memory.sourceType === "platform_result" ||
      memory.relatedWorkIds.some((workId) => removedWorkIds.has(workId))
    );
  }

  private shouldRemoveStrategy(strategy: PersonalStrategy, removedWorkIds: Set<string>) {
    return (
      this.isTemporaryText(strategy.rule) ||
      this.isTemporaryText(strategy.evidence) ||
      strategy.sourceType === "platform_result" ||
      strategy.relatedWorkIds.some((workId) => removedWorkIds.has(workId))
    );
  }

  private shouldKeepKnowledgeChunk(chunk: KnowledgeChunk, memories: WritingMemory[], strategies: PersonalStrategy[]) {
    if (this.isTemporaryText(chunk.content) || this.isTemporaryText(chunk.genre)) {
      return false;
    }

    if (chunk.sourceType === "memory") {
      return memories.some((memory) => memory.id === chunk.sourceId);
    }

    if (chunk.sourceType === "strategy") {
      return strategies.some((strategy) => strategy.id === chunk.sourceId);
    }

    return false;
  }

  private shouldRemoveDatasource(datasource: DatasourceRecord) {
    return (
      ["csv", "manual", "screenshot"].includes(datasource.type) ||
      (datasource.type === "public_page" && (datasource.id.startsWith("source-public_page-") || Boolean(datasource.note?.includes("本次识别")))) ||
      this.isTemporaryText(datasource.name)
    );
  }

  private shouldRemoveJob(job: CrawlerJobRecord) {
    return (
      ["csv", "manual", "screenshot"].includes(job.type) ||
      (job.type === "public_page" && (job.id.startsWith("job-public_page-") || job.failureReason.includes("公开页面"))) ||
      this.isTemporaryText(job.name) ||
      this.isTemporaryText(job.failureReason)
    );
  }

  private isTemporaryText(value = "") {
    return /验证|测试/.test(value);
  }

  private countWritingAssets(library?: Partial<WritingAssetLibrary>) {
    return (library?.inspirations?.length ?? 0) + (library?.presets?.length ?? 0);
  }

  private async cleanupTemporaryWritingAssets() {
    const library = await this.writingAssetsService.listAssets();
    const inspirations = library.inspirations.filter((item) => !this.isTemporaryText(item.text));
    const presets = library.presets.filter((item) => !this.isTemporaryText(item.name) && !this.isTemporaryText(item.note));
    const removed = this.countWritingAssets(library) - this.countWritingAssets({ inspirations, presets });

    if (removed > 0) {
      await this.writingAssetsService.replaceAll({ inspirations, presets });
    }

    return removed;
  }

  private async cleanupTemporaryStrategies(removedWorkIds: Set<string>) {
    const strategies = await this.strategiesService.listStrategies();
    const keptStrategies = strategies.filter((strategy) => !this.shouldRemoveStrategy(strategy, removedWorkIds));
    const removed = strategies.length - keptStrategies.length;

    if (removed > 0) {
      await this.strategiesService.replaceAll(keptStrategies);
    }

    return removed;
  }

  private async cleanupScreenshotUploads() {
    const screenshotsDir = path.resolve(path.dirname(this.localDataRoot()), "uploads", "screenshots");

    try {
      const files = await readdir(screenshotsDir);
      await rm(screenshotsDir, { recursive: true, force: true });
      await mkdir(screenshotsDir, { recursive: true });

      return files.length;
    } catch {
      return 0;
    }
  }

  private async writeLocalJson(fileName: string, data: unknown) {
    const filePath = path.join(this.localDataRoot(), fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private localDataRoot() {
    return path.resolve(this.projectRoot(), process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data");
  }

  private projectRoot() {
    const cwd = process.cwd();
    return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
  }

  private resolveProjectPath(value: string) {
    return path.isAbsolute(value) ? value : path.resolve(this.projectRoot(), value);
  }

  private async clearDirectoryTarget(label: string, targetPath: string, dryRun: boolean) {
    const summary = await this.collectDirectoryStats(targetPath);

    if (!dryRun) {
      await rm(targetPath, { recursive: true, force: true });
      await mkdir(targetPath, { recursive: true });
    }

    return {
      label,
      path: targetPath,
      fileCount: summary.fileCount,
      sizeBytes: summary.sizeBytes
    };
  }

  private async collectDirectoryStats(root: string) {
    const stack = [root];
    let fileCount = 0;
    let sizeBytes = 0;

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      let entries: Dirent[];

      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const entryPath = path.resolve(current, entry.name);

        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        try {
          const metadata = await stat(entryPath);
          fileCount += 1;
          sizeBytes += metadata.size;
        } catch {
          continue;
        }
      }
    }

    return { fileCount, sizeBytes };
  }

  private starterBackupFile(): BackupFile {
    const createdAt = new Date().toISOString();

    return {
      app: "神笔马良短篇小说 Agent",
      version: "0.1.0",
      createdAt,
      data: {
        works: seedWorks,
        trends: seedTrends,
        memories: seedMemories,
        strategies: starterStrategies,
        knowledgeChunks: [],
        writingAssets: {
          inspirations: [],
          presets: []
        },
        datasources: starterDatasources,
        crawlerJobs: starterCrawlerJobs,
        reviews: [],
        marks: [],
        versions: []
      }
    };
  }
}

const starterStrategies: PersonalStrategy[] = [
  {
    id: "strategy-1",
    sourceType: "manual_rule",
    genre: "女性成长",
    rule: "现实女性成长优先保留克制反击，不要让外部身份替主角解决问题。",
    evidence: "初始策略：适合短篇平台读者的现实质感和主动反击路径。",
    action: "下一篇写作时，让主角亲手完成关键证据整理或公开动作。",
    confidence: 82,
    relatedWorkIds: ["work-1"],
    enabled: true,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  }
];

const starterDatasources: DatasourceRecord[] = [
  {
    id: "source-1",
    name: "番茄公开榜单",
    type: "public_page",
    enabled: true,
    frequency: "每日",
    note: "仅用于公开页面分析，不处理登录态内容。",
    persisted: false,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  },
  {
    id: "source-2",
    name: "作品数据 CSV",
    type: "csv",
    enabled: true,
    frequency: "手动",
    note: "用于导入你自己导出的作品数据或题材热度表。",
    persisted: false,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  },
  {
    id: "source-3",
    name: "作者后台截图",
    type: "screenshot",
    enabled: false,
    frequency: "手动",
    note: "有 OpenAI Key 时可自动识别截图文字，也支持手动校正文字。",
    persisted: false,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  }
];

const starterCrawlerJobs: CrawlerJobRecord[] = [
  {
    id: "job-1",
    datasourceId: "source-1",
    name: "番茄短故事公开榜单示例",
    type: "public_rank",
    status: "success",
    lastRunAt: "2026-06-07 09:30",
    successCount: 42,
    failureReason: "",
    persisted: false,
    createdAt: "2026-06-07"
  },
  {
    id: "job-2",
    datasourceId: "source-2",
    name: "作品数据 CSV 等待导入",
    type: "csv",
    status: "waiting",
    lastRunAt: "-",
    successCount: 0,
    failureReason: "",
    persisted: false,
    createdAt: "2026-06-07"
  }
];

type BackupFile = {
  app: string;
  version: string;
  createdAt: string;
  data: {
    works: Work[];
    trends: Trend[];
    memories: WritingMemory[];
    strategies?: PersonalStrategy[];
    knowledgeChunks?: KnowledgeChunk[];
    writingAssets?: WritingAssetLibrary;
    datasources: DatasourceRecord[];
    crawlerJobs: CrawlerJobRecord[];
    reviews: ReviewReportResult[];
    marks: EditorMarkRecord[];
    versions: EditorVersionRecord[];
  };
};
