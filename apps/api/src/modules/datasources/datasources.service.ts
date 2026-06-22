import { BadRequestException, Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Queue, QueueEvents, Worker } from "bullmq";
import { load } from "cheerio";
import Redis from "ioredis";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type {
  AuthorizedCaptureResult,
  BrowserCaptureExecutorResult,
  BrowserCaptureSession,
  BrowserCaptureSessionResult,
  CsvImportResult,
  CrawlerJobRecord,
  CrawlerJobStatus,
  DatasourceLearningResult,
  DatasourceRecord,
  DatasourceType,
  ScreenshotImportResult,
  Trend
} from "@shenbi/shared";
import { AiProviderService } from "../ai/ai-provider.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { StrategiesService } from "../strategies/strategies.service.js";
import { addRuntimeTrends, persistRuntimeTrends } from "../trends/runtime-trends.js";
import { WorksService, type WorkPerformanceImportRow } from "../works/works.service.js";

type CreateDatasourceInput = {
  name?: string;
  type?: DatasourceType;
  enabled?: boolean;
  frequency?: string;
  sourceDetail?: string;
  note?: string;
};

type UpdateDatasourceInput = Partial<CreateDatasourceInput>;

type ImportCsvInput = {
  name?: string;
  fileName?: string;
  csvText?: string;
  fieldMappings?: Record<string, string>;
};

type ImportTextInput = {
  name?: string;
  rawText?: string;
};

type ImportScreenshotInput = {
  name?: string;
  fileName?: string;
  dataUrl?: string;
  recognizedText?: string;
};

type AuthorizedCaptureInput = {
  datasourceId?: string;
  name?: string;
  pageUrl?: string;
  visibleText?: string;
  screenshotDataUrl?: string;
  screenshotFileName?: string;
};

type BrowserCaptureSessionInput = {
  datasourceId?: string;
  name?: string;
  pageUrl?: string;
  platform?: string;
};

type BrowserCaptureSessionSubmitInput = {
  visibleText?: string;
  pageUrl?: string;
};

type CorrectScreenshotInput = {
  recognizedText?: string;
};

type ImportPublicPageInput = {
  name?: string;
  url?: string;
  html?: string;
};

type SavedScreenshotFile = {
  storedPath: string;
  originalName: string;
  sizeBytes: number;
};

type SavedCsvFile = {
  storedPath: string;
  originalName: string;
  sizeBytes: number;
};

type DbDatasource = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  frequency: string;
  sourceDetail: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbCrawlerJob = {
  id: string;
  datasourceId: string | null;
  datasource?: DbDatasource | null;
  name: string;
  type: string;
  status: string;
  lastRunAt: Date | null;
  successCount: number;
  failureReason: string | null;
  sourceDetail: string | null;
  createdAt: Date;
};

type LocalDatasourceFile = {
  datasources: DatasourceRecord[];
  jobs: CrawlerJobRecord[];
};

type BrowserCaptureRuntime = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  openedAt: Date;
};

type AuthorizedVisibleQuality = {
  ok: boolean;
  emptyReason?: string;
  nextStep?: string;
  signalCount?: number;
  qualityLabel?: string;
};

const fallbackDatasources: DatasourceRecord[] = [
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
    note: "有 Kimi/OpenAI Key 时可自动识别截图文字，也支持手动校正文字。",
    persisted: false,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  }
];

