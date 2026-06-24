import { Body, Controller, Get, Inject, Patch, Post, Query } from "@nestjs/common";
import { type AiProviderMode } from "@shenbi/shared";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { AiProviderService } from "../ai/ai-provider.service.js";
import { BackupsService } from "../backups/backups.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { GenerateService } from "../generate/generate.service.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { WorksService } from "../works/works.service.js";

type DirectoryHealth = {
  ok: boolean;
  label: string;
  path: string;
  fileCount: number;
  sizeBytes: number;
  detail: string;
  nextStep?: string;
};

type ServiceHealth = {
  ok: boolean;
  label: string;
  detail: string;
  nextStep?: string;
};

type LaunchEntryHealth = ServiceHealth & {
  fileName: string;
  path: string;
  executable: boolean;
};

type PersistenceStatus = {
  mode: "database" | "local_file";
  label: string;
  durable: boolean;
  fallbackActive: boolean;
  detail: string;
  scope: string[];
  paths: {
    storageDir: string;
    workspaceDir: string;
    logDir: string;
  };
  nextStep?: string;
};

type UpdateSettingsBody = {
  aiProvider?: string;
  apiKey?: string;
  textModel?: string;
  outlineModel?: string;
  baseUrl?: string;
  openAiApiKey?: string;
  openAiTextModel?: string;
  openAiEmbeddingModel?: string;
  kimiApiKey?: string;
  kimiTextModel?: string;
  kimiOutlineModel?: string;
  kimiBaseUrl?: string;
  deepSeekApiKey?: string;
  deepSeekTextModel?: string;
  deepSeekBaseUrl?: string;
  clearApiKey?: boolean;
  clearOpenAiApiKey?: boolean;
  dryRun?: boolean;
};

type WorkflowSmokeStep = {
  label: string;
  ok: boolean;
  detail: string;
  nextStep?: string;
};

type WorkflowSmokeResult = {
  ok: boolean;
  summary: string;
  steps: WorkflowSmokeStep[];
  cleaned: {
    workId?: string;
    deletedMemories: number;
  };
  nextStep?: string;
};

type AiKernelTestResult = {
  ok: boolean;
  providerMode: AiProviderMode;
  title: string;
  detail: string;
  providerNotice?: string;
  draft: {
    wordCount: number;
    genre: string;
    tags: string[];
    marketSummary: string;
    qualitySummary: string;
  };
  nextStep?: string;
};

