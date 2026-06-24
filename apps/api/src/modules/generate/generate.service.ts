import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type {
  FullDraftAiResult,
  FullDraftInput,
  FullDraftJobCheckpointSnapshot,
  FullDraftJobSnapshot,
  FullDraftMode,
  FullDraftResult,
  StoryOutlineInput,
  WorkGenerationMetadata
} from "@shenbi/shared";
import type { FullDraftGenerationCheckpoint, FullDraftGenerationProgress } from "../ai/ai-provider.service.js";
import { WorksService } from "../works/works.service.js";
import { WritingWorkflowService } from "../writing/writing-workflow.service.js";

type FullDraftJobRuntime = {
  input: FullDraftInput;
  checkpoint?: FullDraftGenerationCheckpoint;
  qualityLog: string[];
  attempts: number;
};

type StoredFullDraftJob = {
  app: "神笔马良短篇小说 Agent";
  updatedAt: string;
  job: FullDraftJobSnapshot;
  runtime: FullDraftJobRuntime;
};

@Injectable()
export class GenerateService {
  private readonly jobs = new Map<string, FullDraftJobSnapshot>();
  private readonly jobRuns = new Map<string, FullDraftJobRuntime>();
  private readonly completedJobTtlMs = 1000 * 60 * 60 * 12;

  constructor(
    @Inject(WritingWorkflowService) private readonly writingWorkflow: WritingWorkflowService,
    @Inject(WorksService) private readonly worksService: WorksService
  ) {}