const fallbackJobs: CrawlerJobRecord[] = [
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

const seedFallbackDatasources = [...fallbackDatasources];
const seedFallbackJobs = [...fallbackJobs];

@Injectable()
export class DatasourcesService implements OnModuleDestroy {
  private crawlerQueue?: Queue<ImportPublicPageInput, CsvImportResult>;
  private crawlerQueueEvents?: QueueEvents;
  private crawlerWorker?: Worker<ImportPublicPageInput, CsvImportResult>;
  private crawlerQueueConnection?: Redis;
  private crawlerEventsConnection?: Redis;
  private crawlerWorkerConnection?: Redis;
  private browserCaptureRuntimes = new Map<string, BrowserCaptureRuntime>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorksService) private readonly worksService: WorksService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(StrategiesService) private readonly strategiesService: StrategiesService,
    @Inject(AiProviderService) private readonly aiProvider: AiProviderService
  ) {}

  async onModuleDestroy() {
    await Promise.allSettled([
      this.crawlerWorker?.close(),
      this.crawlerQueueEvents?.close(),
      this.crawlerQueue?.close(),
      this.crawlerWorkerConnection?.quit(),
      this.crawlerEventsConnection?.quit(),
      this.crawlerQueueConnection?.quit(),
      ...Array.from(this.browserCaptureRuntimes.values()).map((runtime) => runtime.browser.close())
    ]);
    this.browserCaptureRuntimes.clear();
  }

  async listDatasources(): Promise<DatasourceRecord[]> {
    try {
      await this.ensureSeedDatasources();
      const datasources = await this.prisma.dataSource.findMany({
        orderBy: { updatedAt: "desc" }
      });

      return datasources.map((datasource) => this.toDatasource(datasource as DbDatasource, true));
    } catch {
      return this.listLocalDatasources();
    }
  }

  async createDatasource(input: CreateDatasourceInput = {}) {
    const draft = this.normalizeDatasourceInput(input);

    try {
      const datasource = await this.prisma.dataSource.create({ data: draft });
      return {
        datasource: this.toDatasource(datasource as DbDatasource, true),
        message: "数据源已保存到本地数据库。"
      };
    } catch {
      const datasource: DatasourceRecord = {
        id: `source-local-${Date.now()}`,
        name: draft.name,
        type: draft.type,
        enabled: draft.enabled,
        frequency: draft.frequency,
        sourceDetail: draft.sourceDetail,
        note: draft.note ?? "",
        persisted: false,
        createdAt: this.today(),
        updatedAt: this.today()
      };
      fallbackDatasources.unshift(datasource);
      const localData = await this.readLocalDatasourceFile();
      await this.writeLocalDatasourceFile({
        datasources: [datasource, ...localData.datasources],
        jobs: localData.jobs
      });

      return {
        datasource,
        message: "数据库还没有连接成功，数据源已保存到本地文件。"
      };
    }
  }

  async updateDatasource(id: string, input: UpdateDatasourceInput = {}) {
    const datasourceId = id.trim();

    if (!datasourceId) {
      throw new BadRequestException("请提供要更新的数据源。");
    }

    try {
      const datasource = await this.prisma.dataSource.update({
        where: { id: datasourceId },
        data: this.normalizeDatasourceUpdateInput(input)
      });

      return {
        datasource: this.toDatasource(datasource as DbDatasource, true),
        message: "数据源设置已保存到本地数据库。"
      };
    } catch {
      const localData = await this.readLocalDatasourceFile();
      const datasources = this.sortDatasources(this.uniqueDatasources([...localData.datasources, ...fallbackDatasources]));
      const jobs = this.sortJobs(this.uniqueJobs([...localData.jobs, ...fallbackJobs]));
      const existing = datasources.find((datasource) => datasource.id === datasourceId);

      if (!existing) {
        throw new BadRequestException("没有找到这个数据源。");
      }

      const updatedDatasource: DatasourceRecord = {
        ...existing,
        ...this.normalizeLocalDatasourceUpdateInput(existing, input),
        persisted: false,
        updatedAt: this.today()
      };
      const nextDatasources = this.sortDatasources([updatedDatasource, ...datasources.filter((datasource) => datasource.id !== datasourceId)]);

      this.replaceFallbackData(nextDatasources, jobs);
      await this.writeLocalDatasourceFile({
        datasources: nextDatasources,
        jobs
      });

      return {
        datasource: updatedDatasource,
        message: "数据库还没有连接成功，数据源设置已保存到本地文件。"
      };
    }
  }

  async listJobs(): Promise<CrawlerJobRecord[]> {
    try {
      await this.ensureSeedDatasources();
      const jobs = await this.prisma.crawlerJob.findMany({
        include: { datasource: true },
        orderBy: { createdAt: "desc" }
      });

      return jobs.map((job) => this.toJob(job as DbCrawlerJob, true));
    } catch {
      return this.listLocalJobs();
    }
  }

  async importCsv(input: ImportCsvInput = {}): Promise<CsvImportResult> {
    const csvText = input.csvText?.trim() ?? "";
    const csvFile = await this.saveCsvFile(input);
    const rows = this.applyCsvFieldMappings(this.parseCsv(csvText), input.fieldMappings);
    const importedTrends = this.rowsToTrends(rows, {
      idPrefix: "csv-trend",
      defaultPlatform: "手动导入",
      defaultReason: "来自 CSV 导入，建议结合榜单和评论继续判断。"
    });
    const importedWorks = this.rowsToWorkPerformance(rows);

    return this.saveImportedTrends({
      name: input.name,
      defaultName: "作品数据 CSV 导入",
      datasourceType: "csv",
      jobType: "csv",
      sourceLabel: "CSV",
      rows,
      importedTrends,
      importedWorks,
      sourceDetail: csvFile?.storedPath,
      emptyReason: "CSV 内容为空，或没有识别到表头和数据行。"
    });
  }

  async importText(input: ImportTextInput = {}): Promise<CsvImportResult> {
    const rawText = input.rawText?.trim() ?? "";
    const rows = this.uniqueRows([
      ...this.parseManualText(rawText),
      ...this.parseLabeledPerformanceBlocks(rawText)
    ]);
    const importedTrends = this.rowsToTrends(rows, {
      idPrefix: "manual-trend",
      defaultPlatform: "手动粘贴",
      defaultReason: "来自手动粘贴的平台文字，建议结合榜单和评论继续判断。"
    });
    const importedWorks = this.rowsToWorkPerformance(rows);

    return this.saveImportedTrends({
      name: input.name,
      defaultName: "平台文字粘贴导入",
      datasourceType: "manual",
      jobType: "manual",
      sourceLabel: "手动粘贴",
      rows,
      importedTrends,
      importedWorks,
      emptyReason: "粘贴内容为空，或没有识别到题材、赛道等可用信息。"
    });
  }

  async runAuthorizedCapture(input: AuthorizedCaptureInput = {}): Promise<AuthorizedCaptureResult> {
    const datasourceName = input.name?.trim() || "番茄作者后台授权采集";
    const pageUrl = input.pageUrl?.trim() || input.datasourceId?.trim() || "https://fanqienovel.com/writer/zone";
    const visibleText = input.visibleText?.trim() ?? "";
    const screenshotDataUrl = input.screenshotDataUrl?.trim() ?? "";

    if (visibleText) {
      const { rows, importedTrends, importedWorks, quality } = this.buildAuthorizedVisibleImport(visibleText, pageUrl);
      const importResult = await this.saveImportedTrends({
        name: datasourceName,
        defaultName: "授权可见页采集",
        datasourceType: "manual",
        jobType: "manual",
        sourceLabel: "授权可见页",
        sourceDetail: pageUrl,
        rows,
        importedTrends,
        importedWorks,
        emptyReason: quality.emptyReason || `授权可见页没有识别到作品名、题材、阅读量、收益、完读率或评论反馈。来源：${pageUrl}`
      });

      return {
        ...importResult,
        captureMode: "visible_text",
        pageUrl,
        nextStep: rows.length
          ? "已把可见页数据写入趋势、作品表现和后续写作记忆召回链路。"
          : quality.nextStep || "页面文字已接收，但没有识别到可用字段；可以换详情页或让截图 OCR 继续识别。"
      };
    }

    if (screenshotDataUrl) {
      const importResult = await this.importScreenshot({
        name: datasourceName,
        fileName: input.screenshotFileName || "fanqie-authorized-visible-page.png",
        dataUrl: screenshotDataUrl
      });

      return {
        ...importResult,
        captureMode: "screenshot",
        pageUrl,
        nextStep: importResult.parsedRows
          ? "截图可见数据已识别并入库。"
          : "截图已保存为等待校正任务，后续可由 OCR 或人工校正补全。"
      };
    }

    return this.createWaitingAuthorizedCapture({
      name: datasourceName,
      pageUrl,
      datasourceId: input.datasourceId
    });
  }

  async startBrowserCaptureSession(input: BrowserCaptureSessionInput = {}): Promise<BrowserCaptureSessionResult> {
    const pageUrl = input.pageUrl?.trim() || "https://fanqienovel.com/writer/zone";
    const capture = await this.createWaitingAuthorizedCapture({
      name: input.name?.trim() || "番茄作者后台浏览器采集",
      pageUrl,
      datasourceId: input.datasourceId
    });
    const session = this.authorizedCaptureResultToBrowserSession(capture, input.platform);

    return {
      session,
      capture,
      message: "本地浏览器采集会话已创建。",
      nextStep: "等待你完成登录和平台确认后，由本地执行器读取已经可见的页面文字并回填。"
    };
  }

  async getBrowserCaptureSession(id: string): Promise<BrowserCaptureSessionResult> {
    const job = await this.getJob(id);
    this.assertBrowserCaptureJob(job);
    const session = this.jobToBrowserCaptureSession(job);

    return {
      session,
      message: this.browserSessionStatusMessage(session),
      nextStep: session.nextStep
    };
  }

  async openBrowserCaptureSession(id: string): Promise<BrowserCaptureExecutorResult> {
    const job = await this.getJob(id);
    this.assertBrowserCaptureJob(job);
    const session = this.jobToBrowserCaptureSession(job);

    try {
      const runtime = await this.ensureBrowserCaptureRuntime(session);
      const pageUrl = runtime.page.url() || session.pageUrl;

      return {
        session: this.jobToBrowserCaptureSession(job, { pageUrl }),
        executorAvailable: true,
        opened: true,
        pageUrl,
        visibleTextLength: 0,
        message: "本地执行器浏览器已打开。",
        nextStep: "请在新打开的浏览器里完成登录、验证码和平台确认，然后回到本页点击“读取当前页”。"
      };
    } catch (error) {
      return {
        session,
        executorAvailable: false,
        opened: false,
        pageUrl: session.pageUrl,
        visibleTextLength: 0,
        message: `本地执行器浏览器暂时打不开：${this.errorMessage(error)}`,
        nextStep: "可以先用外部浏览器打开番茄后台，再把当前页可见文字放进兜底框执行采集。"
      };
    }
  }

  async previewBrowserCaptureSessionVisiblePage(id: string): Promise<BrowserCaptureExecutorResult> {
    const job = await this.getJob(id);
    this.assertBrowserCaptureJob(job);
    const session = this.jobToBrowserCaptureSession(job);

    let runtime: BrowserCaptureRuntime;

    try {
      runtime = await this.ensureBrowserCaptureRuntime(session);
    } catch (error) {
      return {
        session,
        executorAvailable: false,
        opened: false,
        pageUrl: session.pageUrl,
        visibleTextLength: 0,
        message: `本地执行器浏览器暂时不可用：${this.errorMessage(error)}`,
        nextStep: "可以先用外部浏览器打开番茄后台，再把当前页可见文字放进兜底框执行采集。"
      };
    }

    const pageUrl = runtime.page.url() || session.pageUrl;
    const visibleText = await this.readRuntimeVisibleText(runtime.page);
    const nextSession = this.jobToBrowserCaptureSession(job, { pageUrl });

    if (!visibleText) {
      return {
        session: nextSession,
        executorAvailable: true,
        opened: true,
        pageUrl,
        visibleTextLength: 0,
        capturedAt: new Date().toISOString(),
        message: "当前页还没有读到可见文字。",
        nextStep: "确认番茄后台页面已经加载完成，并停留在作品数据、评论或活动页后再读取。"
      };
    }

    return {
      session: nextSession,
      executorAvailable: true,
      opened: true,
      pageUrl,
      visibleText,
      visibleTextLength: visibleText.length,
      visibleTextPreview: this.visibleTextPreview(visibleText),
      capturedAt: new Date().toISOString(),
      message: `已读取当前页 ${visibleText.length} 个字符，尚未入库。`,
      nextStep: "请在本地页面复核可见文字，确认后点击“导入当前可见内容”。"
    };
  }

  async readBrowserCaptureSessionVisiblePage(id: string): Promise<BrowserCaptureExecutorResult> {
    const job = await this.getJob(id);
    this.assertBrowserCaptureJob(job);
    const session = this.jobToBrowserCaptureSession(job);

    let runtime: BrowserCaptureRuntime;

    try {
      runtime = await this.ensureBrowserCaptureRuntime(session);
    } catch (error) {
      return {
        session,
        executorAvailable: false,
        opened: false,
        pageUrl: session.pageUrl,
        visibleTextLength: 0,
        message: `本地执行器浏览器暂时不可用：${this.errorMessage(error)}`,
        nextStep: "可以先用外部浏览器打开番茄后台，再把当前页可见文字放进兜底框执行采集。"
      };
    }

    const pageUrl = runtime.page.url() || session.pageUrl;
    const visibleText = await this.readRuntimeVisibleText(runtime.page);

    if (!visibleText) {
      return {
        session: this.jobToBrowserCaptureSession(job, { pageUrl }),
        executorAvailable: true,
        opened: true,
        pageUrl,
        visibleTextLength: 0,
        capturedAt: new Date().toISOString(),
        message: "当前页还没有读到可见文字。",
        nextStep: "确认番茄后台页面已经加载完成，并停留在作品数据、评论或活动页后再读取。"
      };
    }

    const result = await this.submitBrowserCaptureSession(id, { visibleText, pageUrl });

    return {
      ...result,
      executorAvailable: true,
      opened: true,
      pageUrl,
      visibleText,
      visibleTextLength: visibleText.length,
      visibleTextPreview: this.visibleTextPreview(visibleText),
      capturedAt: new Date().toISOString()
    };
  }

  async submitBrowserCaptureSession(id: string, input: BrowserCaptureSessionSubmitInput = {}): Promise<BrowserCaptureSessionResult> {
    const sessionId = id.trim();
    const visibleText = input.visibleText?.trim() ?? "";
    const pageUrl = input.pageUrl?.trim();

    if (!sessionId) {
      throw new BadRequestException("请提供浏览器采集会话。");
    }

    if (!visibleText) {
      throw new BadRequestException("执行器没有回填可见页面文字。");
    }

    let databaseJob: DbCrawlerJob | null = null;

    try {
      const job = await this.prisma.crawlerJob.findUnique({
        where: { id: sessionId },
        include: { datasource: true }
      });
      databaseJob = job as DbCrawlerJob | null;
    } catch {
      // 数据库不可用时走本地文件回退。
    }

    if (databaseJob) {
      return this.completeDbBrowserCaptureSession(databaseJob, visibleText, pageUrl);
    }

    return this.completeLocalBrowserCaptureSession(sessionId, visibleText, pageUrl);
  }

  async importScreenshot(input: ImportScreenshotInput = {}): Promise<ScreenshotImportResult> {
    const screenshot = await this.saveScreenshotFile(input);
    const datasourceName = input.name?.trim() || "作者后台截图导入";
    const manualText = input.recognizedText?.trim() ?? "";
    const ocrResult = manualText ? null : await this.aiProvider.extractScreenshotText(input.dataUrl ?? "");
    const recognizedText = manualText || ocrResult?.recognizedText.trim() || "";

    if (recognizedText) {
      const rows = this.parseScreenshotCorrectionText(recognizedText);
      const sourceLabel = manualText ? "截图校正文字" : "截图自动识别";
      const importedTrends = this.rowsToTrends(rows, {
        idPrefix: "screenshot-trend",
        defaultPlatform: "截图校正",
        defaultReason: `来自${sourceLabel}，原图保存在 ${screenshot.storedPath}。`
      });
      const importedWorks = this.rowsToWorkPerformance(rows);
      const importResult = await this.saveImportedTrends({
        name: datasourceName,
        defaultName: "作者后台截图导入",
        datasourceType: "screenshot",
        jobType: "screenshot",
        sourceLabel,
        sourceDetail: screenshot.storedPath,
        rows,
        importedTrends,
        importedWorks,
        emptyReason: `截图已保存，但${manualText ? "校正文字" : "自动识别文字"}里没有识别到题材或作品表现字段。`
      });

      return {
        ...importResult,
        storedPath: screenshot.storedPath,
        originalName: screenshot.originalName,
        sizeBytes: screenshot.sizeBytes,
        recognizedText,
        ocrProviderMode: ocrResult?.providerMode,
        ocrNotice: ocrResult?.providerNotice,
        message: `截图已保存。${importResult.message}`
      };
    }

    const note = `截图已保存到 ${screenshot.storedPath}。${ocrResult?.providerNotice ?? "暂时没有识别文字，本任务会保留为等待校正状态。"}`;
    const failureReason =
      ocrResult?.providerNotice ?? "截图已入库，但暂时没有识别文字，后续可补充截图文字后重新导入。";

    try {
      const datasource = await this.prisma.dataSource.create({
        data: {
          name: datasourceName,
          type: "screenshot",
          enabled: true,
          frequency: "手动",
          sourceDetail: screenshot.storedPath,
          note
        }
      });
      const job = await this.prisma.crawlerJob.create({
        data: {
          datasourceId: datasource.id,
          name: datasource.name,
          type: "screenshot",
          status: "waiting",
          lastRunAt: new Date(),
          successCount: 1,
          failureReason,
          sourceDetail: screenshot.storedPath
        }
      });

      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "screenshot",
        status: "waiting",
        successCount: 1,
        message: failureReason,
        source: screenshot.storedPath
      });

      return {
        datasource: this.toDatasource(datasource as DbDatasource, true),
        job: this.toJob({ ...(job as DbCrawlerJob), datasource: datasource as DbDatasource }, true),
        parsedRows: 0,
        trendsCreated: 0,
        worksUpdated: 0,
        worksCreated: 0,
        persisted: true,
        storedPath: screenshot.storedPath,
        originalName: screenshot.originalName,
        sizeBytes: screenshot.sizeBytes,
        ocrProviderMode: ocrResult?.providerMode,
        ocrNotice: ocrResult?.providerNotice,
        message: "截图已保存到本地，自动识别暂未得到可用文字，任务已登记为等待校正。"
      };
    } catch {
      const datasource: DatasourceRecord = {
        id: `source-screenshot-${Date.now()}`,
        name: datasourceName,
        type: "screenshot",
        enabled: true,
        frequency: "手动",
        sourceDetail: screenshot.storedPath,
        note,
        persisted: false,
        createdAt: this.today(),
        updatedAt: this.today()
      };
      const job: CrawlerJobRecord = {
        id: `job-screenshot-${Date.now()}`,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "screenshot",
        status: "waiting",
        lastRunAt: this.formatDateTime(new Date()),
        successCount: 1,
        failureReason,
        sourceDetail: screenshot.storedPath,
        persisted: false,
        createdAt: this.today()
      };

      fallbackDatasources.unshift(datasource);
      fallbackJobs.unshift(job);
      const localData = await this.readLocalDatasourceFile();
      await this.writeLocalDatasourceFile({
        datasources: [datasource, ...localData.datasources],
        jobs: [job, ...localData.jobs]
      });
      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "screenshot",
        status: "waiting",
        successCount: 1,
        message: failureReason,
        source: screenshot.storedPath
      });

      return {
        datasource,
        job,
        parsedRows: 0,
        trendsCreated: 0,
        worksUpdated: 0,
        worksCreated: 0,
        persisted: false,
        storedPath: screenshot.storedPath,
        originalName: screenshot.originalName,
        sizeBytes: screenshot.sizeBytes,
        ocrProviderMode: ocrResult?.providerMode,
        ocrNotice: ocrResult?.providerNotice,
        message: "数据库还没有连接成功，截图已保存到本地文件，自动识别暂未得到可用文字，任务已登记为等待校正。"
      };
    }
  }

  async correctScreenshotJob(id: string, input: CorrectScreenshotInput = {}): Promise<CsvImportResult> {
    const recognizedText = input.recognizedText?.trim() ?? "";

    if (!recognizedText) {
      throw new BadRequestException("请先粘贴截图里的文字或校正后的文字。");
    }

    let databaseJob: DbCrawlerJob | null = null;

    try {
      const job = await this.prisma.crawlerJob.findUnique({
        where: { id },
        include: { datasource: true }
      });
      databaseJob = job as DbCrawlerJob | null;
    } catch {
      // 数据库不可用时走本地文件回退。
    }

    if (databaseJob) {
      return this.correctDbScreenshotJob(databaseJob, recognizedText);
    }

    return this.correctLocalScreenshotJob(id, recognizedText);
  }

  async importPublicPage(input: ImportPublicPageInput = {}): Promise<CsvImportResult> {
    const queuedResult = await this.importPublicPageThroughQueue(input);

    if (queuedResult) {
      return queuedResult;
    }

    return {
      ...(await this.importPublicPageDirect(input)),
      queueMode: "direct"
    };
  }

  private async importPublicPageDirect(input: ImportPublicPageInput = {}): Promise<CsvImportResult> {
    const datasourceName = input.name?.trim() || "公开网页采集";
    const sourceUrl = this.normalizePublicUrl(input.url);

    try {
      const html = input.html?.trim() || (await this.fetchPublicPage(sourceUrl));
      const rows = this.publicPageToRows(html, sourceUrl);
      const importedTrends = this.rowsToTrends(rows, {
        idPrefix: "public-page-trend",
        defaultPlatform: this.inferPlatform(sourceUrl),
        defaultReason: `来自公开页面 ${sourceUrl}，建议人工核对后再用于选题。`
      });

      return this.saveImportedTrends({
        name: datasourceName,
        defaultName: "公开网页采集",
        datasourceType: "public_page",
        jobType: "public_page",
        sourceLabel: "公开网页",
        sourceDetail: sourceUrl,
        rows,
        importedTrends,
        emptyReason: `公开页面没有识别到题材、赛道或热度线索。来源：${sourceUrl}`
      });
    } catch (error) {
      return this.saveImportedTrends({
        name: datasourceName,
        defaultName: "公开网页采集",
        datasourceType: "public_page",
        jobType: "public_page",
        sourceLabel: "公开网页",
        sourceDetail: sourceUrl,
        rows: [],
        importedTrends: [],
        emptyReason: `公开页面读取失败：${this.errorMessage(error)}`
      });
    }
  }

  async runCrawlerJob(input: ImportPublicPageInput = {}) {
    return this.importPublicPage(input);
  }

  async retryCrawlerJob(id: string) {
    const job = await this.getJob(id);

    if (job.type !== "public_page" && job.type !== "public_rank") {
      throw new BadRequestException("目前只有公开网页采集任务支持一键重试。");
    }

    const sourceUrl = this.publicPageRetryUrl(job);

    if (!sourceUrl) {
      throw new BadRequestException("这条任务没有保留公开网页地址，请在公开网页采集区域重新填写网址。");
    }

    return this.importPublicPage({
      name: `${job.name} 重试`,
      url: sourceUrl
    });
  }

  private async correctDbScreenshotJob(job: DbCrawlerJob, recognizedText: string): Promise<CsvImportResult> {
    if (this.toJobType(job.type) !== "screenshot") {
      throw new BadRequestException("这条任务不是截图任务，不能按截图校正处理。");
    }

    const sourceDetail = this.jobSourceDetail(job);
    const rows = this.parseScreenshotCorrectionText(recognizedText);
    const importedTrends = this.rowsToTrends(rows, {
      idPrefix: "screenshot-correction-trend",
      defaultPlatform: "截图校正",
      defaultReason: `来自截图补充校正，原图${sourceDetail ? `保存在 ${sourceDetail}` : "已保存到本地"}。`
    });
    const importedWorks = this.rowsToWorkPerformance(rows);
    const sourceLabel = "截图补充校正";
    const importedAt = new Date().toISOString();
    const trendsWithSource = importedTrends.map((trend) => ({
      ...trend,
      sourceLabel,
      sourceDetail
    }));
    const performanceRows = importedWorks.map((work) => ({
      ...work,
      sourceLabel,
      sourceDetail,
      importedAt
    }));
    const status: CrawlerJobStatus = rows.length > 0 ? "success" : "failed";
    const failureReason = rows.length > 0 ? "" : "校正文字里没有识别到题材、作品名、阅读量、收益或评论反馈等可用字段。";

    addRuntimeTrends(trendsWithSource);

    if (trendsWithSource.length > 0) {
      await this.prisma.trend.createMany({
        data: trendsWithSource.map((trend) => ({
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
        }))
      });
    }

    const workImport = await this.worksService.importPerformanceRows(performanceRows);
    const learningCreated = await this.createDatasourceLearning({
      sourceLabel,
      sourceDetail,
      rows,
      trends: trendsWithSource,
      performanceRows,
      works: workImport.works
    });
    const successMessage = this.appendLearningMessage(
      this.importMessage(sourceLabel, "已校正导入", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
      learningCreated
    );
    const datasourceName = job.datasource?.name ?? job.name;
    const datasource =
      job.datasource ??
      (await this.prisma.dataSource.create({
        data: {
          name: datasourceName,
          type: "screenshot",
          enabled: true,
          frequency: "手动",
          sourceDetail,
          note: sourceDetail ? `来源：${sourceDetail}。` : "截图补充校正。"
        }
      }));
    const note = `${sourceDetail ? `来源：${sourceDetail}。` : ""}已补充校正 ${rows.length} 行，其中 ${trendsWithSource.length} 行可作为趋势数据，${performanceRows.length} 行可作为作品表现。`;

    await this.prisma.dataSource.update({
      where: { id: datasource.id },
      data: {
        sourceDetail,
        note
      }
    });
    const updatedJob = await this.prisma.crawlerJob.update({
      where: { id: job.id },
      data: {
        datasourceId: datasource.id,
        status,
        lastRunAt: new Date(),
        successCount: rows.length,
        failureReason,
        sourceDetail
      },
      include: { datasource: true }
    });

    await this.writeCrawlerLogSafe({
      jobId: updatedJob.id,
      datasourceId: datasource.id,
      name: datasourceName,
      type: "screenshot",
      status,
      successCount: rows.length,
      message: failureReason || successMessage,
      source: sourceDetail
    });

    return {
      datasource: this.toDatasource({ ...(datasource as DbDatasource), note } as DbDatasource, true),
      job: this.toJob(updatedJob as DbCrawlerJob, true),
      parsedRows: rows.length,
      trendsCreated: trendsWithSource.length,
      worksUpdated: workImport.updated,
      worksCreated: workImport.created,
      learningCreated,
      persisted: true,
      message: failureReason || successMessage
    };
  }

  private async correctLocalScreenshotJob(id: string, recognizedText: string): Promise<CsvImportResult> {
    const localData = await this.readLocalDatasourceFile();
    const jobs = this.sortJobs(this.uniqueJobs([...localData.jobs, ...fallbackJobs]));
    const targetJob = jobs.find((job) => job.id === id);

    if (!targetJob) {
      throw new BadRequestException("没有找到这条等待校正的截图任务。");
    }

    if (targetJob.type !== "screenshot") {
      throw new BadRequestException("这条任务不是截图任务，不能按截图校正处理。");
    }

    const datasources = this.sortDatasources(this.uniqueDatasources([...localData.datasources, ...fallbackDatasources]));
    const sourceDetail = this.jobSourceDetail(targetJob, datasources);
    const rows = this.parseScreenshotCorrectionText(recognizedText);
    const importedTrends = this.rowsToTrends(rows, {
      idPrefix: "screenshot-correction-trend",
      defaultPlatform: "截图校正",
      defaultReason: `来自截图补充校正，原图${sourceDetail ? `保存在 ${sourceDetail}` : "已保存到本地"}。`
    });
    const importedWorks = this.rowsToWorkPerformance(rows);
    const sourceLabel = "截图补充校正";
    const importedAt = new Date().toISOString();
    const trendsWithSource = importedTrends.map((trend) => ({
      ...trend,
      sourceLabel,
      sourceDetail
    }));
    const performanceRows = importedWorks.map((work) => ({
      ...work,
      sourceLabel,
      sourceDetail,
      importedAt
    }));
    const workImport = await this.worksService.importPerformanceRows(performanceRows);
    const learningCreated = await this.createDatasourceLearning({
      sourceLabel,
      sourceDetail,
      rows,
      trends: trendsWithSource,
      performanceRows,
      works: workImport.works
    });
    const successMessage = this.appendLearningMessage(
      this.importMessage(sourceLabel, "已校正导入本地文件", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
      learningCreated
    );
    const status: CrawlerJobStatus = rows.length > 0 ? "success" : "failed";
    const failureReason = rows.length > 0 ? "" : "校正文字里没有识别到题材、作品名、阅读量、收益或评论反馈等可用字段。";
    const datasource =
      datasources.find((item) => item.id === targetJob.datasourceId) ??
      ({
        id: targetJob.datasourceId ?? `source-screenshot-correction-${Date.now()}`,
        name: targetJob.name,
        type: "screenshot",
        enabled: true,
        frequency: "手动",
        sourceDetail,
        note: sourceDetail ? `来源：${sourceDetail}。` : "截图补充校正。",
        persisted: false,
        createdAt: this.today(),
        updatedAt: this.today()
      } satisfies DatasourceRecord);
    const updatedDatasource: DatasourceRecord = {
      ...datasource,
      sourceDetail,
      note: `${sourceDetail ? `来源：${sourceDetail}。` : ""}已补充校正 ${rows.length} 行，其中 ${trendsWithSource.length} 行可作为趋势数据，${performanceRows.length} 行可作为作品表现。`,
      updatedAt: this.today()
    };
    const updatedJob: CrawlerJobRecord = {
      ...targetJob,
      datasourceId: updatedDatasource.id,
      status,
      lastRunAt: this.formatDateTime(new Date()),
      successCount: rows.length,
      failureReason,
      sourceDetail,
      persisted: false
    };
    const nextDatasources = [updatedDatasource, ...datasources.filter((item) => item.id !== updatedDatasource.id)];
    const nextJobs = [updatedJob, ...jobs.filter((job) => job.id !== updatedJob.id)];

    addRuntimeTrends(trendsWithSource);
    await Promise.all([
      this.writeLocalDatasourceFile({
        datasources: nextDatasources,
        jobs: nextJobs
      }),
      persistRuntimeTrends(trendsWithSource)
    ]);
    this.replaceFallbackData(nextDatasources, nextJobs);
    await this.writeCrawlerLogSafe({
      jobId: updatedJob.id,
      datasourceId: updatedDatasource.id,
      name: updatedDatasource.name,
      type: "screenshot",
      status,
      successCount: rows.length,
      message: failureReason || successMessage,
      source: sourceDetail
    });

    return {
      datasource: updatedDatasource,
      job: updatedJob,
      parsedRows: rows.length,
      trendsCreated: trendsWithSource.length,
      worksUpdated: workImport.updated,
      worksCreated: workImport.created,
      learningCreated,
      persisted: false,
      message: failureReason || successMessage
    };
  }

  private async importPublicPageThroughQueue(input: ImportPublicPageInput = {}): Promise<CsvImportResult | null> {
    const queueReady = await this.ensureCrawlerQueue();

    if (!queueReady || !this.crawlerQueue || !this.crawlerQueueEvents) {
      return null;
    }

    try {
      const job = await this.crawlerQueue.add("public-page", input, {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 1000
        },
        removeOnComplete: 50,
        removeOnFail: 50
      });
      const result = (await job.waitUntilFinished(this.crawlerQueueEvents, 30000)) as CsvImportResult;

      return {
        ...result,
        queueMode: "redis",
        queueJobId: String(job.id),
        message: `已通过本地任务队列处理。${result.message}`
      };
    } catch {
      return null;
    }
  }

  private async ensureCrawlerQueue() {
    if (this.crawlerQueue && this.crawlerQueueEvents && this.crawlerWorker) {
      return true;
    }

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

    try {
      const queueConnection = this.createRedisConnection(redisUrl);
      const eventsConnection = this.createRedisConnection(redisUrl);
      const workerConnection = this.createRedisConnection(redisUrl);

      await Promise.all([queueConnection.connect(), eventsConnection.connect(), workerConnection.connect()]);
      await queueConnection.ping();

      this.crawlerQueueConnection = queueConnection;
      this.crawlerEventsConnection = eventsConnection;
      this.crawlerWorkerConnection = workerConnection;
      this.crawlerQueue = new Queue<ImportPublicPageInput, CsvImportResult>("shenbi-crawler", {
        connection: queueConnection
      });
      this.crawlerQueueEvents = new QueueEvents("shenbi-crawler", {
        connection: eventsConnection
      });
      await this.crawlerQueueEvents.waitUntilReady();
      this.crawlerWorker = new Worker<ImportPublicPageInput, CsvImportResult>(
        "shenbi-crawler",
        async (job) => this.importPublicPageDirect(job.data),
        {
          connection: workerConnection,
          concurrency: this.crawlerConcurrency()
        }
      );
      this.crawlerWorker.on("failed", (job, error) => {
        this.writeCrawlerLogSafe({
          jobId: job?.id ? String(job.id) : `queue-failed-${Date.now()}`,
          name: job?.name ?? "公开网页采集",
          type: "public_page",
          status: "failed",
          successCount: 0,
          message: `队列任务失败：${this.errorMessage(error)}`
        }).catch(() => undefined);
      });

      return true;
    } catch {
      await this.closeCrawlerQueue();
      return false;
    }
  }

  private createRedisConnection(redisUrl: string) {
    const connection = new Redis(redisUrl, {
      connectTimeout: 800,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: () => null
    });

    connection.on("error", () => undefined);

    return connection;
  }

  private async closeCrawlerQueue() {
    await Promise.allSettled([
      this.crawlerWorker?.close(),
      this.crawlerQueueEvents?.close(),
      this.crawlerQueue?.close(),
      this.crawlerWorkerConnection?.disconnect(),
      this.crawlerEventsConnection?.disconnect(),
      this.crawlerQueueConnection?.disconnect()
    ]);

    this.crawlerWorker = undefined;
    this.crawlerQueueEvents = undefined;
    this.crawlerQueue = undefined;
    this.crawlerWorkerConnection = undefined;
    this.crawlerEventsConnection = undefined;
    this.crawlerQueueConnection = undefined;
  }

  private crawlerConcurrency() {
    const parsed = Number(process.env.CRAWLER_CONCURRENCY ?? 1);
    return Number.isFinite(parsed) ? Math.min(4, Math.max(1, Math.round(parsed))) : 1;
  }

  async getJob(id: string) {
    const jobs = await this.listJobs();
    const job = jobs.find((item) => item.id === id);

    if (!job) {
      throw new BadRequestException("没有找到这条采集任务。");
    }

    return job;
  }

  private async completeDbBrowserCaptureSession(job: DbCrawlerJob, visibleText: string, pageUrlOverride?: string): Promise<BrowserCaptureSessionResult> {
    this.assertBrowserCaptureJob(job);

    const pageUrl = pageUrlOverride || this.jobSourceDetail(job) || "https://fanqienovel.com/writer/zone";
    const datasourceName = job.datasource?.name ?? job.name;
    const { rows, importedTrends, importedWorks, quality } = this.buildAuthorizedVisibleImport(visibleText, pageUrl);
    const sourceLabel = "浏览器可见页";
    const importedAt = new Date().toISOString();
    const trendsWithSource = importedTrends.map((trend) => ({
      ...trend,
      sourceLabel,
      sourceDetail: pageUrl
    }));
    const performanceRows = importedWorks.map((work) => ({
      ...work,
      sourceLabel,
      sourceDetail: pageUrl,
      importedAt
    }));
    const status: CrawlerJobStatus = rows.length > 0 ? "success" : "failed";
    const failureReason =
      rows.length > 0 ? "" : quality.emptyReason || `浏览器可见页没有识别到作品名、题材、阅读量、收益、完读率或评论反馈。来源：${pageUrl}`;
    const note = this.browserCaptureImportNote(pageUrl, rows.length, trendsWithSource.length, performanceRows.length);

    addRuntimeTrends(trendsWithSource);

    if (trendsWithSource.length > 0) {
      await this.prisma.trend.createMany({
        data: trendsWithSource.map((trend) => ({
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
        }))
      });
    }

    const workImport = await this.worksService.importPerformanceRows(performanceRows);
    const learningCreated = await this.createDatasourceLearning({
      sourceLabel,
      sourceDetail: pageUrl,
      rows,
      trends: trendsWithSource,
      performanceRows,
      works: workImport.works
    });
    const datasource =
      job.datasource ??
      (await this.prisma.dataSource.create({
        data: {
          name: datasourceName,
          type: "manual",
          enabled: true,
          frequency: "授权后自动",
          sourceDetail: pageUrl,
          note
        }
      }));
    const updatedDatasource = await this.prisma.dataSource.update({
      where: { id: datasource.id },
      data: {
        sourceDetail: pageUrl,
        note
      }
    });
    const updatedJob = await this.prisma.crawlerJob.update({
      where: { id: job.id },
      data: {
        datasourceId: updatedDatasource.id,
        status,
        lastRunAt: new Date(),
        successCount: rows.length,
        failureReason,
        sourceDetail: pageUrl
      },
      include: { datasource: true }
    });
    const finalMessage =
      failureReason ||
      this.appendLearningMessage(
        this.importMessage(sourceLabel, "已回填入库", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
        learningCreated
      );

    await this.writeCrawlerLogSafe({
      jobId: updatedJob.id,
      datasourceId: updatedDatasource.id,
      name: updatedDatasource.name,
      type: "manual",
      status,
      successCount: rows.length,
      message: finalMessage,
      source: pageUrl
    });

    const capture: AuthorizedCaptureResult = {
      datasource: this.toDatasource(updatedDatasource as DbDatasource, true),
      job: this.toJob(updatedJob as DbCrawlerJob, true),
      parsedRows: rows.length,
      trendsCreated: trendsWithSource.length,
      worksUpdated: workImport.updated,
      worksCreated: workImport.created,
      learningCreated,
      persisted: true,
      captureMode: "visible_text",
      pageUrl,
      nextStep: rows.length
        ? "已把浏览器可见页数据写入趋势、作品表现和后续写作记忆召回链路。"
        : quality.nextStep || "页面文字已接收，但没有识别到可用字段；可以换作品详情页或数据页继续采集。",
      message: finalMessage
    };

    return {
      session: this.authorizedCaptureResultToBrowserSession(capture),
      capture,
      message: finalMessage,
      nextStep: capture.nextStep
    };
  }

  private async completeLocalBrowserCaptureSession(id: string, visibleText: string, pageUrlOverride?: string): Promise<BrowserCaptureSessionResult> {
    const localData = await this.readLocalDatasourceFile();
    const jobs = this.sortJobs(this.uniqueJobs([...localData.jobs, ...fallbackJobs]));
    const targetJob = jobs.find((job) => job.id === id);

    if (!targetJob) {
      throw new BadRequestException("没有找到这个浏览器采集会话。");
    }

    this.assertBrowserCaptureJob(targetJob);

    const datasources = this.sortDatasources(this.uniqueDatasources([...localData.datasources, ...fallbackDatasources]));
    const pageUrl = pageUrlOverride || this.jobSourceDetail(targetJob, datasources) || targetJob.sourceDetail || "https://fanqienovel.com/writer/zone";
    const { rows, importedTrends, importedWorks, quality } = this.buildAuthorizedVisibleImport(visibleText, pageUrl);
    const sourceLabel = "浏览器可见页";
    const importedAt = new Date().toISOString();
    const trendsWithSource = importedTrends.map((trend) => ({
      ...trend,
      sourceLabel,
      sourceDetail: pageUrl
    }));
    const performanceRows = importedWorks.map((work) => ({
      ...work,
      sourceLabel,
      sourceDetail: pageUrl,
      importedAt
    }));
    const workImport = await this.worksService.importPerformanceRows(performanceRows);
    const learningCreated = await this.createDatasourceLearning({
      sourceLabel,
      sourceDetail: pageUrl,
      rows,
      trends: trendsWithSource,
      performanceRows,
      works: workImport.works
    });
    const status: CrawlerJobStatus = rows.length > 0 ? "success" : "failed";
    const failureReason =
      rows.length > 0 ? "" : quality.emptyReason || `浏览器可见页没有识别到作品名、题材、阅读量、收益、完读率或评论反馈。来源：${pageUrl}`;
    const finalMessage =
      failureReason ||
      this.appendLearningMessage(
        this.importMessage(sourceLabel, "已回填入本地文件", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
        learningCreated
      );
    const datasource =
      datasources.find((item) => item.id === targetJob.datasourceId) ??
      ({
        id: targetJob.datasourceId ?? `source-browser-capture-${Date.now()}`,
        name: targetJob.name,
        type: "manual",
        enabled: true,
        frequency: "授权后自动",
        sourceDetail: pageUrl,
        note: "",
        persisted: false,
        createdAt: this.today(),
        updatedAt: this.today()
      } satisfies DatasourceRecord);
    const updatedDatasource: DatasourceRecord = {
      ...datasource,
      sourceDetail: pageUrl,
      note: this.browserCaptureImportNote(pageUrl, rows.length, trendsWithSource.length, performanceRows.length),
      persisted: false,
      updatedAt: this.today()
    };
    const updatedJob: CrawlerJobRecord = {
      ...targetJob,
      datasourceId: updatedDatasource.id,
      status,
      lastRunAt: this.formatDateTime(new Date()),
      successCount: rows.length,
      failureReason,
      sourceDetail: pageUrl,
      persisted: false
    };
    const nextDatasources = this.sortDatasources([updatedDatasource, ...datasources.filter((item) => item.id !== updatedDatasource.id)]);
    const nextJobs = this.sortJobs([updatedJob, ...jobs.filter((job) => job.id !== updatedJob.id)]);

    addRuntimeTrends(trendsWithSource);
    await Promise.all([
      this.writeLocalDatasourceFile({
        datasources: nextDatasources,
        jobs: nextJobs
      }),
      persistRuntimeTrends(trendsWithSource)
    ]);
    await this.writeCrawlerLogSafe({
      jobId: updatedJob.id,
      datasourceId: updatedDatasource.id,
      name: updatedDatasource.name,
      type: "manual",
      status,
      successCount: rows.length,
      message: finalMessage,
      source: pageUrl
    });

    const capture: AuthorizedCaptureResult = {
      datasource: updatedDatasource,
      job: updatedJob,
      parsedRows: rows.length,
      trendsCreated: trendsWithSource.length,
      worksUpdated: workImport.updated,
      worksCreated: workImport.created,
      learningCreated,
      persisted: false,
      captureMode: "visible_text",
      pageUrl,
      nextStep: rows.length
        ? "已把浏览器可见页数据写入趋势、作品表现和后续写作记忆召回链路。"
        : quality.nextStep || "页面文字已接收，但没有识别到可用字段；可以换作品详情页或数据页继续采集。",
      message: finalMessage
    };

    return {
      session: this.authorizedCaptureResultToBrowserSession(capture),
      capture,
      message: finalMessage,
      nextStep: capture.nextStep
    };
  }

  private async createWaitingAuthorizedCapture(input: { name: string; pageUrl: string; datasourceId?: string }): Promise<AuthorizedCaptureResult> {
    const note = `等待本地浏览器执行器读取已授权可见页面：${input.pageUrl}。只读取页面上已经显示的数据，不保存账号、密码或 Cookie。`;
    const failureReason = "等待你在番茄后台完成登录后，由本地浏览器执行器读取可见页并回填数据。";

    try {
      const datasource = await this.prisma.dataSource.create({
        data: {
          name: input.name,
          type: "manual",
          enabled: true,
          frequency: "授权后自动",
          sourceDetail: input.pageUrl,
          note
        }
      });
      const job = await this.prisma.crawlerJob.create({
        data: {
          datasourceId: datasource.id,
          name: datasource.name,
          type: "manual",
          status: "waiting",
          lastRunAt: new Date(),
          successCount: 0,
          failureReason,
          sourceDetail: input.pageUrl
        }
      });

      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "manual",
        status: "waiting",
        successCount: 0,
        message: failureReason,
        source: input.pageUrl
      });

      return {
        datasource: this.toDatasource(datasource as DbDatasource, true),
        job: this.toJob({ ...(job as DbCrawlerJob), datasource: datasource as DbDatasource }, true),
        parsedRows: 0,
        trendsCreated: 0,
        worksUpdated: 0,
        worksCreated: 0,
        persisted: true,
        captureMode: "waiting",
        pageUrl: input.pageUrl,
        nextStep: "等待本地浏览器执行器读取可见页后，会自动把文本或截图回填到这条任务。",
        message: "授权采集任务已登记，等待可见页读取。"
      };
    } catch {
      const now = Date.now();
      const datasource: DatasourceRecord = {
        id: input.datasourceId?.trim() || `source-authorized-${now}`,
        name: input.name,
        type: "manual",
        enabled: true,
        frequency: "授权后自动",
        sourceDetail: input.pageUrl,
        note,
        persisted: false,
        createdAt: this.today(),
        updatedAt: this.today()
      };
      const job: CrawlerJobRecord = {
        id: `job-authorized-${now}`,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "manual",
        status: "waiting",
        lastRunAt: this.formatDateTime(new Date()),
        successCount: 0,
        failureReason,
        sourceDetail: input.pageUrl,
        persisted: false,
        createdAt: this.today()
      };
      const localData = await this.readLocalDatasourceFile();

      await this.writeLocalDatasourceFile({
        datasources: [datasource, ...localData.datasources],
        jobs: [job, ...localData.jobs]
      });
      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: "manual",
        status: "waiting",
        successCount: 0,
        message: failureReason,
        source: input.pageUrl
      });

      return {
        datasource,
        job,
        parsedRows: 0,
        trendsCreated: 0,
        worksUpdated: 0,
        worksCreated: 0,
        persisted: false,
        captureMode: "waiting",
        pageUrl: input.pageUrl,
        nextStep: "等待本地浏览器执行器读取可见页后，会自动把文本或截图回填到这条任务。",
        message: "数据库还没有连接成功，授权采集任务已保存到本地文件，等待可见页读取。"
      };
    }
  }

  private buildAuthorizedVisibleImport(visibleText: string, pageUrl: string) {
    let quality = this.authorizedVisibleTextQuality(visibleText, pageUrl);
    const parsedRows = quality.ok
      ? [
          ...this.parseManualText(visibleText),
          ...this.parseLabeledPerformanceBlocks(visibleText)
        ]
      : [];
    const rows = quality.ok
      ? this.mergeAuthorizedRows(parsedRows.filter((row) => this.hasAuthorizedLearningSignal(row)))
      : [];

    if (quality.ok && rows.length === 0) {
      quality = {
        ok: false,
        signalCount: quality.signalCount,
        qualityLabel: "字段不足",
        emptyReason: `当前可见内容多为导航或字段碎片，未识别到可学习的作品表现、趋势或评论反馈。来源：${pageUrl}`,
        nextStep: "换到作品数据详情页、评论页或活动页后重新读取；至少保留作品名/题材，加上阅读量、收益、完读率、评论反馈或热度。"
      };
    }

    const importedTrends = this.rowsToTrends(rows, {
      idPrefix: "authorized-visible-trend",
      defaultPlatform: this.inferPlatform(pageUrl),
      defaultReason: `来自用户授权后可见页面 ${pageUrl}，只学习表现、题材和反馈结构；质量：${quality.qualityLabel ?? "合格授权数据"}。`
    });
    const importedWorks = this.rowsToWorkPerformance(rows);

    return {
      rows,
      importedTrends,
      importedWorks,
      quality
    };
  }

  private authorizedVisibleTextQuality(visibleText: string, pageUrl: string): AuthorizedVisibleQuality {
    const compactText = visibleText.replace(/\s+/gu, " ").trim();
    const sourceText = `${pageUrl} ${compactText}`;
    const hasLoginSignal = /登录|扫码|验证码|安全验证|身份验证|滑块|请先登录|手机号|密码/u.test(sourceText);
    const dataSignalCount = this.authorizedDataSignalCount(compactText);
    const navigationSignalCount = this.authorizedNavigationSignalCount(compactText);

    if (!compactText) {
      return {
        ok: false,
        signalCount: 0,
        qualityLabel: "空页面",
        emptyReason: `当前授权页面没有读取到可见文字。来源：${pageUrl}`,
        nextStep: "确认页面已经加载完成，并停留在作品数据、评论或活动页后再读取。"
      };
    }

    if (hasLoginSignal && dataSignalCount < 2) {
      return {
        ok: false,
        signalCount: dataSignalCount,
        qualityLabel: "登录/验证页",
        emptyReason: `当前页面像登录或验证页，未导入学习链路。来源：${pageUrl}`,
        nextStep: "请你自行完成登录、验证码和平台确认后，停在作品数据、评论或活动页再读取。"
      };
    }

    if (navigationSignalCount >= 6 && dataSignalCount < 3) {
      return {
        ok: false,
        signalCount: dataSignalCount,
        qualityLabel: "导航噪音",
        emptyReason: `当前可见内容更像导航页或工作台外壳，未识别到足够的数据字段。来源：${pageUrl}`,
        nextStep: "请进入具体作品数据、评论反馈、活动数据或榜单明细页后再读取。"
      };
    }

    if (compactText.length < 40 || dataSignalCount < 2) {
      return {
        ok: false,
        signalCount: dataSignalCount,
        qualityLabel: "字段不足",
        emptyReason: `当前可见内容字段不足，未识别到足够的作品表现、题材、阅读量、收益、完读率或评论反馈。来源：${pageUrl}`,
        nextStep: "换到作品数据详情页、评论页或活动页后重新读取；也可以在校正框补充作品名、题材、阅读量、收益、完读率和评论反馈。"
      };
    }

    return {
      ok: true,
      signalCount: dataSignalCount,
      qualityLabel: dataSignalCount >= 5 ? "高质量授权数据" : "合格授权数据"
    };
  }

  private authorizedDataSignalCount(text: string) {
    const labels = ["作品名", "作品", "题材", "赛道", "阅读量", "阅读", "收益", "完读率", "收藏", "订阅", "评论反馈", "评论关键词", "热度", "机会分", "增长", "标签"];
    return labels.filter((label) => text.includes(label)).length;
  }

  private authorizedNavigationSignalCount(text: string) {
    const labels = ["首页", "灵感写作", "自动写作", "风向标", "作品专栏", "正文编辑器", "数据看板", "复盘分析", "写作记忆库", "数据源管理", "设置中心", "本周创作进度"];
    return labels.filter((label) => text.includes(label)).length;
  }

  private hasAuthorizedLearningSignal(row: Record<string, string>) {
    const identityKeys = [
      "title",
      "作品名",
      "worktitle",
      "work_title",
      "genre",
      "题材",
      "赛道"
    ];
    const evidenceKeys = [
      "heat",
      "热度",
      "opportunityscore",
      "opportunity_score",
      "机会分",
      "growthrate",
      "growth_rate",
      "增长",
      "saturationscore",
      "saturation_score",
      "readcount",
      "read_count",
      "阅读量",
      "revenue",
      "收益",
      "completionrate",
      "completion_rate",
      "完读率",
      "subscriptioncount",
      "subscription_count",
      "收藏",
      "commentfeedback",
      "comment_feedback",
      "评论反馈",
      "commentkeywords",
      "comment_keywords",
      "评论关键词",
      "tags",
      "标签",
      "reason",
      "原因"
    ];
    const filledIdentitySignals = identityKeys.filter((key) => row[key]?.trim()).length;
    const filledEvidenceSignals = evidenceKeys.filter((key) => row[key]?.trim()).length;

    return filledIdentitySignals >= 1 && filledEvidenceSignals >= 1;
  }

  private mergeAuthorizedRows(rows: Record<string, string>[]) {
    const merged = new Map<string, Record<string, string>>();

    for (const row of rows) {
      const key = this.authorizedRowMergeKey(row);
      const current = merged.get(key);

      merged.set(key, current ? { ...current, ...Object.fromEntries(Object.entries(row).filter(([, value]) => value.trim())) } : row);
    }

    return Array.from(merged.values());
  }

  private authorizedRowMergeKey(row: Record<string, string>) {
    const platform = this.valueFrom(row, ["platform", "平台"]).toLowerCase();
    const title = this.valueFrom(row, ["title", "worktitle", "work_title", "作品名", "作品", "书名", "篇名", "标题"]).toLowerCase();
    const genre = this.valueFrom(row, ["genre", "题材", "赛道", "分类"]).toLowerCase();
    const tags = this.valueFrom(row, ["tags", "标签", "关键词"]).toLowerCase();

    if (title) {
      return `work:${platform}:${title}`;
    }

    return `trend:${platform}:${genre}:${tags}`;
  }

  private authorizedCaptureResultToBrowserSession(result: AuthorizedCaptureResult, platform?: string): BrowserCaptureSession {
    const pageUrl = result.pageUrl || result.job.sourceDetail || result.datasource.sourceDetail || "https://fanqienovel.com/writer/zone";

    return this.jobToBrowserCaptureSession(result.job, {
      pageUrl,
      platform,
      nextStep: result.nextStep
    });
  }

  private jobToBrowserCaptureSession(
    job: CrawlerJobRecord,
    options: { pageUrl?: string; platform?: string; nextStep?: string } = {}
  ): BrowserCaptureSession {
    const pageUrl = options.pageUrl || job.sourceDetail || "https://fanqienovel.com/writer/zone";
    const nextStep = options.nextStep || this.browserSessionNextStep(job.status);

    return {
      id: job.id,
      datasourceId: job.datasourceId,
      jobId: job.id,
      pageUrl,
      platform: options.platform?.trim() || this.inferPlatform(pageUrl),
      status: job.status,
      lastMessage: job.failureReason || this.browserSessionStatusMessage({ status: job.status }),
      nextStep,
      persisted: job.persisted,
      createdAt: job.createdAt,
      updatedAt: job.lastRunAt === "-" ? job.createdAt : job.lastRunAt
    };
  }

  private async ensureBrowserCaptureRuntime(session: BrowserCaptureSession) {
    const existing = this.browserCaptureRuntimes.get(session.id);

    if (existing?.browser.isConnected() && !existing.page.isClosed()) {
      await existing.page.bringToFront().catch(() => undefined);
      return existing;
    }

    if (existing) {
      await existing.browser.close().catch(() => undefined);
      this.browserCaptureRuntimes.delete(session.id);
    }

    const { chromium } = await import("playwright-core");
    const executablePath = await this.resolveBrowserExecutablePath();
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: false,
      args: ["--no-first-run"]
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    } else {
      launchOptions.channel = "chrome";
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      locale: "zh-CN",
      viewport: { width: 1360, height: 900 }
    });
    const page = await context.newPage();
    const runtime: BrowserCaptureRuntime = {
      browser,
      context,
      page,
      openedAt: new Date()
    };

    browser.on("disconnected", () => {
      this.browserCaptureRuntimes.delete(session.id);
    });
    this.browserCaptureRuntimes.set(session.id, runtime);
    await page.goto(session.pageUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
    await page.bringToFront().catch(() => undefined);

    return runtime;
  }

  private async readRuntimeVisibleText(page: Page) {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    const visibleText = await page
      .evaluate(() => document.body?.innerText ?? "")
      .catch(() => "");

    return visibleText
      .replace(/\u00a0/gu, " ")
      .replace(/[ \t]+/gu, " ")
      .replace(/\n[ \t]+/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
  }

  private visibleTextPreview(visibleText: string) {
    const compactText = visibleText.replace(/\s+/gu, " ").trim();
    return compactText.length > 260 ? `${compactText.slice(0, 260)}...` : compactText;
  }

  private async resolveBrowserExecutablePath() {
    const configured = [
      process.env.LOCAL_BROWSER_EXECUTABLE_PATH,
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.env.CHROME_PATH
    ].find((candidate) => candidate?.trim());

    if (configured && (await this.fileExists(configured))) {
      return configured;
    }

    for (const candidate of this.browserExecutableCandidates()) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private browserExecutableCandidates() {
    if (process.platform === "darwin") {
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      ];
    }

    if (process.platform === "win32") {
      const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
      const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
      const localAppData = process.env.LOCALAPPDATA ?? "";

      return [
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
      ].filter(Boolean);
    }

    return ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/snap/bin/chromium"];
  }

  private async fileExists(filePath: string) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private browserSessionStatusMessage(session: Pick<BrowserCaptureSession, "status">) {
    if (session.status === "success") {
      return "浏览器可见页数据已写入学习链路。";
    }

    if (session.status === "failed") {
      return "浏览器可见页已回填，但没有识别到可用字段。";
    }

    if (session.status === "running") {
      return "本地浏览器执行器正在读取可见页。";
    }

    return "等待本地浏览器执行器读取已授权的可见页。";
  }

  private browserSessionNextStep(status: CrawlerJobStatus) {
    if (status === "success") {
      return "可以进入自动写作，让选题依据引用这批作品表现和评论反馈。";
    }

    if (status === "failed") {
      return "换到作品详情页、数据页或评论页后重新采集。";
    }

    return "用户完成登录和平台确认后，执行器只读取页面上已经显示的数据。";
  }

  private assertBrowserCaptureJob(job: DbCrawlerJob | CrawlerJobRecord) {
    const type = this.toJobType(job.type);
    const markerText = [job.name, job.failureReason ?? "", job.sourceDetail ?? ""].join(" ");

    if (type !== "manual" || !/授权|浏览器|可见页|执行器/u.test(markerText)) {
      throw new BadRequestException("这条任务不是浏览器授权采集会话。");
    }
  }

  private browserCaptureImportNote(pageUrl: string, rows: number, trends: number, works: number) {
    return `来源：${pageUrl}。本地浏览器执行器回填可见页数据 ${rows} 行，其中 ${trends} 行可作为趋势数据，${works} 行可作为作品表现；不保存账号、密码或 Cookie。`;
  }

  private async createDatasourceLearning(input: {
    sourceLabel: string;
    sourceDetail?: string;
    rows: Record<string, string>[];
    trends: Trend[];
    performanceRows: WorkPerformanceImportRow[];
    works?: Array<{ id: string; title: string }>;
  }): Promise<DatasourceLearningResult | undefined> {
    if (!this.shouldCreateDatasourceLearning(input)) {
      return undefined;
    }

    const draft = this.buildDatasourceLearningDraft(input);

    if (!draft) {
      return undefined;
    }

    try {
      const [memoryCreated, strategyCreated] = await Promise.all([
        draft.memory ? this.createMemoryIfMissing(draft.memory) : Promise.resolve(false),
        draft.strategy ? this.createStrategyIfMissing(draft.strategy) : Promise.resolve(false)
      ]);
      const memoriesCreated = memoryCreated ? 1 : 0;
      const strategiesCreated = strategyCreated ? 1 : 0;
      const memoryRules = draft.memory ? [draft.memory.rule] : [];
      const strategyRules = draft.strategy ? [draft.strategy.rule] : [];

      return {
        memoriesCreated,
        strategiesCreated,
        memoryRules,
        strategyRules,
        summary:
          memoriesCreated + strategiesCreated > 0
            ? `已自动沉淀 ${memoriesCreated} 条写作记忆、${strategiesCreated} 条个人策略。`
            : "已识别到可学习信号，但记忆库/策略库里已有相同经验，本次没有重复写入。"
      };
    } catch {
      return {
        memoriesCreated: 0,
        strategiesCreated: 0,
        memoryRules: [],
        strategyRules: [],
        summary: "数据已导入，但自动学习沉淀暂时没有完成。"
      };
    }
  }

  private shouldCreateDatasourceLearning(input: {
    sourceLabel: string;
    rows: Record<string, string>[];
    trends: Trend[];
    performanceRows: WorkPerformanceImportRow[];
  }) {
    if (input.rows.length === 0) {
      return false;
    }

    if (input.performanceRows.length > 0) {
      return true;
    }

    return /授权|浏览器|可见页|截图|校正|CSV|手动|粘贴/u.test(input.sourceLabel) && input.trends.length > 0;
  }

  private buildDatasourceLearningDraft(input: {
    sourceLabel: string;
    sourceDetail?: string;
    rows: Record<string, string>[];
    trends: Trend[];
    performanceRows: WorkPerformanceImportRow[];
    works?: Array<{ id: string; title: string }>;
  }) {
    const genre = this.dominantLearningGenre(input.performanceRows, input.trends, input.rows);
    const topWork = this.topPerformanceWork(input.performanceRows);
    const topTrend = [...input.trends].sort((a, b) => b.opportunityScore + b.heat - (a.opportunityScore + a.heat))[0];
    const keywords = this.learningKeywords(input.performanceRows, input.trends);
    const feedback = this.learningFeedback(input.performanceRows);
    const positiveSignal = this.positiveLearningSignal(keywords, feedback, topTrend);
    const riskSignal = this.riskLearningSignal(feedback, keywords);
    const relatedWorkIds = this.relatedLearningWorkIds(input.works, input.performanceRows);
    const evidence = this.learningEvidence(input.sourceLabel, input.sourceDetail, input.rows.length, input.trends.length, input.performanceRows.length, topWork, topTrend);
    const confidence = this.learningConfidence(input.rows.length, input.performanceRows, input.trends);

    if (!genre && !topWork && !topTrend) {
      return null;
    }

    const safeGenre = genre || topWork?.genre || topTrend?.genre || "通用";
    const avoid = riskSignal || "中段节奏拖慢和同质化桥段";
    const memoryRule = `平台表现记忆：${safeGenre}读者对${positiveSignal}反馈更稳定，下一篇要保留结构信号但更换具体人物、设定和桥段。`;
    const strategyRule = `下一篇${safeGenre}优先验证${positiveSignal}，并把${avoid}列为发布前检查项。`;

    return {
      memory: {
        sourceType: "platform_result" as const,
        genre: safeGenre,
        rule: this.compactLearningText(memoryRule),
        positiveExample: this.compactLearningText(this.positiveLearningExample(topWork, topTrend, keywords)),
        negativeExample: this.compactLearningText(riskSignal ? `评论风险：${riskSignal}。${feedback || "后续导入评论后继续校正。"}` : `暂无明确负面反馈；仍需检查${avoid}。`),
        confidence,
        relatedWorkIds,
        enabled: true
      },
      strategy: {
        sourceType: "platform_result" as const,
        genre: safeGenre,
        rule: this.compactLearningText(strategyRule),
        evidence,
        action: this.compactLearningText(`开头给出具体压力和清晰钩子；中段围绕${positiveSignal}升级冲突；结尾回收信息差，并逐项检查${avoid}。`),
        confidence,
        relatedWorkIds,
        enabled: true
      }
    };
  }

  private async createMemoryIfMissing(input: Parameters<MemoryService["createMemory"]>[0]) {
    const existing = await this.memoryService.listMemory().catch(() => []);

    if (existing.some((memory) => memory.genre === input.genre && memory.rule === input.rule)) {
      return false;
    }

    await this.memoryService.createMemory(input);
    return true;
  }

  private async createStrategyIfMissing(input: Parameters<StrategiesService["createStrategy"]>[0]) {
    const existing = await this.strategiesService.listStrategies().catch(() => []);

    if (existing.some((strategy) => strategy.genre === input.genre && strategy.rule === input.rule)) {
      return false;
    }

    await this.strategiesService.createStrategy(input);
    return true;
  }

  private dominantLearningGenre(performanceRows: WorkPerformanceImportRow[], trends: Trend[], rows: Record<string, string>[]) {
    return this.mostCommon([
      ...performanceRows.map((work) => work.genre),
      ...trends.map((trend) => trend.genre),
      ...rows.map((row) => this.valueFrom(row, ["genre", "题材", "赛道", "分类"]))
    ]);
  }

  private topPerformanceWork(works: WorkPerformanceImportRow[]) {
    return [...works].sort((a, b) => this.performanceScore(b) - this.performanceScore(a))[0];
  }

  private performanceScore(work: WorkPerformanceImportRow) {
    return (work.completionRate ?? 0) * 1200 + Math.log10((work.readCount ?? 0) + 10) * 18 + Math.log10((work.revenue ?? 0) + 10) * 10 + (work.subscriptionCount ?? 0) / 1000;
  }

  private learningKeywords(performanceRows: WorkPerformanceImportRow[], trends: Trend[]) {
    return Array.from(
      new Set([
        ...performanceRows.flatMap((work) => [...(work.commentKeywords ?? []), ...(work.tags ?? [])]),
        ...trends.flatMap((trend) => trend.tags)
      ].map((keyword) => keyword.trim()).filter(Boolean))
    ).slice(0, 8);
  }

  private learningFeedback(performanceRows: WorkPerformanceImportRow[]) {
    return performanceRows
      .map((work) => work.commentFeedback)
      .filter((feedback): feedback is string => Boolean(feedback?.trim()))
      .join("；");
  }

  private positiveLearningSignal(keywords: string[], feedback: string, trend?: Trend) {
    const sourceText = [...keywords, feedback, trend?.reason ?? ""].join(" ");
    const candidates = ["强钩子", "反转", "克制反击", "情绪释放", "亲情冲突", "身份反转", "信息差", "现实质感", "成长", "悬疑"];
    const matched = candidates.find((candidate) => sourceText.includes(candidate));

    if (matched) {
      return matched;
    }

    return keywords[0] || trend?.genre || "清晰钩子和情绪回收";
  }

  private riskLearningSignal(feedback: string, keywords: string[]) {
    const sourceText = `${feedback} ${keywords.join(" ")}`;
    const riskMap = [
      { pattern: /节奏慢|中段慢|拖|拖沓/u, label: "中段节奏拖慢" },
      { pattern: /水|注水|废话/u, label: "无效铺垫和水文" },
      { pattern: /尬|生硬|不真实/u, label: "情绪转折生硬" },
      { pattern: /看不懂|逻辑|突兀/u, label: "信息差回收不清" },
      { pattern: /套路|同质|老套/u, label: "桥段同质化" }
    ];

    return riskMap.find((item) => item.pattern.test(sourceText))?.label ?? "";
  }

  private relatedLearningWorkIds(works: Array<{ id: string; title: string }> | undefined, performanceRows: WorkPerformanceImportRow[]) {
    const importedTitles = new Set(performanceRows.map((work) => work.title));
    return (works ?? []).filter((work) => importedTitles.has(work.title)).map((work) => work.id).slice(0, 8);
  }

  private learningEvidence(
    sourceLabel: string,
    sourceDetail: string | undefined,
    rows: number,
    trends: number,
    works: number,
    topWork?: WorkPerformanceImportRow,
    topTrend?: Trend
  ) {
    const source = sourceDetail ? `来源 ${sourceDetail}；` : "";
    const top = topWork
      ? `代表作品《${topWork.title}》${this.workMetricsText(topWork)}。`
      : topTrend
        ? `代表趋势：${topTrend.genre}，机会分 ${topTrend.opportunityScore}，热度 ${topTrend.heat}。`
        : "";

    return this.compactLearningText(`${source}${sourceLabel}识别 ${rows} 行，其中 ${trends} 条趋势、${works} 条作品表现。${top}`);
  }

  private learningConfidence(rows: number, performanceRows: WorkPerformanceImportRow[], trends: Trend[]) {
    const metricRows = performanceRows.filter((work) => work.readCount || work.revenue || work.completionRate || work.commentFeedback || work.commentKeywords?.length).length;
    const base = 62 + Math.min(12, rows * 2) + Math.min(12, metricRows * 4) + Math.min(6, trends.length * 2);

    return Math.max(62, Math.min(90, base));
  }

  private positiveLearningExample(topWork: WorkPerformanceImportRow | undefined, topTrend: Trend | undefined, keywords: string[]) {
    if (topWork) {
      return `样本《${topWork.title}》${this.workMetricsText(topWork)}；关键词：${keywords.join("、") || "待继续导入评论校正"}。`;
    }

    if (topTrend) {
      return `趋势样本：${topTrend.platform}/${topTrend.genre}，热度 ${topTrend.heat}，机会分 ${topTrend.opportunityScore}；${topTrend.reason}`;
    }

    return "本次导入识别到可复用的平台表现信号。";
  }

  private workMetricsText(work: WorkPerformanceImportRow) {
    return [
      work.readCount ? `阅读 ${Math.round(work.readCount)}` : "",
      work.revenue ? `收益 ${Math.round(work.revenue * 100) / 100}` : "",
      work.completionRate ? `完读率 ${Math.round(work.completionRate * 100) / 100}%` : "",
      work.subscriptionCount ? `收藏/订阅 ${Math.round(work.subscriptionCount)}` : ""
    ]
      .filter(Boolean)
      .join("，");
  }

  private mostCommon(values: Array<string | undefined>) {
    const counts = new Map<string, number>();

    for (const value of values.map((item) => item?.trim()).filter((item): item is string => Boolean(item))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }

  private compactLearningText(text: string, maxLength = 220) {
    const normalized = text.replace(/\s+/gu, " ").trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
  }

  private appendLearningMessage(message: string, learning?: DatasourceLearningResult) {
    return learning?.summary ? `${message}${learning.summary}` : message;
  }

  private async saveImportedTrends({
    name,
    defaultName,
    datasourceType,
    jobType,
      sourceLabel,
      sourceDetail,
      rows,
      importedTrends,
      importedWorks,
      emptyReason
  }: {
    name?: string;
    defaultName: string;
    datasourceType: DatasourceType;
    jobType: CrawlerJobRecord["type"];
    sourceLabel: string;
    sourceDetail?: string;
    rows: Record<string, string>[];
    importedTrends: Trend[];
    importedWorks?: WorkPerformanceImportRow[];
    emptyReason: string;
  }): Promise<CsvImportResult> {
    const status: CrawlerJobStatus = rows.length > 0 ? "success" : "failed";
    const failureReason = rows.length > 0 ? "" : emptyReason;
    const datasourceName = name?.trim() || defaultName;
    const importedAt = new Date().toISOString();
    const trendsWithSource = importedTrends.map((trend) => ({
      ...trend,
      sourceLabel,
      sourceDetail
    }));
    const performanceRows = (importedWorks ?? []).map((work) => ({
      ...work,
      sourceLabel,
      sourceDetail,
      importedAt
    }));
    const note = `${sourceDetail ? `来源：${sourceDetail}。` : ""}本次识别 ${rows.length} 行，其中 ${trendsWithSource.length} 行可作为趋势数据，${performanceRows.length} 行可作为作品表现。`;

    addRuntimeTrends(trendsWithSource);

    try {
      const existingDatasource = await this.prisma.dataSource.findFirst({
        where: {
          name: datasourceName,
          type: datasourceType,
          sourceDetail: sourceDetail ?? null
        }
      });
      const datasource = existingDatasource
        ? await this.prisma.dataSource.update({
            where: { id: existingDatasource.id },
            data: {
              enabled: true,
              frequency: "手动",
              sourceDetail,
              note
            }
          })
        : await this.prisma.dataSource.create({
            data: {
              name: datasourceName,
              type: datasourceType,
              enabled: true,
              frequency: "手动",
              sourceDetail,
              note
            }
          });

      if (trendsWithSource.length > 0) {
        await this.prisma.trend.createMany({
          data: trendsWithSource.map((trend) => ({
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
          }))
        });
      }

      const workImport = await this.worksService.importPerformanceRows(performanceRows);
      const learningCreated = await this.createDatasourceLearning({
        sourceLabel,
        sourceDetail,
        rows,
        trends: trendsWithSource,
        performanceRows,
        works: workImport.works
      });
      const successMessage = this.appendLearningMessage(
        this.importMessage(sourceLabel, "已导入", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
        learningCreated
      );

      const job = await this.prisma.crawlerJob.create({
        data: {
          datasourceId: datasource.id,
          name: datasource.name,
          type: jobType,
          status,
          lastRunAt: new Date(),
          successCount: rows.length,
          failureReason,
          sourceDetail
        }
      });
      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: jobType,
        status,
        successCount: rows.length,
        message: failureReason || successMessage,
        source: sourceDetail
      });

      return {
        datasource: this.toDatasource(datasource as DbDatasource, true),
        job: this.toJob(job as DbCrawlerJob, true),
        parsedRows: rows.length,
        trendsCreated: trendsWithSource.length,
        worksUpdated: workImport.updated,
        worksCreated: workImport.created,
        learningCreated,
        persisted: true,
        message: successMessage
      };
    } catch {
      const localData = await this.readLocalDatasourceFile();
      const existingDatasource = this.findMatchingLocalDatasource(localData.datasources, datasourceName, sourceDetail, datasourceType);
      const existingJob = existingDatasource
        ? localData.jobs.find((item) => item.datasourceId === existingDatasource.id && item.type === jobType)
        : undefined;
      const datasource: DatasourceRecord = {
        id: existingDatasource?.id ?? `source-${datasourceType}-${Date.now()}`,
        name: datasourceName,
        type: datasourceType,
        enabled: true,
        frequency: "手动",
        sourceDetail,
        note,
        persisted: false,
        createdAt: existingDatasource?.createdAt ?? this.today(),
        updatedAt: this.today()
      };
      const job: CrawlerJobRecord = {
        id: existingJob?.id ?? `job-${datasourceType}-${Date.now()}`,
        datasourceId: datasource.id,
        name: datasource.name,
        type: jobType,
        status,
        lastRunAt: this.formatDateTime(new Date()),
        successCount: rows.length,
        failureReason,
        sourceDetail,
        persisted: false,
        createdAt: existingJob?.createdAt ?? this.today()
      };

      fallbackDatasources.unshift(datasource);
      fallbackJobs.unshift(job);
      const workImport = await this.worksService.importPerformanceRows(performanceRows);
      const learningCreated = await this.createDatasourceLearning({
        sourceLabel,
        sourceDetail,
        rows,
        trends: trendsWithSource,
        performanceRows,
        works: workImport.works
      });
      const successMessage = this.appendLearningMessage(
        this.importMessage(sourceLabel, "已导入本地文件", rows.length, trendsWithSource.length, workImport.updated, workImport.created),
        learningCreated
      );
      await Promise.all([
        this.writeLocalDatasourceFile({
          datasources: [datasource, ...localData.datasources.filter((item) => item.id !== datasource.id)],
          jobs: [job, ...localData.jobs.filter((item) => item.id !== job.id)]
        }),
        persistRuntimeTrends(trendsWithSource)
      ]);
      await this.writeCrawlerLogSafe({
        jobId: job.id,
        datasourceId: datasource.id,
        name: datasource.name,
        type: jobType,
        status,
        successCount: rows.length,
        message: failureReason || successMessage,
        source: sourceDetail
      });

      return {
        datasource,
        job,
        parsedRows: rows.length,
        trendsCreated: trendsWithSource.length,
        worksUpdated: workImport.updated,
        worksCreated: workImport.created,
        learningCreated,
        persisted: false,
        message: successMessage
      };
    }
  }

  private async listLocalDatasources() {
    const localData = await this.readLocalDatasourceFile();
    return this.sortDatasources(this.uniqueDatasources([...localData.datasources, ...seedFallbackDatasources]));
  }

  private async listLocalJobs() {
    const localData = await this.readLocalDatasourceFile();
    return this.sortJobs(this.uniqueJobs([...localData.jobs, ...seedFallbackJobs]));
  }

  private async readLocalDatasourceFile(): Promise<LocalDatasourceFile> {
    try {
      const parsed = JSON.parse(await readFile(this.localDatasourceFilePath(), "utf8")) as {
        datasources?: Partial<DatasourceRecord>[];
        jobs?: Partial<CrawlerJobRecord>[];
      };

      const datasources = (parsed.datasources ?? [])
        .map((datasource) => this.normalizeLocalDatasource(datasource))
        .filter((datasource): datasource is DatasourceRecord => Boolean(datasource));
      const jobs = (parsed.jobs ?? []).map((job) => this.normalizeLocalJob(job)).filter((job): job is CrawlerJobRecord => Boolean(job));

      this.replaceFallbackData(datasources, jobs);

      return {
        datasources,
        jobs
      };
    } catch {
      return {
        datasources: [],
        jobs: []
      };
    }
  }

  private async writeLocalDatasourceFile(data: LocalDatasourceFile) {
    const filePath = this.localDatasourceFilePath();
    const datasources = this.sortDatasources(this.uniqueDatasources(data.datasources));
    const jobs = this.sortJobs(this.uniqueJobs(data.jobs));

    this.replaceFallbackData(datasources, jobs);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          datasources,
          jobs
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeLocalDatasource(datasource: Partial<DatasourceRecord>): DatasourceRecord | null {
    if (!datasource.name?.trim()) {
      return null;
    }

    return {
      id: datasource.id ?? `source-local-${Date.now()}`,
      name: datasource.name.trim(),
      type: this.toDatasourceType(datasource.type ?? "manual"),
      enabled: datasource.enabled ?? true,
      frequency: datasource.frequency ?? "手动",
      sourceDetail: datasource.sourceDetail ?? this.datasourceSourceDetail(datasource.note),
      note: datasource.note ?? "",
      persisted: false,
      createdAt: datasource.createdAt ?? this.today(),
      updatedAt: datasource.updatedAt ?? this.today()
    };
  }

  private normalizeLocalJob(job: Partial<CrawlerJobRecord>): CrawlerJobRecord | null {
    if (!job.name?.trim()) {
      return null;
    }

    return {
      id: job.id ?? `job-local-${Date.now()}`,
      datasourceId: job.datasourceId,
      name: job.name.trim(),
      type: this.toJobType(job.type ?? "manual"),
      status: this.toJobStatus(job.status ?? "waiting"),
      lastRunAt: job.lastRunAt ?? "-",
      successCount: job.successCount ?? 0,
      failureReason: job.failureReason ?? "",
      sourceDetail: job.sourceDetail,
      persisted: false,
      createdAt: job.createdAt ?? this.today()
    };
  }

  private uniqueDatasources(datasources: DatasourceRecord[]) {
    const seen = new Set<string>();

    return datasources.filter((datasource) => {
      if (seen.has(datasource.id)) {
        return false;
      }

      seen.add(datasource.id);
      return true;
    });
  }

  private findMatchingLocalDatasource(
    datasources: DatasourceRecord[],
    name: string,
    sourceDetail: string | undefined,
    type: DatasourceType
  ) {
    const normalizedName = name.trim();
    const normalizedSource = sourceDetail?.trim() ?? "";

    return datasources.find(
      (datasource) =>
        datasource.type === type &&
        datasource.name === normalizedName &&
        (datasource.sourceDetail?.trim() ?? "") === normalizedSource
    );
  }

  private uniqueJobs(jobs: CrawlerJobRecord[]) {
    const seen = new Set<string>();

    return jobs.filter((job) => {
      if (seen.has(job.id)) {
        return false;
      }

      seen.add(job.id);
      return true;
    });
  }

  private sortDatasources(datasources: DatasourceRecord[]) {
    return [...datasources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private sortJobs(jobs: CrawlerJobRecord[]) {
    return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private replaceFallbackData(datasources: DatasourceRecord[], jobs: CrawlerJobRecord[]) {
    fallbackDatasources.splice(0, fallbackDatasources.length, ...datasources);
    fallbackJobs.splice(0, fallbackJobs.length, ...jobs);
  }

  private normalizeDatasourceInput(input: CreateDatasourceInput) {
    return {
      name: input.name?.trim() || "新的数据源",
      type: input.type ?? "manual",
      enabled: input.enabled ?? true,
      frequency: input.frequency?.trim() || "手动",
      sourceDetail: input.sourceDetail?.trim() || undefined,
      note: this.composeDatasourceNote(input.sourceDetail, input.note)
    };
  }

  private normalizeDatasourceUpdateInput(input: UpdateDatasourceInput) {
    const data: Partial<{
      name: string;
      type: DatasourceType;
      enabled: boolean;
      frequency: string;
      sourceDetail: string | null;
      note: string | null;
    }> = {};

    if (input.name !== undefined) {
      data.name = input.name.trim() || "新的数据源";
    }

    if (input.type !== undefined) {
      data.type = this.toDatasourceType(input.type);
    }

    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
    }

    if (input.frequency !== undefined) {
      data.frequency = input.frequency.trim() || "手动";
    }

    if (input.sourceDetail !== undefined) {
      data.sourceDetail = input.sourceDetail.trim() || null;
    }

    if (input.note !== undefined) {
      data.note = this.composeDatasourceNote(input.sourceDetail, input.note);
    }

    return data;
  }

  private normalizeLocalDatasourceUpdateInput(existing: DatasourceRecord, input: UpdateDatasourceInput): Partial<DatasourceRecord> {
    const sourceDetail = input.sourceDetail !== undefined ? input.sourceDetail.trim() || undefined : existing.sourceDetail;

    return {
      name: input.name !== undefined ? input.name.trim() || "新的数据源" : existing.name,
      type: input.type !== undefined ? this.toDatasourceType(input.type) : existing.type,
      enabled: input.enabled ?? existing.enabled,
      frequency: input.frequency !== undefined ? input.frequency.trim() || "手动" : existing.frequency,
      sourceDetail,
      note: input.note !== undefined ? (this.composeDatasourceNote(sourceDetail, input.note) ?? "") : existing.note
    };
  }

  private async ensureSeedDatasources() {
    const count = await this.prisma.dataSource.count();

    if (count > 0) {
      return;
    }

    await this.prisma.dataSource.createMany({
      data: fallbackDatasources.map((datasource) => ({
        id: datasource.id,
        name: datasource.name,
        type: datasource.type,
        enabled: datasource.enabled,
        frequency: datasource.frequency,
        sourceDetail: datasource.sourceDetail,
        note: datasource.note,
        createdAt: new Date(datasource.createdAt),
        updatedAt: new Date(datasource.updatedAt)
      })),
      skipDuplicates: true
    });

    await this.prisma.crawlerJob.createMany({
      data: fallbackJobs.map((job) => ({
        id: job.id,
        datasourceId: job.datasourceId,
        name: job.name,
        type: job.type,
        status: job.status,
        lastRunAt: job.lastRunAt === "-" ? null : new Date(job.lastRunAt),
        successCount: job.successCount,
        failureReason: job.failureReason,
        sourceDetail: job.sourceDetail,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.createdAt)
      })),
      skipDuplicates: true
    });
  }

  private parseCsv(csvText: string) {
    if (!csvText) {
      return [];
    }

    const firstLine = csvText.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
    const table = this.parseDelimitedRows(csvText, delimiter).filter((row) => row.some((cell) => cell.trim()));

    if (table.length < 2) {
      return [];
    }

    const headers = table[0].map((header) => this.normalizeHeader(header));

    return table.slice(1).map((row) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        record[header] = row[index]?.trim() ?? "";
        return record;
      }, {})
    );
  }

  private parseDelimitedRows(text: string, delimiter: string) {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      if (character === '"' && nextCharacter === '"' && inQuotes) {
        currentCell += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (character === delimiter && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = "";
        continue;
      }

      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        continue;
      }

      currentCell += character;
    }

    currentRow.push(currentCell);
    rows.push(currentRow);
    return rows;
  }

  private rowsToTrends(
    rows: Record<string, string>[],
    options: {
      idPrefix: string;
      defaultPlatform: string;
      defaultReason: string;
    }
  ): Trend[] {
    return rows
      .map((row, index) => {
        const genre = this.valueFrom(row, ["genre", "题材", "赛道", "分类"]);

        if (!genre) {
          return null;
        }

        const heat = this.numberFrom(this.valueFrom(row, ["heat", "热度", "热度分"]), 72 + index);
        const growthRate = this.numberFrom(this.valueFrom(row, ["growthrate", "growth_rate", "增长率", "增长"]), 0);
        const opportunityScore = this.numberFrom(this.valueFrom(row, ["opportunityscore", "opportunity_score", "机会分", "推荐分"]), Math.min(95, heat));
        const saturationScore = this.numberFrom(this.valueFrom(row, ["saturationscore", "saturation_score", "饱和度", "同质化"]), 58);
        const tags = this.valueFrom(row, ["tags", "标签", "关键词"])
          .split(/[、，,;；]/)
          .map((tag) => tag.trim())
          .filter(Boolean);

        return {
          id: `${options.idPrefix}-${Date.now()}-${index}`,
          platform: this.valueFrom(row, ["platform", "平台"]) || options.defaultPlatform,
          genre,
          heat,
          growthRate,
          opportunityScore,
          saturationScore,
          reason: this.valueFrom(row, ["reason", "原因", "理由", "备注"]) || options.defaultReason,
          tags,
          createdAt: this.today()
        };
      })
      .filter((trend): trend is Trend => Boolean(trend));
  }

  private rowsToWorkPerformance(rows: Record<string, string>[]): WorkPerformanceImportRow[] {
    return rows
      .map<WorkPerformanceImportRow | null>((row) => {
        const title = this.valueFrom(row, ["title", "worktitle", "work_title", "作品名", "作品", "书名", "篇名", "标题"]);

        if (!title) {
          return null;
        }

        const tags = this.valueFrom(row, ["tags", "标签", "关键词"])
          .split(/[、，,;；]/)
          .map((tag) => tag.trim())
          .filter(Boolean);
        const work: WorkPerformanceImportRow = {
          title,
          tags
        };
        const platform = this.valueFrom(row, ["platform", "平台"]);
        const genre = this.valueFrom(row, ["genre", "题材", "赛道", "分类"]);
        const wordCount = this.numberMetricFrom(this.valueFrom(row, ["wordcount", "word_count", "字数", "正文字数"]));
        const readCount = this.numberMetricFrom(this.valueFrom(row, ["readcount", "read_count", "阅读量", "阅读", "播放量", "曝光", "views"]));
        const subscriptionCount = this.numberMetricFrom(this.valueFrom(row, ["subscriptioncount", "subscription_count", "收藏", "订阅", "追读", "加书架"]));
        const revenue = this.numberMetricFrom(this.valueFrom(row, ["revenue", "收益", "收入", "稿费", "分成"]));
        const completionRate = this.numberMetricFrom(this.valueFrom(row, ["completionrate", "completion_rate", "完读率", "完读", "completion"]));
        const summary = this.valueFrom(row, ["summary", "简介", "故事简介", "备注", "reason", "原因"]);
        const commentFeedback = this.valueFrom(row, ["commentfeedback", "comment_feedback", "comments", "comment", "评论反馈", "评论", "评论摘要", "读者反馈", "评论区反馈"]);
        const commentKeywords = this.commentKeywordsFrom(
          this.valueFrom(row, ["commentkeywords", "comment_keywords", "评论关键词", "评论标签", "高频评论"]),
          commentFeedback
        );

        if (platform) work.platform = platform;
        if (genre) work.genre = genre;
        if (wordCount !== undefined) work.wordCount = wordCount;
        if (readCount !== undefined) work.readCount = readCount;
        if (subscriptionCount !== undefined) work.subscriptionCount = subscriptionCount;
        if (revenue !== undefined) work.revenue = revenue;
        if (completionRate !== undefined) work.completionRate = completionRate;
        if (summary) work.summary = summary;
        if (commentFeedback) work.commentFeedback = commentFeedback;
        if (commentKeywords.length) work.commentKeywords = commentKeywords;

        return work;
      })
      .filter((work): work is WorkPerformanceImportRow => Boolean(work));
  }

  private commentKeywordsFrom(explicitKeywords: string, feedback: string) {
    const candidates = [
      ...explicitKeywords.split(/[、，,;；/|｜]/),
      ...Array.from(feedback.matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/gu)).map((match) => match[0])
    ];
    const stopWords = new Set(["这个", "真的", "感觉", "作者", "读者", "评论", "反馈", "有点", "还是", "不是", "没有", "可以", "但是", "就是", "非常", "比较"]);

    return Array.from(new Set(candidates.map((keyword) => keyword.trim()).filter((keyword) => keyword.length >= 2 && !stopWords.has(keyword)))).slice(0, 10);
  }

  private numberMetricFrom(value: string) {
    const cleanValue = value.replace(/[¥￥,\s]/gu, "").trim();
    const match = /([+-]?\d+(?:\.\d+)?)(万|w|k|千)?%?/iu.exec(cleanValue);

    if (!match?.[1]) {
      return undefined;
    }

    const base = Number.parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();

    if (!Number.isFinite(base)) {
      return undefined;
    }

    if (unit === "万" || unit === "w") {
      return base * 10000;
    }

    if (unit === "千" || unit === "k") {
      return base * 1000;
    }

    return base;
  }

  private importMessage(sourceLabel: string, verb: string, rows: number, trends: number, updated: number, created: number) {
    return `${sourceLabel}${verb}：识别 ${rows} 行，生成 ${trends} 条趋势数据，更新 ${updated} 部作品，新增 ${created} 部作品。`;
  }

  private async saveCsvFile(input: ImportCsvInput): Promise<SavedCsvFile | null> {
    const csvText = input.csvText ?? "";
    const originalName = input.fileName?.trim();

    if (!csvText.trim() || !originalName) {
      return null;
    }

    const buffer = Buffer.from(csvText, "utf8");
    const maxBytes = 5 * 1024 * 1024;

    if (buffer.length > maxBytes) {
      throw new BadRequestException("CSV 超过 5MB，请先精简或拆分后再导入。");
    }

    const baseName = this.safeFileName(originalName.replace(/\.[^.]+$/u, "") || input.name || "csv");
    const extension = /\.(txt)$/iu.test(originalName) ? "txt" : "csv";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/u, "Z");
    const fileName = `${stamp}-${baseName}.${extension}`;
    const storedPath = path.join(this.csvUploadRoot(), fileName);

    await mkdir(path.dirname(storedPath), { recursive: true });
    await writeFile(storedPath, buffer);

    return {
      storedPath,
      originalName,
      sizeBytes: buffer.length
    };
  }

  private async saveScreenshotFile(input: ImportScreenshotInput): Promise<SavedScreenshotFile> {
    const dataUrl = input.dataUrl?.trim() ?? "";
    const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/iu.exec(dataUrl);

    if (!match) {
      throw new BadRequestException("请上传 PNG、JPG、WEBP 或 GIF 格式的截图。");
    }

    const mimeType = match[1].toLowerCase();
    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    const maxBytes = 8 * 1024 * 1024;

    if (buffer.length === 0) {
      throw new BadRequestException("截图文件为空，请重新选择。");
    }

    if (buffer.length > maxBytes) {
      throw new BadRequestException("截图超过 8MB，请先压缩后再上传。");
    }

    const originalName = input.fileName?.trim() || "screenshot";
    const extension = this.extensionFromMime(mimeType);
    const baseName = this.safeFileName(originalName.replace(/\.[^.]+$/u, "") || input.name || "screenshot");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/u, "Z");
    const fileName = `${stamp}-${baseName}.${extension}`;
    const storedPath = path.join(this.screenshotUploadRoot(), fileName);

    await mkdir(path.dirname(storedPath), { recursive: true });
    await writeFile(storedPath, buffer);

    return {
      storedPath,
      originalName,
      sizeBytes: buffer.length
    };
  }

  private async fetchPublicPage(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "ShenbiMaliangAgent/0.1 public-page-reader"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new BadRequestException(`公开页面返回 ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/text|html|xml|json/iu.test(contentType)) {
        throw new BadRequestException("公开页面不是可解析的文本页面。");
      }

      return (await response.text()).slice(0, 1_200_000);
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizePublicUrl(value?: string) {
    const rawUrl = value?.trim();

    if (!rawUrl) {
      throw new BadRequestException("请填写公开网页地址。");
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException("公开网页地址格式不正确。");
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException("公开网页地址必须以 http 或 https 开头。");
    }

    if (this.isBlockedHost(parsed.hostname)) {
      throw new BadRequestException("公开网页采集只读取外部公开页面，不读取本机或内网地址。");
    }

    return parsed.toString();
  }

  private isBlockedHost(hostname: string) {
    const host = hostname.toLowerCase();

    if (host === "localhost" || host.endsWith(".local") || host === "::1") {
      return true;
    }

    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host);

    if (!ipv4) {
      return false;
    }

    const first = Number(ipv4[1]);
    const second = Number(ipv4[2]);

    return first === 10 || first === 127 || first === 0 || first === 169 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }

  private publicPageToRows(html: string, sourceUrl: string): Record<string, string>[] {
    const $ = load(html);
    $("script, style, noscript, svg").remove();

    const blocks: string[] = [];
    $("title, h1, h2, h3, h4, li, p, article, a").each((_, element) => {
      blocks.push($(element).text());
    });
    $("meta[name='description'], meta[property='og:description'], meta[name='keywords']").each((_, element) => {
      blocks.push($(element).attr("content") ?? "");
    });

    const lines = this.uniqueTextBlocks(blocks);
    const genres = this.publicGenreKeywords();
    const tagKeywords = this.publicTagKeywords();
    const rows: Record<string, string>[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const matchedGenres = genres.filter((genre) => line.includes(genre));

      for (const genre of matchedGenres.slice(0, 3)) {
        const key = `${genre}:${line.slice(0, 80)}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        const rank = this.rankFromPublicLine(line);
        const saturationHint = /同质化|饱和|扎堆|套路|疲劳/u.test(line);
        const growthHint = /增长|上升|飙升|新晋|黑马|爆|热度升/u.test(line);
        const declineHint = /下降|回落|降温|疲劳/u.test(line);
        const heat = Math.max(60, Math.min(98, 96 - rows.length * 3 - Math.max(0, rank - 1) * 2));
        const growthRate = growthHint ? 8.6 : declineHint ? -4.2 : 0;
        const opportunityScore = Math.max(55, Math.min(96, heat - (saturationHint ? 12 : 3)));
        const saturationScore = saturationHint ? 76 : 52;
        const tags = [genre, ...tagKeywords.filter((tag) => tag !== genre && line.includes(tag)).slice(0, 6)];

        rows.push({
          platform: this.inferPlatform(`${sourceUrl} ${line}`),
          genre,
          heat: String(heat),
          growthrate: String(growthRate),
          opportunityscore: String(opportunityScore),
          saturationscore: String(saturationScore),
          tags: tags.join("、"),
          reason: `公开页面片段：“${this.truncateText(line, 96)}”；来源：${sourceUrl}`
        });
      }
    }

    return rows.slice(0, 40);
  }

  private uniqueTextBlocks(blocks: string[]) {
    const seen = new Set<string>();

    return blocks
      .map((block) => block.replace(/\s+/gu, " ").trim())
      .filter((block) => block.length >= 4 && block.length <= 360)
      .filter((block) => {
        if (seen.has(block)) {
          return false;
        }

        seen.add(block);
        return true;
      });
  }

  private applyCsvFieldMappings(rows: Array<Record<string, string>>, fieldMappings: Record<string, string> | undefined) {
    const entries = Object.entries(fieldMappings ?? {})
      .map(([targetField, sourceHeader]) => ({
        targetKey: this.normalizeHeader(targetField),
        sourceKey: this.normalizeHeader(sourceHeader)
      }))
      .filter((entry) => entry.targetKey && entry.sourceKey);

    if (entries.length === 0) {
      return rows;
    }

    return rows.map((row) => {
      const nextRow = { ...row };

      for (const entry of entries) {
        const value = row[entry.sourceKey];

        if (value !== undefined && value !== "") {
          nextRow[entry.targetKey] = value;
        }
      }

      return nextRow;
    });
  }

  private rankFromPublicLine(line: string) {
    const match = /(?:第\s*)?(\d{1,3})\s*(?:名|位)|TOP\s*(\d{1,3})/iu.exec(line);
    const value = Number(match?.[1] ?? match?.[2] ?? 1);
    return Number.isFinite(value) ? value : 1;
  }

  private publicGenreKeywords() {
    return [
      "女性成长",
      "现言甜宠",
      "悬疑惊悚",
      "宫斗宅斗",
      "古言甜宠",
      "男频脑洞",
      "都市逆袭",
      "现实情感",
      "亲情冲突",
      "身份反转",
      "复仇爽文",
      "家庭伦理",
      "破镜重圆",
      "小人物逆袭",
      "真千金",
      "重生女主",
      "县城女性",
      "短剧感",
      "重生",
      "赘婿",
      "校园",
      "年代",
      "权谋",
      "玄幻",
      "都市",
      "悬疑",
      "惊悚",
      "甜宠",
      "古言",
      "现言",
      "男频",
      "女频"
    ];
  }

  private publicTagKeywords() {
    return [
      "强钩子",
      "开篇反转",
      "克制反击",
      "爽点",
      "泪点",
      "人味细节",
      "反转",
      "复仇",
      "逆袭",
      "豪门",
      "打脸",
      "亲情",
      "婚恋",
      "悬念",
      "信息差",
      "短篇",
      "完读率",
      "高收益"
    ];
  }

  private truncateText(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private async writeCrawlerLogSafe(entry: {
    jobId: string;
    datasourceId?: string;
    name: string;
    type: CrawlerJobRecord["type"];
    status: CrawlerJobStatus;
    successCount: number;
    message: string;
    source?: string;
  }) {
    try {
      const filePath = this.crawlerLogFilePath();
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify({ createdAt: new Date().toISOString(), ...entry })}\n`, "utf8");
    } catch {
      // 本地日志是辅助记录，写失败不应该影响用户导入数据。
    }
  }

  private extensionFromMime(mimeType: string) {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return "jpg";
    }

    if (mimeType === "image/webp") {
      return "webp";
    }

    if (mimeType === "image/gif") {
      return "gif";
    }

    return "png";
  }

  private safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|\s]+/gu, "-").replace(/-+/g, "-").slice(0, 80).replace(/^-|-$/g, "") || "screenshot";
  }

  private parseScreenshotCorrectionText(rawText: string) {
    const csvRows = this.parseCsv(rawText);
    const manualTrendRows = this.parseManualText(rawText);
    const manualPerformanceRows = this.parseLabeledPerformanceBlocks(rawText);

    return this.uniqueRows([...csvRows, ...manualTrendRows, ...manualPerformanceRows]);
  }

  private parseScreenshotPerformanceLine(line: string): Record<string, string> | null {
    if (!line) {
      return null;
    }

    const row = this.performanceFieldsFromLine(line);

    if (!row.title && !row.genre) {
      return null;
    }

    return row;
  }

  private parseLabeledPerformanceBlocks(rawText: string): Record<string, string>[] {
    const rows: Record<string, string>[] = [];
    let currentRow: Record<string, string> = {};

    for (const line of rawText.split(/\r?\n/).map((item) => item.trim())) {
      if (!line) {
        this.pushPerformanceBlock(rows, currentRow);
        currentRow = {};
        continue;
      }

      const fields = this.performanceFieldsFromLine(line);

      if (Object.keys(fields).length === 0) {
        continue;
      }

      if (fields.title && this.hasPerformanceBlockIdentity(currentRow)) {
        this.pushPerformanceBlock(rows, currentRow);
        currentRow = {};
      }

      currentRow = {
        ...currentRow,
        ...fields
      };
    }

    this.pushPerformanceBlock(rows, currentRow);

    return rows;
  }

  private pushPerformanceBlock(rows: Record<string, string>[], row: Record<string, string>) {
    if (this.hasPerformanceBlockIdentity(row)) {
      rows.push(row);
    }
  }

  private hasPerformanceBlockIdentity(row: Record<string, string>) {
    return Boolean(row.title || row.genre);
  }

  private performanceFieldsFromLine(line: string) {
    const stopLabels = this.screenshotStopLabels();
    const row: Record<string, string> = {
      platform: this.textFieldFromLine(line, ["平台", "platform"], stopLabels) || this.inferPlatform(line),
      title: this.textFieldFromLine(line, ["作品名", "作品", "书名", "篇名", "标题", "title"], stopLabels),
      genre: this.textFieldFromLine(line, ["题材", "赛道", "分类", "genre"], stopLabels) || this.inferGenre(line, this.inferPlatform(line)),
      readcount: this.metricWithUnitFromLine(line, ["阅读量", "阅读", "播放量", "曝光", "views"]),
      revenue: this.metricWithUnitFromLine(line, ["收益", "收入", "稿费", "分成", "revenue"]),
      completionrate: this.metricWithUnitFromLine(line, ["完读率", "完读", "completion"]),
      subscriptioncount: this.metricWithUnitFromLine(line, ["收藏", "订阅", "追读", "加书架"]),
      wordcount: this.metricWithUnitFromLine(line, ["字数", "正文字数"]),
      heat: this.metricFromLine(line, ["热度", "热度分", "heat"]),
      growthrate: this.metricFromLine(line, ["增长率", "增长", "growth"]),
      opportunityscore: this.metricFromLine(line, ["机会分", "机会", "推荐分", "opportunity"]),
      saturationscore: this.metricFromLine(line, ["饱和度", "饱和", "同质化", "saturation"]),
      tags: this.textFieldFromLine(line, ["标签", "关键词", "tags"], stopLabels),
      reason: this.textFieldFromLine(line, ["原因", "理由", "备注", "简介", "summary", "reason"], []),
      commentfeedback: this.textFieldFromLine(line, ["评论反馈", "评论摘要", "读者反馈", "评论区反馈", "评论", "comments", "comment"], stopLabels),
      commentkeywords: this.textFieldFromLine(line, ["评论关键词", "评论标签", "高频评论", "commentkeywords"], stopLabels)
    };

    return Object.fromEntries(Object.entries(row).filter(([, value]) => value.trim()));
  }

  private uniqueRows(rows: Record<string, string>[]) {
    const seen = new Set<string>();

    return rows.filter((row) => {
      const key = Object.entries(row)
        .map(([field, value]) => [field.trim().toLowerCase(), value.replace(/\s+/gu, " ").trim().toLowerCase()] as const)
        .filter(([, value]) => value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, value]) => `${field}:${value}`)
        .join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private parseManualText(rawText: string): Record<string, string>[] {
    return rawText
      .split(/\r?\n/)
      .map((line) => this.parseManualLine(line.trim()))
      .filter((row): row is Record<string, string> => Boolean(row));
  }

  private parseManualLine(line: string): Record<string, string> | null {
    if (!line) {
      return null;
    }

    const platform = this.textFieldFromLine(line, ["平台", "platform"]) || this.inferPlatform(line);
    const genre = this.textFieldFromLine(line, ["题材", "赛道", "分类", "genre"]) || this.inferGenre(line, platform);
    const metricStart = this.firstManualLabelIndex(line);
    const metricText = metricStart >= 0 ? line.slice(metricStart) : line;
    const numbers = Array.from(metricText.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)).map((match) => match[0].replace("%", ""));

    if (!genre) {
      return null;
    }

    return {
      platform,
      genre,
      heat: this.metricFromLine(line, ["热度", "热度分", "heat"]) || numbers[0] || "",
      growthrate: this.metricFromLine(line, ["增长率", "增长", "growth"]) || numbers[1] || "",
      opportunityscore: this.metricFromLine(line, ["机会分", "机会", "推荐分", "opportunity"]) || numbers[2] || "",
      saturationscore: this.metricFromLine(line, ["饱和度", "饱和", "同质化", "saturation"]) || numbers[3] || "",
      tags: this.textFieldFromLine(line, ["标签", "关键词", "tags"]),
      reason: this.textFieldFromLine(line, ["原因", "理由", "备注", "reason"], [])
    };
  }

  private metricFromLine(line: string, labels: string[]) {
    for (const label of labels) {
      const match = new RegExp(`${this.escapeRegExp(label)}\\s*(?:[:：=]|为|是)?\\s*([+-]?\\d+(?:\\.\\d+)?)%?`, "iu").exec(line);

      if (match?.[1]) {
        return match[1];
      }
    }

    return "";
  }

  private metricWithUnitFromLine(line: string, labels: string[]) {
    for (const label of labels) {
      const match = new RegExp(`${this.escapeRegExp(label)}\\s*(?:[:：=]|为|是)?\\s*([¥￥]?[+-]?\\d+(?:\\.\\d+)?(?:万|w|k|千)?%?)`, "iu").exec(line);

      if (match?.[1]) {
        return match[1];
      }
    }

    return "";
  }

  private textFieldFromLine(line: string, labels: string[], stopLabels = this.manualStopLabels()) {
    for (const label of labels) {
      const match = new RegExp(`(?:^|[\\s,，;；|｜])${this.escapeRegExp(label)}\\s*(?:[:：=]|为|是)?\\s*([^,，;；|｜\\n]+)`, "iu").exec(line);

      if (match?.[1]) {
        return this.trimManualField(match[1], stopLabels);
      }
    }

    return "";
  }

  private trimManualField(value: string, stopLabels: string[]) {
    let nextValue = value.trim();

    for (const label of stopLabels) {
      const index = this.manualLabelIndex(nextValue, label);

      if (index > 0) {
        nextValue = nextValue.slice(0, index).trim();
      }
    }

    return nextValue.replace(/^[：:=\s]+/u, "").trim();
  }

  private inferPlatform(line: string) {
    const tokens = this.manualTokens(line);
    return tokens.find((token) => /番茄|短故事|小说|抖音|知乎|小红书|快手/u.test(token)) ?? "手动粘贴";
  }

  private inferGenre(line: string, platform: string) {
    const metricStart = this.firstManualLabelIndex(line);
    const head = metricStart >= 0 ? line.slice(0, metricStart) : line;
    const tokens = this.manualTokens(head).filter((token) => token !== platform && !this.manualStopLabels().includes(token) && !/^\d+(?:\.\d+)?%?$/u.test(token));

    return tokens.find((token) => token.length >= 2 && token.length <= 40) ?? "";
  }

  private firstManualLabelIndex(line: string) {
    const indexes = this.manualStopLabels()
      .map((label) => this.manualLabelIndex(line, label))
      .filter((index) => index >= 0);

    return indexes.length > 0 ? Math.min(...indexes) : -1;
  }

  private manualLabelIndex(line: string, label: string) {
    return line.search(new RegExp(`(?:^|[\\s,，;；|｜])${this.escapeRegExp(label)}\\s*(?:[:：=]|为|是)?`, "iu"));
  }

  private manualTokens(line: string) {
    return line
      .replace(/[|｜,，;；]/gu, " ")
      .split(/\s+/u)
      .map((token) => token.replace(/^(平台|题材|赛道|分类|标签|关键词|原因|理由|备注)[:：=]?/u, "").trim())
      .filter(Boolean);
  }

  private manualStopLabels() {
    return [
      "平台",
      "platform",
      "作品名",
      "作品",
      "书名",
      "篇名",
      "标题",
      "title",
      "题材",
      "赛道",
      "分类",
      "genre",
      "热度",
      "热度分",
      "heat",
      "增长率",
      "增长",
      "growth",
      "机会分",
      "机会",
      "推荐分",
      "opportunity",
      "饱和度",
      "饱和",
      "同质化",
      "saturation",
      "阅读量",
      "阅读",
      "播放量",
      "曝光",
      "views",
      "收益",
      "收入",
      "稿费",
      "分成",
      "revenue",
      "完读率",
      "完读",
      "completion",
      "收藏",
      "订阅",
      "追读",
      "加书架",
      "字数",
      "正文字数",
      "标签",
      "关键词",
      "tags",
      "原因",
      "理由",
      "备注",
      "简介",
      "summary",
      "reason",
      "评论反馈",
      "评论摘要",
      "读者反馈",
      "评论区反馈",
      "评论",
      "comments",
      "comment",
      "评论关键词",
      "评论标签",
      "高频评论",
      "commentkeywords"
    ];
  }

  private screenshotStopLabels() {
    return [
      ...this.manualStopLabels(),
      "作品名",
      "作品",
      "书名",
      "篇名",
      "标题",
      "title",
      "阅读量",
      "阅读",
      "播放量",
      "曝光",
      "views",
      "收益",
      "收入",
      "稿费",
      "分成",
      "revenue",
      "完读率",
      "完读",
      "completion",
      "收藏",
      "订阅",
      "追读",
      "加书架",
      "字数",
      "正文字数",
      "summary",
      "评论反馈",
      "评论摘要",
      "读者反馈",
      "评论区反馈",
      "评论",
      "comments",
      "comment",
      "评论关键词",
      "评论标签",
      "高频评论",
      "commentkeywords"
    ];
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private valueFrom(row: Record<string, string>, keys: string[]) {
    for (const key of keys) {
      const value = row[this.normalizeHeader(key)];

      if (value) {
        return value.trim();
      }
    }

    return "";
  }

  private numberFrom(value: string, fallback: number) {
    const parsed = Number.parseFloat(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private normalizeHeader(value: string) {
    return value.trim().replace(/\s+/g, "").toLowerCase();
  }

  private toDatasource(datasource: DbDatasource, persisted: boolean): DatasourceRecord {
    return {
      id: datasource.id,
      name: datasource.name,
      type: this.toDatasourceType(datasource.type),
      enabled: datasource.enabled,
      frequency: datasource.frequency,
      note: datasource.note ?? "",
      sourceDetail: datasource.sourceDetail ?? this.datasourceSourceDetail(datasource.note),
      persisted,
      createdAt: datasource.createdAt.toISOString().slice(0, 10),
      updatedAt: datasource.updatedAt.toISOString().slice(0, 10)
    };
  }

  private toJob(job: DbCrawlerJob, persisted: boolean): CrawlerJobRecord {
    return {
      id: job.id,
      datasourceId: job.datasourceId ?? undefined,
      name: job.name,
      type: this.toJobType(job.type),
      status: this.toJobStatus(job.status),
      lastRunAt: job.lastRunAt ? this.formatDateTime(job.lastRunAt) : "-",
      successCount: job.successCount,
      failureReason: job.failureReason ?? "",
      sourceDetail: this.jobSourceDetail(job),
      persisted,
      createdAt: job.createdAt.toISOString().slice(0, 10)
    };
  }

  private jobSourceDetail(job: DbCrawlerJob | CrawlerJobRecord, datasources: DatasourceRecord[] = []) {
    if ("sourceDetail" in job && job.sourceDetail) {
      return job.sourceDetail;
    }

    const datasource = "datasource" in job ? job.datasource : datasources.find((item) => item.id === job.datasourceId);
    const datasourceNote = [datasource?.sourceDetail, datasource?.note].filter(Boolean).join("。");
    const sourceText = [datasourceNote, job.failureReason].filter(Boolean).join("。");
    const match = sourceText.match(/(?:截图已保存到|来源：)([^。]+)。?/u);

    return match?.[1]?.trim();
  }

  private composeDatasourceNote(sourceDetail?: string, note?: string) {
    const cleanSource = sourceDetail?.trim();
    const cleanNote = note?.trim();

    if (cleanSource && cleanNote) {
      return `来源：${cleanSource}。${cleanNote}`;
    }

    if (cleanSource) {
      return `来源：${cleanSource}。`;
    }

    return cleanNote || null;
  }

  private datasourceSourceDetail(note?: string | null) {
    const match = note?.match(/来源：([^。]+)。?/u);
    return match?.[1]?.trim();
  }

  private publicPageRetryUrl(job: CrawlerJobRecord) {
    const candidates = [job.sourceDetail, job.failureReason].filter(Boolean);

    for (const candidate of candidates) {
      const match = candidate!.match(/https?:\/\/[^\s，。)）]+/iu);

      if (match?.[0]) {
        return match[0];
      }
    }

    return "";
  }

  private toDatasourceType(type: string): DatasourceType {
    if (type === "public_page" || type === "csv" || type === "screenshot" || type === "manual") {
      return type;
    }

    return "manual";
  }

  private toJobType(type: string): CrawlerJobRecord["type"] {
    if (type === "public_rank") {
      return type;
    }

    return this.toDatasourceType(type);
  }

  private toJobStatus(status: string): CrawlerJobStatus {
    if (status === "success" || status === "waiting" || status === "failed" || status === "running") {
      return status;
    }

    return "waiting";
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private formatDateTime(value: Date) {
    return value.toISOString().slice(0, 16).replace("T", " ");
  }

  private localDatasourceFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "datasources.json");
  }

  private screenshotUploadRoot() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "uploads", "screenshots");
  }

  private csvUploadRoot() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "uploads", "csv");
  }

  private crawlerLogFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOG_DIR ?? "logs", "crawler.log");
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return "未知错误";
  }
}