@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(AiProviderService) private readonly aiProvider: AiProviderService,
    @Inject(BackupsService) private readonly backupsService: BackupsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GenerateService) private readonly generateService: GenerateService,
    @Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService,
    @Inject(WorksService) private readonly worksService: WorksService,
    @Inject(MemoryService) private readonly memoryService: MemoryService
  ) {}

  @Get()
  async getSettings() {
    const storageDir = process.env.LOCAL_STORAGE_DIR ?? "./storage";
    const workspaceDir = process.env.WORKSPACE_DIR ?? "./workspace";
    const logDir = process.env.LOG_DIR ?? "./logs";
    const aiStatus = this.aiProvider.getStatus();
    const [database, redis, knowledge, storage, workspace, logs] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkKnowledgeIndex(),
      this.checkDirectory("文件存储", storageDir),
      this.checkDirectory("作品工程", workspaceDir),
      this.checkDirectory("日志目录", logDir)
    ]);

    return {
      aiProvider: aiStatus.provider,
      hasApiKey: aiStatus.hasApiKey,
      aiStatus,
      availableAiProviders: this.aiProvider.listProviders(),
      storageDir,
      workspaceDir,
      logDir,
      persistence: this.buildPersistenceStatus(database, storage, workspace, logs),
      runtimeHealth: {
        database,
        redis,
        knowledge,
        storage,
        workspace,
        logs
      },
      launchEntries: await this.checkLaunchEntries(),
      crawlerSettings: {
        defaultFrequency: "手动触发",
        concurrency: 1,
        timeoutSeconds: 20,
        scheduledTasks: false,
        enabledImports: ["公开网页", "CSV", "平台文字粘贴", "截图自动识别/校正文字"],
        boundaries: ["不绕过登录", "不绕过验证码", "不抓取未授权后台", "只处理公开页面或用户主动导入的数据"]
      }
    };
  }

  @Patch()
  async updateSettings(@Body() body: UpdateSettingsBody = {}) {
    const aiProvider = this.normalizeAiProvider(this.cleanText(body.aiProvider) || process.env.AI_PROVIDER || "openai");
    const providerInfo = this.aiProviderInfo(aiProvider);
    const textModel = this.providerTextModelFromBody(aiProvider, body) || process.env[providerInfo.textModelEnv] || providerInfo.defaultTextModel;
    const outlineModel =
      this.providerOutlineModelFromBody(aiProvider, body) ||
      (providerInfo.outlineModelEnv ? process.env[providerInfo.outlineModelEnv] : "") ||
      providerInfo.defaultOutlineModel ||
      textModel;
    const baseUrl = this.providerBaseUrlFromBody(aiProvider, body) || process.env[providerInfo.baseUrlEnv] || providerInfo.defaultBaseUrl;
    const openAiEmbeddingModel = this.cleanText(body.openAiEmbeddingModel) || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const shouldClearKey = Boolean(body.clearApiKey || (body.clearOpenAiApiKey && aiProvider === "openai"));
    const providedApiKey = this.providerApiKeyFromBody(aiProvider, body);
    const nextApiKey = shouldClearKey ? "" : providedApiKey || process.env[providerInfo.apiKeyEnv] || "";
    const previewStatus = this.buildAiStatus(providerInfo, textModel, outlineModel, baseUrl, openAiEmbeddingModel, Boolean(nextApiKey));

    if (body.dryRun) {
      return {
        status: "preview",
        dryRun: true,
        hasApiKey: Boolean(nextApiKey),
        aiStatus: previewStatus,
        message: "已预览 AI 设置保存结果，没有写入本地配置文件。"
      };
    }

    process.env.AI_PROVIDER = aiProvider;
    process.env[providerInfo.textModelEnv] = textModel;
    process.env[providerInfo.baseUrlEnv] = baseUrl;

    if (providerInfo.outlineModelEnv) {
      process.env[providerInfo.outlineModelEnv] = outlineModel;
    }

    if (aiProvider === "openai") {
      process.env.OPENAI_EMBEDDING_MODEL = openAiEmbeddingModel;
    }

    if (shouldClearKey) {
      delete process.env[providerInfo.apiKeyEnv];
    } else if (nextApiKey) {
      process.env[providerInfo.apiKeyEnv] = nextApiKey;
    }

    await this.writeLocalEnv({
      AI_PROVIDER: aiProvider,
      [providerInfo.textModelEnv]: textModel,
      ...(providerInfo.outlineModelEnv ? { [providerInfo.outlineModelEnv]: outlineModel } : {}),
      [providerInfo.baseUrlEnv]: baseUrl,
      ...(aiProvider === "openai" ? { OPENAI_EMBEDDING_MODEL: openAiEmbeddingModel } : {}),
      [providerInfo.apiKeyEnv]: process.env[providerInfo.apiKeyEnv]
    });

    return {
      status: "saved",
      dryRun: false,
      hasApiKey: Boolean(process.env[providerInfo.apiKeyEnv]),
      aiStatus: this.aiProvider.getStatus(),
      message: "AI 设置已保存到本机配置文件。"
    };
  }

  @Post("test-ai")
  testAi() {
    return this.aiProvider.testConnection();
  }

  @Post("test-ai-kernel")
  async testAiKernel(): Promise<AiKernelTestResult> {
    try {
      const draft = await this.aiProvider.generateFullDraft({
        mode: "inspiration",
        targetPlatform: "fanqie",
        targetLength: "8000",
        optionalDirection: "悬疑反转",
        inspiration: "设置中心测试用：旧小区夜里响起第三声敲门，但监控里没有人。"
      });
      const wordCount = this.countReadableText(draft.content);
      const ok = wordCount >= 500 && Boolean(draft.title.trim());

      if (!ok) {
        return {
          ok: false,
          providerMode: draft.providerMode ?? "mock",
          title: draft.title,
          detail: "全文生成测试返回内容过短，还不能作为可编辑正文。",
          providerNotice: draft.providerNotice,
          draft: {
            wordCount,
            genre: draft.genre,
            tags: draft.tags,
            marketSummary: draft.marketSummary,
            qualitySummary: draft.qualitySummary
          },
          nextStep: "可以先使用首页生成验证；如果真实模型反复返回过短，请检查模型名或切换供应商。"
        };
      }

      const providerMode = draft.providerMode ?? "mock";

      return {
        ok: true,
        providerMode,
        title: draft.title,
        detail:
          providerMode === "kimi"
            ? `${this.providerModeLabel(providerMode)} 全文生成已跑通，可以从首页生成后进入编辑器。`
            : "全文生成测试没有跑通正式正文路由；正式正文必须由 Kimi 生成。",
        providerNotice: draft.providerNotice,
        draft: {
          wordCount,
          genre: draft.genre,
          tags: draft.tags,
          marketSummary: draft.marketSummary,
          qualitySummary: draft.qualitySummary
        },
        nextStep: providerMode === "kimi" ? undefined : "请先配置 Kimi API Key 和 Kimi K2.6 模型，再测试全文生成。"
      };
    } catch (error) {
      return {
        ok: false,
        providerMode: "fallback",
        title: "全文生成测试",
        detail: `全文生成测试没有跑通：${this.errorMessage(error)}`,
        draft: {
          wordCount: 0,
          genre: "未知",
          tags: [],
          marketSummary: "",
          qualitySummary: ""
        },
        nextStep: "先刷新设置中心；如果仍失败，把这段结果发给我。"
      };
    }
  }

  @Post("test-workflow")
  async testWorkflow(): Promise<WorkflowSmokeResult> {
    const steps: WorkflowSmokeStep[] = [];
    let workId: string | undefined;
    let ok = false;
    let summary = "";
    let nextStep: string | undefined;

    try {
      const startedJob = this.generateService.startFullDraftJob({
        mode: "autopilot",
        targetPlatform: "fanqie",
        targetLength: "8000",
        optionalDirection: "现实情感",
        avoid: ["不要输出过程结构"]
      });

      steps.push({
        label: "创建生成任务",
        ok: true,
        detail: `已创建任务 ${startedJob.jobId}，当前进度 ${startedJob.progress}%。`
      });

      const completedJob = await this.waitForGenerateJob(startedJob.jobId);

      if (completedJob.status !== "completed" || !completedJob.result) {
        throw new Error(completedJob.error || "生成任务没有返回作品。");
      }

      workId = completedJob.result.workId;
      steps.push({
        label: "全文生成与保存",
        ok: Boolean(workId),
        detail: `已生成《${completedJob.result.title}》。供应商：${this.providerModeLabel(completedJob.result.providerMode)}。保存方式：${completedJob.result.persisted ? "数据库持久化" : "本地文件兜底"}。作品 ID：${workId}。`
      });

      if (!workId) {
        throw new Error("作品保存接口没有返回作品 ID。");
      }

      const loaded = await this.worksService.getWork(workId);

      if (!loaded.fullText?.trim()) {
        throw new Error("作品读取接口没有返回正文，编辑器无法打开。");
      }

      const wordCount = this.countReadableText(loaded.fullText);

      if (wordCount < 500) {
        throw new Error("全文生成结果过短，无法进入可编辑正文。");
      }

      steps.push({
        label: "编辑器读取",
        ok: true,
        detail: `编辑器可通过 /editor?workId=${workId} 读取这篇正文，约 ${wordCount} 字。`
      });

      ok = true;
      summary = "主流程可以跑通：全文生成、保存作品、编辑器读取都正常。";
    } catch (error) {
      const message = this.errorMessage(error);
      steps.push({
        label: "主流程检查",
        ok: false,
        detail: message,
        nextStep: "先刷新设置中心；如果仍失败，把这段结果发给我。"
      });
      summary = `主流程检查没有跑通：${message}`;
      nextStep = "先运行本地体检，确认前端、后端和文件目录可用。";
    }

    const cleanup = await this.cleanupWorkflowSmokeData(workId);

    return {
      ok,
      summary,
      steps: [...steps, ...cleanup.steps],
      cleaned: {
        workId,
        deletedMemories: cleanup.deletedMemories
      },
      nextStep
    };
  }

  private async waitForGenerateJob(jobId: string, timeoutMs = 180000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const job = await this.generateService.getFullDraftJob(jobId);

      if (job.status === "completed" || job.status === "failed") {
        return job;
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
    }

    throw new Error("生成任务等待超时，请稍后从首页重试。");
  }

  @Post("export-data")
  exportData() {
    return this.backupsService.exportAll();
  }

  private async cleanupWorkflowSmokeData(workId?: string): Promise<{ steps: WorkflowSmokeStep[]; deletedMemories: number }> {
    const steps: WorkflowSmokeStep[] = [];
    let deletedMemories = 0;

    if (!workId) {
      return { steps, deletedMemories };
    }

    try {
      const result = await this.worksService.deleteWork(workId);
      steps.push({
        label: "清理测试作品",
        ok: result.deleted,
        detail: result.deleted ? "临时作品已删除，不会留在作品专栏。" : result.message,
        nextStep: result.deleted ? undefined : "可以在作品专栏搜索“主流程检查”，确认是否需要手动删除。"
      });
    } catch (error) {
      steps.push({
        label: "清理测试作品",
        ok: false,
        detail: this.errorMessage(error),
        nextStep: "可以在作品专栏搜索“主流程检查”，确认是否需要手动删除。"
      });
    }

    try {
      const memories = await this.memoryService.listMemory();
      const temporaryMemories = memories.filter((memory) => memory.relatedWorkIds.includes(workId));

      await Promise.all(temporaryMemories.map((memory) => this.memoryService.deleteMemory(memory.id)));
      deletedMemories = temporaryMemories.length;

      steps.push({
        label: "清理测试记忆",
        ok: true,
        detail: deletedMemories > 0 ? `已删除 ${deletedMemories} 条临时写作记忆。` : "没有留下临时写作记忆。"
      });
    } catch (error) {
      steps.push({
        label: "清理测试记忆",
        ok: false,
        detail: this.errorMessage(error),
        nextStep: "可以在写作记忆库搜索“主流程检查”或临时作品 ID，确认是否需要手动删除。"
      });
    }

    return { steps, deletedMemories };
  }

  @Post("clear-cache")
  clearCache(@Query("dryRun") dryRun?: string) {
    return this.backupsService.clearRuntimeCache(dryRun === "true");
  }

  @Post("clear-logs")
  clearLogs(@Query("dryRun") dryRun?: string) {
    return this.backupsService.clearLocalLogs(dryRun === "true");
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const expectedTables = 13;
      const tableRows = await this.prisma.$queryRaw<Array<{ table_count: number }>>`
        SELECT COUNT(*)::int AS table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'Work',
            'SceneCard',
            'Mark',
            'WorkVersion',
            'Trend',
            'DataSource',
            'CrawlerJob',
            'ReaderReport',
            'ReviewReport',
            'WritingMemory',
            'PersonalStrategy',
            'KnowledgeChunk',
            'AppSetting'
          )
      `;
      const tableCount = tableRows[0]?.table_count ?? 0;

      if (tableCount < expectedTables) {
        return {
          ok: false,
          label: "数据库",
          detail: "PostgreSQL 已启动，但数据库表还没有创建完整。",
          nextStep: "在项目目录运行 pnpm db:migrate，完成后刷新设置中心。"
        };
      }

      return {
        ok: true,
        label: "数据库",
        detail: "PostgreSQL 已连接，可以写入结构化数据。"
      };
    } catch {
      return {
        ok: false,
        label: "数据库",
        detail: "PostgreSQL 暂时不可用，作品会回退写入本地 JSON 文件。",
        nextStep: "想要长期保存到数据库时，先打开 Docker Desktop，再运行 docker compose up -d 和 pnpm db:migrate。"
      };
    }
  }

  private buildPersistenceStatus(
    database: ServiceHealth,
    storage: DirectoryHealth,
    workspace: DirectoryHealth,
    logs: DirectoryHealth
  ): PersistenceStatus {
    const paths = {
      storageDir: storage.path,
      workspaceDir: workspace.path,
      logDir: logs.path
    };
    const scope = ["作品", "编辑标记", "改稿版本", "写作记忆", "个人策略", "复盘报告"];

    if (database.ok) {
      return {
        mode: "database",
        label: "数据库持久化",
        durable: true,
        fallbackActive: false,
        detail: "作品、编辑标记、改稿版本、写作记忆、个人策略和复盘报告会优先保存到 PostgreSQL；素材、导出包和日志仍保存在本机目录。",
        scope,
        paths
      };
    }

    const fileReady = storage.ok && workspace.ok;

    return {
      mode: "local_file",
      label: "本地文件兜底",
      durable: false,
      fallbackActive: true,
      detail: fileReady
        ? "当前 Docker/PostgreSQL 未连接，作品、编辑标记、写作记忆、个人策略和复盘报告会尽量写入本机文件作为兜底；适合本地演示和连续试用，但不会伪装成数据库持久化。"
        : "当前 Docker/PostgreSQL 未连接，且本地文件目录还没有全部确认可写；请先处理文件目录，再继续长期创作。",
      scope,
      paths,
      nextStep: fileReady ? database.nextStep : storage.nextStep ?? workspace.nextStep ?? database.nextStep
    };
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || "localhost";
      const port = Number(parsed.port || 6379);
      const ok = await this.checkTcp(host, port);

      return ok
        ? {
            ok: true,
            label: "队列服务",
            detail: "Redis 已连接，公开网页采集会优先通过本地任务队列处理。"
          }
        : {
            ok: false,
            label: "队列服务",
            detail: "Redis 暂时不可用，当前仍可手动导入和写作。",
            nextStep: "想让公开网页采集进入本地队列时，先打开 Docker Desktop，再运行 docker compose up -d。"
          };
    } catch {
      return {
        ok: false,
        label: "队列服务",
        detail: "Redis 地址格式无法识别，当前仍可手动导入和写作。",
        nextStep: "检查 REDIS_URL，默认可以写成 redis://localhost:6379。"
      };
    }
  }

  private async checkKnowledgeIndex(): Promise<ServiceHealth> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ has_vector: boolean; has_vector_column: boolean; chunk_count: number }>>`
        SELECT
          EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_vector,
          EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'KnowledgeChunk'
              AND column_name = 'embeddingVector'
          ) AS has_vector_column,
          (SELECT COUNT(*)::int FROM "KnowledgeChunk") AS chunk_count
      `;
      const status = rows[0];

      if (status?.has_vector && status.has_vector_column) {
        return {
          ok: true,
          label: "本地知识库",
          detail: `pgvector 已启用，写作记忆和个人策略会优先用向量召回。当前索引 ${status.chunk_count} 条。`
        };
      }

      return {
        ok: false,
        label: "本地知识库",
        detail: "PostgreSQL 已连接，但 pgvector 知识库还没有完成迁移，当前会使用轻量本地索引兜底。",
        nextStep: "在项目目录运行 pnpm db:migrate，完成后刷新设置中心。"
      };
    } catch {
      const localChunks = await this.knowledgeService.listChunks().catch(() => []);

      return {
        ok: false,
        label: "本地知识库",
        detail: localChunks.length
          ? `PostgreSQL/pgvector 暂时不可用，当前使用本地知识库文件兜底。已有 ${localChunks.length} 条索引。`
          : "PostgreSQL/pgvector 暂时不可用；写作时仍会使用启用的记忆和策略，并在本地文件生成轻量索引。",
        nextStep: "想启用 pgvector 向量检索时，先打开 Docker Desktop，再运行 docker compose up -d 和 pnpm db:migrate。"
      };
    }
  }

  private checkTcp(host: string, port: number) {
    return new Promise<boolean>((resolveConnection) => {
      const socket = createConnection({ host, port });
      let settled = false;

      const settle = (ok: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolveConnection(ok);
      };

      socket.setTimeout(1000);
      socket.once("connect", () => settle(true));
      socket.once("timeout", () => settle(false));
      socket.once("error", () => settle(false));
    });
  }

  private async checkDirectory(label: string, configuredPath: string): Promise<DirectoryHealth> {
    const absolutePath = this.resolveLocalPath(configuredPath);

    try {
      await mkdir(absolutePath, { recursive: true });
      const summary = await this.collectDirectoryStats(absolutePath);

      return {
        ok: true,
        label,
        path: absolutePath,
        fileCount: summary.fileCount,
        sizeBytes: summary.sizeBytes,
        detail: summary.truncated ? "目录可用；文件较多，已抽样统计前 1000 个文件。" : "目录可用，可以正常读写。"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";

      return {
        ok: false,
        label,
        path: absolutePath,
        fileCount: 0,
        sizeBytes: 0,
        detail: `目录无法读写：${message}`,
        nextStep: "检查这个目录是否存在、是否有读写权限，或在 .env 里换成本机可写的位置。"
      };
    }
  }

  private async checkLaunchEntries(): Promise<LaunchEntryHealth[]> {
    const entries = [
      {
        label: "启动",
        fileName: "启动神笔马良.command",
        detail: "双击后会准备目录、依赖和可用的本地服务，并自动打开网页。"
      },
      {
        label: "停止",
        fileName: "停止神笔马良.command",
        detail: "停止网页服务和本地容器，不会删除作品、记忆和备份。"
      },
      {
        label: "体检",
        fileName: "体检神笔马良.command",
        detail: "检查配置、AI Key、Docker、数据库、队列和网页是否正常。"
      }
    ];

    return Promise.all(
      entries.map(async (entry) => {
        const filePath = resolve(this.projectRoot(), entry.fileName);

        try {
          const fileStat = await stat(filePath);
          const executable = Boolean(fileStat.mode & 0o111);

          return {
            ok: fileStat.isFile() && executable,
            label: entry.label,
            fileName: entry.fileName,
            path: filePath,
            executable,
            detail: executable ? entry.detail : `${entry.fileName} 存在，但还没有执行权限，双击时可能无法启动。`,
            nextStep: executable ? undefined : `在项目目录运行 chmod +x "${entry.fileName}"，或重新下载启动文件。`
          };
        } catch {
          return {
            ok: false,
            label: entry.label,
            fileName: entry.fileName,
            path: filePath,
            executable: false,
            detail: `没有找到 ${entry.fileName}。`,
            nextStep: "确认项目目录完整；如果文件被删了，需要从项目备份里恢复。"
          };
        }
      })
    );
  }

  private async collectDirectoryStats(root: string) {
    const stack = [root];
    let fileCount = 0;
    let sizeBytes = 0;
    let truncated = false;

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      const entries = await readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = resolve(current, entry.name);

        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const fileStat = await stat(entryPath);
        fileCount += 1;
        sizeBytes += fileStat.size;

        if (fileCount >= 1000) {
          truncated = true;
          stack.length = 0;
          break;
        }
      }
    }

    return { fileCount, sizeBytes, truncated };
  }

  private resolveLocalPath(value: string) {
    if (isAbsolute(value)) {
      return value;
    }

    return resolve(this.projectRoot(), value);
  }

  private projectRoot() {
    const cwd = process.cwd();
    return cwd.endsWith(`${sep}apps${sep}api`) ? resolve(cwd, "../..") : cwd;
  }

  private cleanText(value?: string) {
    return value?.trim() ?? "";
  }

  private countReadableText(value: string) {
    return value.replace(/\s+/g, "").length;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
  }

  private buildAiStatus(
    provider: ReturnType<AiProviderService["listProviders"]>[number],
    model: string,
    outlineModel: string,
    baseUrl: string,
    embeddingModel: string,
    hasApiKey: boolean
  ) {
    return {
      provider: provider.id,
      providerLabel: provider.label,
      mode: hasApiKey ? provider.id : "mock",
      model,
      outlineModel: provider.id === "kimi" ? outlineModel : model,
      baseUrl,
      embeddingModel: provider.id === "openai" ? embeddingModel : "本地轻量索引",
      hasApiKey,
      apiKeyEnv: provider.apiKeyEnv,
      message: hasApiKey
        ? provider.id === "kimi"
          ? `已配置 Kimi API Key，故事方案使用 ${outlineModel}，全文正文由 ${model} 主笔。`
          : `已配置 ${provider.label} API Key；正式正文仍需要 Kimi，${provider.label} 只做后台辅助。`
        : "还没有配置 API Key；故事方案可用本地临时方案，但正式全文不会保存本地替代正文。"
    };
  }

  private normalizeAiProvider(value: string) {
    if (value === "kimi" || value === "deepseek" || value === "openai") {
      return value;
    }

    return "openai";
  }

  private aiProviderInfo(providerId: "openai" | "kimi" | "deepseek") {
    return this.aiProvider.listProviders().find((provider) => provider.id === providerId) ?? this.aiProvider.listProviders()[0];
  }

  private providerTextModelFromBody(providerId: "openai" | "kimi" | "deepseek", body: UpdateSettingsBody) {
    if (providerId === "openai") {
      return this.cleanText(body.textModel) || this.cleanText(body.openAiTextModel);
    }

    if (providerId === "kimi") {
      return this.cleanText(body.textModel) || this.cleanText(body.kimiTextModel);
    }

    return this.cleanText(body.textModel) || this.cleanText(body.deepSeekTextModel);
  }

  private providerOutlineModelFromBody(providerId: "openai" | "kimi" | "deepseek", body: UpdateSettingsBody) {
    if (providerId === "kimi") {
      return this.cleanText(body.outlineModel) || this.cleanText(body.kimiOutlineModel);
    }

    return this.cleanText(body.outlineModel);
  }

  private providerBaseUrlFromBody(providerId: "openai" | "kimi" | "deepseek", body: UpdateSettingsBody) {
    if (providerId === "openai") {
      return this.cleanText(body.baseUrl);
    }

    if (providerId === "kimi") {
      return this.cleanText(body.baseUrl) || this.cleanText(body.kimiBaseUrl);
    }

    return this.cleanText(body.baseUrl) || this.cleanText(body.deepSeekBaseUrl);
  }

  private providerApiKeyFromBody(providerId: "openai" | "kimi" | "deepseek", body: UpdateSettingsBody) {
    if (providerId === "openai") {
      return this.cleanText(body.apiKey) || this.cleanText(body.openAiApiKey);
    }

    if (providerId === "kimi") {
      return this.cleanText(body.apiKey) || this.cleanText(body.kimiApiKey);
    }

    return this.cleanText(body.apiKey) || this.cleanText(body.deepSeekApiKey);
  }

  private providerModeLabel(mode: string) {
    if (mode === "kimi") return "Kimi";
    if (mode === "deepseek") return "DeepSeek";
    if (mode === "openai") return "OpenAI";
    return "真实 AI";
  }

  private async writeLocalEnv(values: Record<string, string | undefined>) {
    const filePath = resolve(this.projectRoot(), ".env.local");
    let existing = "";

    try {
      existing = await readFile(filePath, "utf8");
    } catch {
      existing = "";
    }

    const managedKeys = new Set(Object.keys(values));
    const nextLines = existing
      .split(/\r?\n/)
      .filter((line) => {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
        return !match || !managedKeys.has(match[1]);
      })
      .filter((line, index, lines) => line.trim() || index < lines.length - 1);

    for (const [key, value] of Object.entries(values)) {
      if (value) {
        nextLines.push(`${key}=${this.encodeEnvValue(value)}`);
      }
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${nextLines.join("\n")}\n`, "utf8");
  }

  private encodeEnvValue(value: string) {
    return /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : JSON.stringify(value);
  }
}