  startFullDraftJob(input: FullDraftInput): FullDraftJobSnapshot {
    this.cleanupJobs();
    const normalized = this.normalizeInput(input);
    const now = new Date().toISOString();
    const job: FullDraftJobSnapshot = {
      jobId: `draft-${Date.now()}-${randomUUID().slice(0, 8)}`,
      status: "queued",
      progress: 4,
      progressLabel: "准备生成",
      detail: normalized.mode === "autopilot" ? "全自动模式已开始。" : "灵感已收到，正在进入生成。",
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(job.jobId, job);
    this.jobRuns.set(job.jobId, {
      input: normalized,
      qualityLog: [],
      attempts: 1
    });
    void this.persistJobState(job.jobId).catch(() => undefined);
    void this.runFullDraftJob(job.jobId);

    return this.snapshot(job);
  }

  async resumeFullDraftJob(jobId: string): Promise<FullDraftJobSnapshot> {
    const restored = await this.restoreJobState(jobId);
    const job = this.jobs.get(jobId) ?? restored;
    const runtime = this.jobRuns.get(jobId);

    if (!job || !runtime) {
      throw new NotFoundException("没有找到可继续的生成任务。");
    }

    if (job.status === "running" || job.status === "queued") {
      return this.snapshot(job);
    }

    if (!runtime.checkpoint) {
      throw new BadRequestException("这次任务还没有可继续的断点，需要重新生成。");
    }

    runtime.attempts += 1;
    this.updateJob(jobId, {
      status: "queued",
      progress: Math.max(8, job.progress < 100 ? job.progress : 18),
      progressLabel: "准备继续生成",
      detail: `将从第 ${runtime.checkpoint.sections.length + 1} 段继续，不会重写已完成正文。`,
      error: undefined,
      result: undefined,
      checkpoint: this.toCheckpointSnapshot(runtime.checkpoint, "starting", runtime.checkpoint.blueprint.sections[runtime.checkpoint.sections.length]?.title, true)
    });

    void this.runFullDraftJob(jobId);

    return this.snapshot(this.jobs.get(jobId) ?? job);
  }

  async getFullDraftJob(jobId: string): Promise<FullDraftJobSnapshot> {
    const restored = await this.restoreJobState(jobId);
    const job = this.jobs.get(jobId) ?? restored;

    if (!job) {
      throw new NotFoundException("没有找到这次生成任务，可能是服务重启或任务已过期。");
    }

    return this.snapshot(job);
  }

  createStoryOutline(input: StoryOutlineInput) {
    const normalized = this.normalizeInput(input);

    return this.writingWorkflow.createStoryOutline({
      ...normalized,
      previousOutlines: Array.isArray(input.previousOutlines) ? input.previousOutlines : []
    });
  }

  private async runFullDraftJob(jobId: string) {
    let stopHeartbeat: () => void = () => undefined;
    const runtime = this.jobRuns.get(jobId);

    if (!runtime) {
      this.updateJob(jobId, {
        status: "failed",
        progress: 100,
        progressLabel: "生成失败",
        detail: "没有找到这次生成的运行状态，需要重新开始。",
        error: "生成任务运行状态丢失。"
      });
      return;
    }

    try {
      this.updateJob(jobId, {
        status: "running",
        progress: 14,
        progressLabel: "正在读取可用记忆",
        detail: "正在合并市场策略、历史作品反馈和写作记忆。"
      });

      stopHeartbeat = this.startHeartbeat(jobId);

      this.updateJob(jobId, {
        progress: 28,
        progressLabel: "正在生成完整正文",
        detail: "Kimi K2.6 正在分段写正式正文；DeepSeek 只做蓝图和连续性检查。"
      });

      const draft = await this.writingWorkflow.createFullDraft(runtime.input, {
        resumeCheckpoint: runtime.checkpoint,
        onProgress: (progress) => this.handleGenerationProgress(jobId, progress)
      });
      stopHeartbeat();

      this.updateJob(jobId, {
        progress: 78,
        progressLabel: "正在整理正文",
        detail: "正在整理标题、正文和保存信息。"
      });

      const result = await this.saveFullDraft(runtime.input, draft, jobId, runtime);

      this.updateJob(jobId, {
        status: "completed",
        progress: 100,
        progressLabel: "已完成",
        detail: result.persisted ? "作品已保存，正在进入编辑器。" : "作品已保存到本地文件，正在进入编辑器。",
        result,
        checkpoint: runtime.checkpoint
          ? this.toCheckpointSnapshot(runtime.checkpoint, "completed", runtime.checkpoint.blueprint.sections.at(-1)?.title, false)
          : undefined
      });
    } catch (error) {
      stopHeartbeat();
      const checkpoint = runtime.checkpoint;
      this.updateJob(jobId, {
        status: "failed",
        progress: 100,
        progressLabel: "生成失败",
        detail: checkpoint
          ? `这次停在第 ${checkpoint.sections.length}/${checkpoint.blueprint.sections.length} 段，可继续生成。`
          : "这次没有保存替代正文；请重试或检查 Kimi 配置。",
        error: this.errorMessage(error),
        checkpoint: checkpoint
          ? this.toCheckpointSnapshot(checkpoint, "failed", checkpoint.blueprint.sections[checkpoint.sections.length]?.title, true)
          : undefined
      });
    }
  }

  private async saveFullDraft(normalized: FullDraftInput, draft: FullDraftAiResult, jobId: string, runtime: FullDraftJobRuntime): Promise<FullDraftResult> {
    const saved = await this.worksService.createWork({
      title: draft.title,
      platform: this.platformLabel(normalized.targetPlatform),
      status: "draft",
      genreTags: this.uniqueTags([draft.genre, ...draft.tags, normalized.mode === "autopilot" ? "全自动" : "有灵感"]),
      styleTags: this.uniqueTags(["市场导向", draft.providerMode ?? "fallback", this.lengthLabel(normalized.targetLength)]),
      summary: this.summaryForWork(draft.summary, draft.marketSummary, draft.qualitySummary),
      fullText: draft.content,
      readCount: 0,
      subscriptionCount: 0,
      revenue: 0,
      completionRate: 0,
      generation: this.createWorkGenerationMetadata(normalized, draft, jobId, runtime)
    });

    return {
      workId: saved.work.id,
      editorUrl: `/editor?workId=${encodeURIComponent(saved.work.id)}`,
      title: saved.work.title,
      status: "completed",
      providerMode: draft.providerMode ?? "fallback",
      providerNotice: draft.providerNotice,
      modelName: draft.modelName,
      marketSummary: draft.marketSummary,
      qualitySummary: draft.qualitySummary,
      persisted: saved.persisted,
      message: saved.message
    };
  }

  private createWorkGenerationMetadata(
    normalized: FullDraftInput,
    draft: FullDraftAiResult,
    jobId: string,
    runtime: FullDraftJobRuntime
  ): WorkGenerationMetadata {
    const checkpoint = runtime.checkpoint;
    const modelInfo = this.parseModelInfo(draft);

    return {
      jobId,
      createdAt: new Date().toISOString(),
      route: draft.providerMode === "kimi" ? "kimi_full_text" : draft.providerMode === "deepseek" ? "legacy_deepseek" : "legacy_unknown",
      proseProvider: draft.providerMode ?? "fallback",
      proseModel: modelInfo.proseModel,
      blueprintProvider: modelInfo.blueprintProvider,
      blueprintModel: modelInfo.blueprintModel,
      providerNotice: draft.providerNotice,
      targetLength: normalized.targetLength || "auto",
      completedSections: checkpoint?.sections.length,
      totalSections: checkpoint?.blueprint.sections.length,
      wordCount: this.countReadableText(draft.content),
      continuations: checkpoint?.metrics.continuations,
      rewrites: checkpoint?.metrics.rewrites,
      continuityChecks: checkpoint?.metrics.continuityChecks,
      attempts: runtime.attempts,
      checkpointFile: this.jobStateFilePath(jobId)
    };
  }

  private parseModelInfo(draft: FullDraftAiResult): Pick<WorkGenerationMetadata, "proseModel" | "blueprintProvider" | "blueprintModel"> {
    const modelName = draft.modelName ?? "";
    const deepseekMatch = /DeepSeek\s+([^+]+)/u.exec(modelName);
    const kimiMatch = /Kimi\s+(.+)$/u.exec(modelName);

    return {
      proseModel: kimiMatch?.[1]?.trim() || (draft.providerMode === "kimi" ? modelName.trim() || undefined : undefined),
      blueprintProvider: deepseekMatch ? "deepseek" : undefined,
      blueprintModel: deepseekMatch?.[1]?.trim()
    };
  }

  private startHeartbeat(jobId: string) {
    const timer = setInterval(() => {
      const job = this.jobs.get(jobId);

      if (!job || job.status !== "running") {
        return;
      }

      const progressCeiling = this.heartbeatProgressCeiling(job);
      const nextProgress = Math.min(progressCeiling, job.progress + 1);

      if (nextProgress > job.progress) {
        this.updateJob(jobId, {
          progress: nextProgress,
          progressLabel: "正在生成完整正文",
          detail: job.checkpoint
            ? `Kimi 正在继续写作，已完成 ${job.checkpoint.completedSections}/${job.checkpoint.totalSections} 段。`
            : "Kimi 正在按分段继续写作，DeepSeek 只做后台连续性检查。"
        });
      }
    }, 5000);

    return () => clearInterval(timer);
  }

  private updateJob(jobId: string, patch: Partial<FullDraftJobSnapshot>) {
    const current = this.jobs.get(jobId);

    if (!current) {
      return;
    }

    this.jobs.set(jobId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    void this.persistJobState(jobId).catch(() => undefined);
  }

  private async persistJobState(jobId: string) {
    const job = this.jobs.get(jobId);
    const runtime = this.jobRuns.get(jobId);

    if (!job || !runtime) {
      return;
    }

    const filePath = this.jobStateFilePath(jobId);
    const payload: StoredFullDraftJob = {
      app: "神笔马良短篇小说 Agent",
      updatedAt: new Date().toISOString(),
      job: this.snapshot(job),
      runtime
    };

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private async restoreJobState(jobId: string): Promise<FullDraftJobSnapshot | undefined> {
    if (this.jobs.has(jobId) && this.jobRuns.has(jobId)) {
      return this.jobs.get(jobId);
    }

    try {
      const parsed = JSON.parse(await readFile(this.jobStateFilePath(jobId), "utf8")) as Partial<StoredFullDraftJob>;

      if (!parsed.job?.jobId || !parsed.runtime?.input) {
        return undefined;
      }

      this.jobs.set(parsed.job.jobId, parsed.job);
      this.jobRuns.set(parsed.job.jobId, {
        input: parsed.runtime.input,
        checkpoint: parsed.runtime.checkpoint,
        qualityLog: parsed.runtime.qualityLog ?? [],
        attempts: parsed.runtime.attempts ?? 1
      });

      return parsed.job;
    } catch {
      return undefined;
    }
  }

  private async handleGenerationProgress(jobId: string, progress: FullDraftGenerationProgress) {
    const runtime = this.jobRuns.get(jobId);

    if (runtime) {
      runtime.checkpoint = progress.checkpoint;
      runtime.qualityLog = progress.checkpoint.metrics.qualityLog.slice(-24);
    }

    const nextProgress = this.progressForGeneration(progress);
    this.updateJob(jobId, {
      progress: nextProgress,
      progressLabel: progress.progressLabel,
      detail: progress.detail,
      checkpoint: this.toCheckpointSnapshot(progress.checkpoint, progress.stage, progress.currentSectionTitle, true)
    });

    void this.appendGenerationQualityLog(jobId, progress).catch(() => undefined);
  }

  private progressForGeneration(progress: FullDraftGenerationProgress) {
    if (progress.stage === "blueprint") {
      return 24;
    }

    if (progress.stage === "saving" || progress.stage === "completed") {
      return 78;
    }

    if (!progress.totalSections) {
      return 30;
    }

    const sectionShare = progress.completedSections / progress.totalSections;
    const currentBonus = progress.stage === "continuity" ? 0.04 : progress.stage === "section" && progress.completedSections > 0 ? 0.02 : 0;

    return Math.min(76, Math.max(28, Math.round(30 + (sectionShare + currentBonus) * 44)));
  }

  private heartbeatProgressCeiling(job: FullDraftJobSnapshot) {
    const checkpoint = job.checkpoint;

    if (!checkpoint?.totalSections) {
      return Math.min(32, job.progress + 1);
    }

    const completedShare = checkpoint.completedSections / checkpoint.totalSections;

    return Math.min(74, Math.max(30, Math.round(31 + completedShare * 42)));
  }

  private toCheckpointSnapshot(
    checkpoint: FullDraftGenerationCheckpoint,
    stage: FullDraftJobCheckpointSnapshot["stage"],
    currentSectionTitle: string | undefined,
    canResume: boolean
  ): FullDraftJobCheckpointSnapshot {
    return {
      canResume,
      completedSections: checkpoint.sections.length,
      totalSections: checkpoint.blueprint.sections.length,
      wordCount: this.countReadableText(checkpoint.sections.map((section) => section.text).join("\n\n")),
      stage,
      currentSectionTitle,
      continuations: checkpoint.metrics.continuations,
      rewrites: checkpoint.metrics.rewrites,
      continuityChecks: checkpoint.metrics.continuityChecks,
      qualityLog: checkpoint.metrics.qualityLog.slice(-8),
      updatedAt: checkpoint.updatedAt
    };
  }

  private snapshot(job: FullDraftJobSnapshot): FullDraftJobSnapshot {
    return {
      ...job,
      result: job.result ? { ...job.result } : undefined
    };
  }

  private cleanupJobs() {
    const now = Date.now();

    for (const [jobId, job] of this.jobs.entries()) {
      const updatedAt = new Date(job.updatedAt).getTime();

      if ((job.status === "completed" || job.status === "failed") && now - updatedAt > this.completedJobTtlMs) {
        this.jobs.delete(jobId);
        this.jobRuns.delete(jobId);
      }
    }
  }

  private normalizeInput(input: FullDraftInput): FullDraftInput {
    const mode: FullDraftMode = input.mode === "autopilot" ? "autopilot" : "inspiration";
    const inspiration = input.inspiration?.trim() ?? "";

    if (mode === "inspiration" && !inspiration) {
      throw new BadRequestException("有灵感模式需要先输入一句灵感；如果不想输入，请切换到全自动。");
    }

    return {
      mode,
      inspiration,
      targetPlatform: input.targetPlatform?.trim() || "fanqie",
      targetLength: input.targetLength || "auto",
      optionalDirection: input.optionalDirection?.trim(),
      approvedOutline: input.approvedOutline,
      avoid: this.normalizeList(input.avoid)
    };
  }

  private normalizeList(value?: string[] | string) {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }

    return value?.split(/[、,\n]/u).map((item) => item.trim()).filter(Boolean) ?? [];
  }

  private platformLabel(platform?: string) {
    if (!platform || platform === "fanqie") {
      return "番茄";
    }

    return platform;
  }

  private uniqueTags(tags: string[]) {
    return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
  }

  private lengthLabel(targetLength?: string) {
    if (!targetLength || targetLength === "auto") {
      return "自动完整短篇";
    }

    return `${targetLength}字`;
  }

  private summaryForWork(summary: string, marketSummary: string, qualitySummary: string) {
    return [summary, `市场判断：${marketSummary}`, `自检摘要：${qualitySummary}`].filter(Boolean).join("\n\n");
  }

  private countReadableText(text: string) {
    return text.replace(/\s+/g, "").length;
  }

  private async appendGenerationQualityLog(jobId: string, progress: FullDraftGenerationProgress) {
    const entry = {
      createdAt: new Date().toISOString(),
      jobId,
      stage: progress.stage,
      progressLabel: progress.progressLabel,
      completedSections: progress.completedSections,
      totalSections: progress.totalSections,
      currentSectionTitle: progress.currentSectionTitle,
      wordCount: progress.wordCount,
      continuations: progress.checkpoint.metrics.continuations,
      rewrites: progress.checkpoint.metrics.rewrites,
      continuityChecks: progress.checkpoint.metrics.continuityChecks,
      latestQualityLog: progress.checkpoint.metrics.qualityLog.slice(-3)
    };
    const filePath = this.generationQualityLogPath();

    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private generationQualityLogPath() {
    return resolve(this.projectRoot(), process.env.LOG_DIR ?? "logs", "generation-quality.log");
  }

  private jobStateFilePath(jobId: string) {
    return resolve(this.projectRoot(), process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "generation-jobs", `${jobId}.json`);
  }

  private projectRoot() {
    const cwd = process.cwd();

    return cwd.endsWith(`${sep}apps${sep}api`) ? resolve(cwd, "../..") : cwd;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
  }
}
