import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  createAgentTrace,
  createSceneDrafts,
  createScenePrompts,
  createStoryContinuityMemory,
  createStoryOriginalityReport,
  createStoryQualityReport,
  generateStoryPlan,
  works as mockWorks,
  type EditorMarkRecord,
  type EditorVersionRecord,
  type MarkType,
  type PersonalStrategy,
  type ReviewReportResult,
  type StoryPlan,
  type Work,
  type WorkspaceExportResult,
  type WorkStatus,
  type WritingMemory
} from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { cleanTrendGenre } from "../trends/trend-cleaning.js";

type DbWork = {
  id: string;
  title: string;
  cover: string | null;
  status: WorkStatus;
  platform: string;
  genreTags: string[];
  styleTags: string[];
  wordCount: number;
  summary: string;
  fullText: string | null;
  storyPlan: unknown;
  commentFeedback: string | null;
  commentKeywords: string[];
  sourceLabel: string | null;
  sourceDetail: string | null;
  importedAt: Date | null;
  readCount: number;
  subscriptionCount: number;
  revenue: { toNumber?: () => number } | number | string;
  completionRate: number;
  createdAt: Date;
  updatedAt: Date;
};

type DbReview = {
  id: string;
  workId: string;
  readCount: number | null;
  revenue: { toNumber?: () => number } | number | string | null;
  completionRate: number | null;
  rankingChange: string | null;
  recommendationChange: string | null;
  commentFeedback: string | null;
  contentDiagnostics: unknown;
  performanceSummary: string;
  strengths: string[];
  weaknesses: string[];
  nextWritingAdvice: string[];
  strategyLessons: string[];
  createdAt: Date;
};

type DbMark = {
  id: string;
  workId: string;
  index: number;
  type: MarkType | string;
  selectedText: string;
  comment: string | null;
  startOffset: number;
  endOffset: number;
  createdAt: Date;
};

type DbWorkVersion = {
  id: string;
  workId: string;
  markId: string;
  markLabel: string;
  originalText: string;
  newText: string;
  reason: string;
  impactNotes: string[];
  createdAt: Date;
};

type DbWritingMemory = {
  id: string;
  sourceType: string;
  genre: string | null;
  rule: string;
  positiveExample: string | null;
  negativeExample: string | null;
  confidence: number;
  relatedWorkIds: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DbPersonalStrategy = {
  id: string;
  sourceType: string;
  genre: string;
  rule: string;
  evidence: string;
  action: string;
  confidence: number;
  relatedWorkIds: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type EditorExportRecords = {
  marks: EditorMarkRecord[];
  versions: EditorVersionRecord[];
};

type MemoryStrategyExportRecords = {
  memories: WritingMemory[];
  strategies: PersonalStrategy[];
};

export type WorkPerformanceImportRow = {
  title: string;
  platform?: string;
  genre?: string;
  tags?: string[];
  wordCount?: number;
  readCount?: number;
  subscriptionCount?: number;
  revenue?: number;
  completionRate?: number;
  summary?: string;
  commentFeedback?: string;
  commentKeywords?: string[];
  sourceLabel?: string;
  sourceDetail?: string;
  importedAt?: string;
};

export type CreateWorkInput = {
  title: string;
  platform?: string;
  status?: WorkStatus;
  genreTags?: string[] | string;
  styleTags?: string[] | string;
  summary?: string;
  fullText?: string;
  readCount?: number;
  subscriptionCount?: number;
  revenue?: number;
  completionRate?: number;
  commentFeedback?: string;
  commentKeywords?: string[] | string;
};

export type UpdateWorkInput = Partial<CreateWorkInput> & {
  wordCount?: number;
};

export type SavePlanResult = {
  persisted: boolean;
  work: Work;
  message: string;
  initialEditorMarks?: EditorMarkRecord[];
  workspaceExport?: WorkspaceExportResult;
};

type LocalWorksData = {
  works: Work[];
  deletedWorkIds: string[];
};

@Injectable()
export class WorksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryService) private readonly memoryService: MemoryService
  ) {}

  async listWorks(): Promise<Work[]> {
    try {
      await this.ensureSeedWorks();
      const dbWorks = await this.prisma.work.findMany({
        orderBy: { updatedAt: "desc" }
      });

      return Promise.all(dbWorks.map((work) => this.mergeLocalPlan(this.toSharedWork(work as DbWork))));
    } catch {
      return this.listLocalWorks();
    }
  }

  async getWork(id: string): Promise<Work> {
    try {
      await this.ensureSeedWorks();
      const dbWork = await this.prisma.work.findUnique({ where: { id } });

      if (dbWork) {
        return this.mergeLocalPlan(this.toSharedWork(dbWork as DbWork));
      }
    } catch {
      return this.findLocalWork(id);
    }

    return this.findLocalWork(id);
  }

  async createWork(input: CreateWorkInput): Promise<{ persisted: boolean; work: Work; message: string }> {
    const payload = this.normalizeWorkInput(input);
    const fullText = payload.fullText?.trim() || this.fallbackFullText(payload);
    const wordCount = this.countWords(fullText);

    try {
      const work = await this.prisma.work.create({
        data: {
          title: payload.title,
          cover: "/assets/work-cover-1.svg",
          status: payload.status,
          platform: payload.platform,
          genreTags: payload.genreTags,
          styleTags: payload.styleTags,
          wordCount,
          summary: payload.summary,
          fullText,
          readCount: payload.readCount,
          subscriptionCount: payload.subscriptionCount,
          revenue: payload.revenue,
          completionRate: payload.completionRate,
          commentFeedback: payload.commentFeedback,
          commentKeywords: payload.commentKeywords
        }
      });
      const shared = this.toSharedWork(work as DbWork);

      await this.upsertLocalWork({ ...shared, fullText }).catch(() => undefined);

      return {
        persisted: true,
        work: { ...shared, fullText },
        message: "作品已保存到本地数据库。"
      };
    } catch {
      const now = new Date().toISOString().slice(0, 10);
      const work: Work = {
        id: `manual-${Date.now()}`,
        title: payload.title,
        cover: "/assets/work-cover-1.svg",
        status: payload.status,
        platform: payload.platform,
        genreTags: payload.genreTags,
        styleTags: payload.styleTags,
        wordCount,
        summary: payload.summary,
        fullText,
        commentFeedback: payload.commentFeedback,
        commentKeywords: payload.commentKeywords,
        readCount: payload.readCount,
        subscriptionCount: payload.subscriptionCount,
        revenue: payload.revenue,
        completionRate: payload.completionRate,
        createdAt: now,
        updatedAt: now
      };
      const localData = await this.readLocalWorksData();

      await this.writeLocalWorksFile([work, ...localData.works], localData.deletedWorkIds);

      return {
        persisted: false,
        work,
        message: "数据库暂时不可用，作品已保存到本地文件。"
      };
    }
  }

  async updateWork(id: string, input: UpdateWorkInput): Promise<{ persisted: boolean; work: Work; message: string }> {
    const existing = await this.getWork(id);
    const normalized = this.normalizeWorkUpdate(existing, input);

    try {
      const work = await this.prisma.work.update({
        where: { id },
        data: {
          title: normalized.title,
          status: normalized.status,
          platform: normalized.platform,
          genreTags: normalized.genreTags,
          styleTags: normalized.styleTags,
          wordCount: normalized.wordCount,
          summary: normalized.summary,
          fullText: normalized.fullText,
          readCount: normalized.readCount,
          subscriptionCount: normalized.subscriptionCount,
          revenue: normalized.revenue,
          completionRate: normalized.completionRate,
          commentFeedback: normalized.commentFeedback,
          commentKeywords: normalized.commentKeywords
        }
      });
      const shared = {
        ...this.toSharedWork(work as DbWork),
        storyPlan: existing.storyPlan ? { ...existing.storyPlan, draft: normalized.fullText ?? existing.storyPlan.draft } : existing.storyPlan
      };

      await this.upsertLocalWork(shared).catch(() => undefined);

      return {
        persisted: true,
        work: shared,
        message: "作品资料已更新到本地数据库。"
      };
    } catch {
      const localData = await this.readLocalWorksData();
      const nextWork: Work = {
        ...existing,
        ...normalized,
        storyPlan: existing.storyPlan ? { ...existing.storyPlan, draft: normalized.fullText ?? existing.storyPlan.draft } : existing.storyPlan,
        updatedAt: new Date().toISOString().slice(0, 10)
      };

      await this.writeLocalWorksFile([nextWork, ...localData.works.filter((work) => work.id !== id)], localData.deletedWorkIds);

      return {
        persisted: false,
        work: nextWork,
        message: "数据库暂时不可用，作品资料已更新到本地文件。"
      };
    }
  }

  async deleteWork(id: string): Promise<{ persisted: boolean; deleted: boolean; message: string }> {
    const existing = (await this.listWorks()).find((work) => work.id === id);

    try {
      await this.prisma.work.delete({ where: { id } });
      await this.removeLocalWork(id);

      return {
        persisted: true,
        deleted: true,
        message: `《${existing?.title ?? "作品"}》已从本地数据库删除。`
      };
    } catch {
      const deleted = await this.removeLocalWork(id, true);

      return {
        persisted: false,
        deleted: deleted || Boolean(existing),
        message: deleted || existing ? `《${existing?.title ?? "作品"}》已从本地作品库移除。` : "没有找到这部作品。"
      };
    }
  }

  async savePlan(plan: StoryPlan): Promise<SavePlanResult> {
    try {
      const work = await this.prisma.work.create({
        data: {
          title: plan.title,
          cover: "/assets/work-cover-1.svg",
          status: "draft",
          platform: plan.platform,
          genreTags: Array.from(new Set([plan.genre, ...plan.tags.slice(0, 3)])),
          styleTags: plan.tags.filter((tag) => tag !== plan.genre).slice(0, 4),
          wordCount: this.countWords(plan.draft),
          summary: plan.synopsis,
          fullText: plan.draft,
          storyPlan: this.storyPlanToJson(plan),
          readCount: 0,
          subscriptionCount: 0,
          revenue: 0,
          completionRate: 0,
          sceneCards: {
            create: plan.sceneCards.map((scene) => ({
              index: scene.index,
              title: scene.title,
              goal: scene.goal,
              protagonistWant: scene.protagonistWant,
              obstacle: scene.obstacle,
              conflictUpgrade: scene.conflictUpgrade,
              informationGap: scene.informationGap,
              emotion: scene.emotion,
              keyAction: scene.keyAction,
              keyDialogue: scene.keyDialogue,
              hook: scene.hook,
              estimatedWords: scene.estimatedWords,
              relatedCharacters: scene.relatedCharacters,
              relatedForeshadows: scene.relatedForeshadows
            }))
          },
          readerReports: {
            create: {
              openingScore: Math.round(plan.readerReport.openingScore),
              empathyScore: Math.round(plan.readerReport.empathyScore),
              emotionScore: Math.round(plan.readerReport.emotionScore),
              reversalScore: Math.round(plan.readerReport.reversalScore),
              closureScore: Math.round(plan.readerReport.closureScore),
              platformFitScore: Math.round(plan.readerReport.platformFitScore),
              samenessRisk: plan.readerReport.samenessRisk,
              problems: plan.readerReport.problems,
              suggestions: plan.readerReport.suggestions
            }
          }
        }
      });

      const savedWork = {
        ...this.toSharedWork(work as DbWork),
        fullText: plan.draft,
        storyPlan: plan,
        commentKeywords: []
      };

      await this.upsertLocalWork(savedWork).catch(() => undefined);
      const memoryMessage = await this.createReaderReportMemory(savedWork.id, plan);
      const initialEditorMarks = await this.seedInitialEditorMarks(savedWork, plan, true);
      const editorMarksMessage = this.editorMarksMessage(initialEditorMarks);
      const workspaceSync = await this.syncWorkspacePackage(savedWork, plan);

      return {
        persisted: true,
        work: savedWork,
        message: `作品已保存到本地 PostgreSQL。${memoryMessage}${editorMarksMessage}${workspaceSync.message}`,
        initialEditorMarks,
        workspaceExport: workspaceSync.workspaceExport
      };
    } catch {
      const work = this.workFromPlan(plan);
      const localWorks = await this.readLocalWorksFile();
      const nextWorks = [work, ...localWorks.filter((item) => item.id !== work.id)];

      await this.writeLocalWorksFile(nextWorks);
      const memoryMessage = await this.createReaderReportMemory(work.id, plan);
      const initialEditorMarks = await this.seedInitialEditorMarks(work, plan, false);
      const editorMarksMessage = this.editorMarksMessage(initialEditorMarks);
      const workspaceSync = await this.syncWorkspacePackage(work, plan);

      return {
        persisted: false,
        work,
        message: `数据库还没有连接成功，作品已保存到本地文件。${memoryMessage}${editorMarksMessage}${workspaceSync.message}`,
        initialEditorMarks,
        workspaceExport: workspaceSync.workspaceExport
      };
    }
  }

  private async createReaderReportMemory(workId: string, plan: StoryPlan) {
    try {
      const memory = await this.memoryService.createFromStoryPlan({ workId, plan });
      return memory.persisted ? "测试读者建议也已写入写作记忆库。" : "测试读者建议也已写入本地写作记忆文件。";
    } catch {
      return "测试读者建议暂时没有写入写作记忆库，后续复盘仍会继续沉淀。";
    }
  }

  private async seedInitialEditorMarks(work: Work, plan: StoryPlan, persistToDatabase: boolean): Promise<EditorMarkRecord[]> {
    const drafts = this.initialEditorMarkDrafts(work.id, plan);

    if (!drafts.length) {
      return [];
    }

    let marks = drafts;

    if (persistToDatabase) {
      try {
        const createdMarks = await this.prisma.$transaction(
          drafts.map((mark) =>
            this.prisma.mark.create({
              data: {
                id: mark.id,
                workId: mark.workId,
                index: mark.index,
                type: mark.type,
                selectedText: mark.selectedText,
                comment: mark.comment,
                startOffset: mark.startOffset,
                endOffset: mark.endOffset
              }
            })
          )
        );

        marks = createdMarks.map((mark) => this.toEditorMarkExport(mark as DbMark));
      } catch {
        marks = drafts.map((mark) => ({ ...mark, persisted: false }));
      }
    }

    await this.upsertLocalEditorMarks(marks).catch(() => undefined);

    return marks;
  }

  private initialEditorMarkDrafts(workId: string, plan: StoryPlan): EditorMarkRecord[] {
    const issues = plan.readerReport.problems.length ? plan.readerReport.problems : plan.readerReport.suggestions;
    const candidates = issues.slice(0, 3).map((issue, index) => {
      const suggestion = plan.readerReport.suggestions[index] ?? plan.readerReport.suggestions[0] ?? "按测试读者反馈精修这一段。";
      const sceneDraft = this.sceneDraftForIssue(plan, issue, index);
      const selectedText = this.editorSelectionText(sceneDraft?.text ?? plan.draft);
      const rawOffset = plan.draft.indexOf(selectedText);
      const startOffset = rawOffset + 1;

      if (!selectedText.trim() || rawOffset < 0) {
        return null;
      }

      const mark: EditorMarkRecord = {
        id: `initial-mark-${workId}-${index + 1}`,
        workId,
        label: `标记${index + 1}`,
        index: index + 1,
        type: this.markTypeFromReaderIssue(issue),
        selectedText,
        comment: `测试读者：${issue} 修订建议：${suggestion}`,
        startOffset,
        endOffset: startOffset + selectedText.length,
        persisted: false,
        createdAt: new Date().toISOString()
      };

      return mark;
    });

    return candidates.filter((mark): mark is EditorMarkRecord => Boolean(mark));
  }

  private sceneDraftForIssue(plan: StoryPlan, issue: string, index: number) {
    if (!plan.sceneDrafts.length) {
      return null;
    }

    if (/开头|前\s*300|第一场|首场/u.test(issue)) {
      return plan.sceneDrafts[0];
    }

    if (/结尾|收束|口号|释放/u.test(issue)) {
      return plan.sceneDrafts.at(-1) ?? plan.sceneDrafts[0];
    }

    if (/第二|第三|中段|节奏|重复|追查|信息/u.test(issue)) {
      return plan.sceneDrafts[Math.min(2, plan.sceneDrafts.length - 1)];
    }

    if (/反派|人物|脸谱|合理化|角色/u.test(issue)) {
      return plan.sceneDrafts[Math.min(3, plan.sceneDrafts.length - 1)];
    }

    return plan.sceneDrafts[Math.min(index, plan.sceneDrafts.length - 1)];
  }

  private editorSelectionText(text: string) {
    const paragraph = text
      .split(/\n{2,}/u)
      .map((item) => item.trim())
      .find((item) => item.replace(/\s+/g, "").length >= 40);
    const selected = paragraph ?? text.trim();

    return selected.slice(0, 220);
  }

  private markTypeFromReaderIssue(issue: string): MarkType {
    if (/节奏|重复|拖慢|拖沓|中段/u.test(issue)) {
      return "rhythm";
    }

    if (/人物|反派|脸谱|角色/u.test(issue)) {
      return "character";
    }

    if (/情绪|释放|共情/u.test(issue)) {
      return "emotion";
    }

    if (/信息差|伏笔|线索|回收/u.test(issue)) {
      return "information_gap";
    }

    if (/逻辑|合理/u.test(issue)) {
      return "logic";
    }

    return "optimize";
  }

  private editorMarksMessage(marks: EditorMarkRecord[]) {
    return marks.length ? `已把测试读者报告转成 ${marks.length} 个编辑器待改标记。` : "测试读者报告暂时没有生成编辑器标记。";
  }

  private async syncWorkspacePackage(work: Work, plan: StoryPlan): Promise<{ message: string; workspaceExport?: WorkspaceExportResult }> {
    try {
      const exportPlan = this.workspacePlan({ ...work, storyPlan: plan, fullText: plan.draft });
      const [editorRecords, memoryStrategyRecords] = await Promise.all([this.editorRecords(work.id), this.memoryStrategyRecords(work, exportPlan)]);
      const workspaceExport = await this.writeWorkspacePackage(work, exportPlan, null, editorRecords, memoryStrategyRecords);

      return {
        message: `本地工程包也已同步到 ${workspaceExport.path}。`,
        workspaceExport
      };
    } catch {
      return {
        message: "本地工程包暂时没有同步成功，作品本身已经保存。"
      };
    }
  }

  async exportWorkspace(id: string): Promise<WorkspaceExportResult & { preview: StoryPlan }> {
    const work = await this.getWork(id);
    const plan = this.workspacePlan(work);
    const review = await this.latestReview(work.id);
    const editorRecords = await this.editorRecords(work.id);
    const memoryStrategyRecords = await this.memoryStrategyRecords(work, plan);
    const exported = await this.writeWorkspacePackage(work, plan, review, editorRecords, memoryStrategyRecords);

    return {
      ...exported,
      preview: plan
    };
  }

  private async writeWorkspacePackage(
    work: Work,
    plan: StoryPlan,
    review: ReviewReportResult | null = null,
    editorRecords: EditorExportRecords = { marks: [], versions: [] },
    memoryStrategyRecords: MemoryStrategyExportRecords = { memories: [], strategies: [] }
  ): Promise<WorkspaceExportResult> {
    const exportDir = path.join(this.workspaceWorksRoot(), this.safeName(work.title));
    const files = this.workspaceFiles(work, plan, review, editorRecords, memoryStrategyRecords);

    await mkdir(path.join(exportDir, "exports"), { recursive: true });
    await Promise.all(
      Object.entries(files).map(async ([fileName, content]) => {
        const filePath = path.join(exportDir, fileName);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf8");
      })
    );

    return {
      workId: work.id,
      title: work.title,
      path: exportDir,
      files: Object.keys(files),
      persisted: true,
      message: "作品工程目录已导出到本地 workspace/works。"
    };
  }

  private async ensureSeedWorks() {
    const count = await this.prisma.work.count();

    if (count > 0) {
      return;
    }

    await this.prisma.work.createMany({
      data: mockWorks.map((work) => ({
        id: work.id,
        title: work.title,
        cover: work.cover,
        status: work.status,
        platform: work.platform,
        genreTags: work.genreTags,
        styleTags: work.styleTags,
        wordCount: work.wordCount,
        summary: work.summary,
        fullText: work.fullText ?? this.fallbackFullText(work),
        storyPlan: this.storyPlanToJson(work.storyPlan),
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
  }

  private toSharedWork(work: DbWork): Work {
    return {
      id: work.id,
      title: work.title,
      cover: work.cover ?? "/assets/work-cover-1.svg",
      status: work.status,
      platform: work.platform,
      genreTags: work.genreTags,
      styleTags: work.styleTags,
      wordCount: work.wordCount,
      summary: work.summary,
      fullText: work.fullText ?? this.fallbackFullText(work),
      storyPlan: this.toStoryPlan(work.storyPlan, work.fullText ?? undefined),
      commentFeedback: work.commentFeedback ?? undefined,
      commentKeywords: this.normalizeKeywords(work.commentKeywords),
      sourceLabel: work.sourceLabel ?? undefined,
      sourceDetail: work.sourceDetail ?? undefined,
      importedAt: work.importedAt ? this.toDate(work.importedAt) : undefined,
      readCount: work.readCount,
      subscriptionCount: work.subscriptionCount,
      revenue: this.toNumber(work.revenue),
      completionRate: work.completionRate,
      createdAt: this.toDate(work.createdAt),
      updatedAt: this.toDate(work.updatedAt)
    };
  }

  private toNumber(value: DbWork["revenue"]) {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value.toNumber?.() ?? 0;
  }

  private toDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private countWords(text: string) {
    return text.replace(/\s+/g, "").length;
  }

  private workFromPlan(plan: StoryPlan): Work {
    const now = new Date().toISOString().slice(0, 10);

    return {
      id: `local-${Date.now()}`,
      title: plan.title,
      cover: "/assets/work-cover-1.svg",
      status: "draft",
      platform: plan.platform,
      genreTags: Array.from(new Set([plan.genre, ...plan.tags.slice(0, 2)])),
      styleTags: plan.tags.filter((tag) => tag !== plan.genre).slice(0, 4),
      wordCount: this.countWords(plan.draft),
      summary: plan.synopsis,
      fullText: plan.draft,
      storyPlan: plan,
      commentKeywords: [],
      sourceLabel: undefined,
      sourceDetail: undefined,
      importedAt: undefined,
      readCount: 0,
      subscriptionCount: 0,
      revenue: 0,
      completionRate: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  async updateFullText(id: string, fullText: string, storyPlan?: StoryPlan): Promise<{ persisted: boolean; work: Work; message: string }> {
    const wordCount = this.countWords(fullText);
    const normalizedStoryPlan = this.isStoryPlan(storyPlan) ? { ...storyPlan, draft: fullText } : undefined;
    const localExisting = (await this.readLocalWorksFile()).find((work) => work.id === id);

    try {
      const work = await this.prisma.work.update({
        where: { id },
        data: {
          fullText,
          wordCount,
          ...(normalizedStoryPlan ? { storyPlan: this.storyPlanToJson(normalizedStoryPlan) } : {})
        }
      });

      const shared = this.toSharedWork(work as DbWork);
      const savedWork = {
        ...localExisting,
        ...shared,
        fullText,
        wordCount,
        storyPlan: normalizedStoryPlan ?? localExisting?.storyPlan ?? shared.storyPlan,
        commentFeedback: localExisting?.commentFeedback ?? shared.commentFeedback,
        commentKeywords: this.mergeKeywords(shared.commentKeywords, localExisting?.commentKeywords),
        sourceLabel: localExisting?.sourceLabel ?? shared.sourceLabel,
        sourceDetail: localExisting?.sourceDetail ?? shared.sourceDetail,
        importedAt: localExisting?.importedAt ?? shared.importedAt
      };

      await this.upsertLocalWork(savedWork).catch(() => undefined);

      return {
        persisted: true,
        work: savedWork,
        message: "作品正文已保存到本地 PostgreSQL。"
      };
    } catch {
      const localWorks = await this.readLocalWorksFile();
      const existing = localWorks.find((work) => work.id === id) ?? (await this.findLocalWork(id));
      const now = new Date().toISOString().slice(0, 10);
      const nextStoryPlan = normalizedStoryPlan ?? (existing.storyPlan ? { ...existing.storyPlan, draft: fullText } : existing.storyPlan);
      const updatedWork: Work = {
        ...existing,
        fullText,
        storyPlan: nextStoryPlan,
        wordCount,
        updatedAt: now
      };

      await this.writeLocalWorksFile([updatedWork, ...localWorks.filter((work) => work.id !== id)]);

      return {
        persisted: false,
        work: updatedWork,
        message: "数据库还没有连接成功，作品正文已保存到本地文件。"
      };
    }
  }

  async importPerformanceRows(rows: WorkPerformanceImportRow[]): Promise<{ updated: number; created: number; works: Work[] }> {
    const normalizedRows = rows.map((row) => this.normalizePerformanceRow(row)).filter((row): row is WorkPerformanceImportRow => Boolean(row));

    if (normalizedRows.length === 0) {
      return { updated: 0, created: 0, works: [] };
    }

    try {
      const results: Array<{ created: boolean; work: Work }> = [];

      for (const row of normalizedRows) {
        const existing = await this.prisma.work.findFirst({ where: { title: row.title } });
        const payload = this.performancePayload(row);
        const localExisting = existing ? (await this.readLocalWorksFile()).find((work) => work.id === existing.id) : undefined;
        const work = existing
          ? await this.prisma.work.update({
              where: { id: existing.id },
              data: payload
            })
          : await this.prisma.work.create({
              data: {
                title: row.title,
                cover: "/assets/work-cover-1.svg",
                status: "published",
                platform: row.platform ?? "手动导入",
                genreTags: row.genre ? [row.genre] : ["未分类"],
                styleTags: row.tags ?? [],
                wordCount: row.wordCount ?? 0,
                summary: row.summary ?? "来自作品表现 CSV 导入，后续可以在作品详情页补充简介和正文。",
                fullText: row.summary ?? "",
                storyPlan: undefined,
                readCount: row.readCount ?? 0,
                subscriptionCount: row.subscriptionCount ?? 0,
                revenue: row.revenue ?? 0,
                completionRate: row.completionRate ?? 0,
                commentFeedback: row.commentFeedback,
                commentKeywords: row.commentKeywords ?? [],
                sourceLabel: row.sourceLabel,
                sourceDetail: row.sourceDetail,
                importedAt: row.importedAt ? new Date(row.importedAt) : null
              }
            });
        const sharedWork = this.withImportedComments(
          {
            ...(localExisting ?? {}),
            ...this.toSharedWork(work as DbWork)
          },
          row
        );

        if (
          row.commentFeedback ||
          row.commentKeywords?.length ||
          row.sourceLabel ||
          row.sourceDetail ||
          row.importedAt ||
          localExisting?.commentFeedback ||
          localExisting?.commentKeywords?.length
        ) {
          await this.upsertLocalWork(sharedWork).catch(() => undefined);
        }

        results.push({ created: !existing, work: sharedWork });
      }

      return {
        updated: results.filter((result) => !result.created).length,
        created: results.filter((result) => result.created).length,
        works: results.map((result) => result.work)
      };
    } catch {
      const localWorks = await this.readLocalWorksFile();
      const importedWorks: Work[] = [];
      let updated = 0;
      let created = 0;

      for (const [index, row] of normalizedRows.entries()) {
        const currentWorks = [...importedWorks, ...localWorks, ...mockWorks];
        const existing = currentWorks.find((work) => this.sameTitle(work.title, row.title));
        const nextWork = existing
          ? this.updateWorkPerformance(existing, row)
          : this.createImportedWork(row, index);

        if (existing) {
          updated += 1;
        } else {
          created += 1;
        }

        importedWorks.unshift(nextWork);
      }

      await this.writeLocalWorksFile([...importedWorks, ...localWorks]);

      return {
        updated,
        created,
        works: importedWorks
      };
    }
  }

  private async listLocalWorks() {
    const localData = await this.readLocalWorksData();
    const deletedIds = new Set(localData.deletedWorkIds);
    return this.sortWorks(this.uniqueWorks([...localData.works, ...mockWorks.filter((work) => !deletedIds.has(work.id))]));
  }

  private async findLocalWork(id: string) {
    return (await this.listLocalWorks()).find((work) => work.id === id) ?? mockWorks[0];
  }

  private async mergeLocalPlan(work: Work): Promise<Work> {
    const localWork = (await this.readLocalWorksFile()).find((item) => item.id === work.id);

    if (!localWork) {
      return {
        ...work,
        commentKeywords: work.commentKeywords ?? []
      };
    }

    const fullText = work.fullText?.trim() || localWork.fullText;
    const mergedWork: Work = {
      ...work,
      fullText,
      commentFeedback: localWork.commentFeedback ?? work.commentFeedback,
      commentKeywords: localWork.commentKeywords ?? work.commentKeywords ?? [],
      sourceLabel: localWork.sourceLabel ?? work.sourceLabel,
      sourceDetail: localWork.sourceDetail ?? work.sourceDetail,
      importedAt: localWork.importedAt ?? work.importedAt
    };

    const storedPlan = work.storyPlan ?? localWork.storyPlan;

    if (!storedPlan) {
      return mergedWork;
    }

    return {
      ...mergedWork,
      storyPlan: {
        ...storedPlan,
        draft: fullText ?? storedPlan.draft
      }
    };
  }

  private async upsertLocalWork(work: Work) {
    const localData = await this.readLocalWorksData();
    await this.writeLocalWorksFile([work, ...localData.works.filter((item) => item.id !== work.id)], localData.deletedWorkIds.filter((id) => id !== work.id));
  }

  private async removeLocalWork(id: string, rememberDeletion = false) {
    const localData = await this.readLocalWorksData();
    const nextWorks = localData.works.filter((work) => work.id !== id);
    const deletedWorkIds = rememberDeletion ? Array.from(new Set([...localData.deletedWorkIds, id])) : localData.deletedWorkIds;

    await this.writeLocalWorksFile(nextWorks, deletedWorkIds);

    return nextWorks.length !== localData.works.length;
  }

  private async readLocalWorksFile(): Promise<Work[]> {
    return (await this.readLocalWorksData()).works;
  }

  private async readLocalWorksData(): Promise<LocalWorksData> {
    try {
      const parsed = JSON.parse(await readFile(this.localWorksFilePath(), "utf8")) as { works?: Partial<Work>[]; deletedWorkIds?: string[] };
      return {
        works: (parsed.works ?? []).map((work) => this.normalizeLocalWork(work)).filter((work): work is Work => Boolean(work)),
        deletedWorkIds: this.normalizeDeletedWorkIds(parsed.deletedWorkIds)
      };
    } catch {
      return { works: [], deletedWorkIds: [] };
    }
  }

  private async writeLocalWorksFile(works: Work[], deletedWorkIds?: string[]) {
    const filePath = this.localWorksFilePath();
    const nextDeletedWorkIds = deletedWorkIds ?? (await this.readLocalWorksData()).deletedWorkIds;

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          deletedWorkIds: this.normalizeDeletedWorkIds(nextDeletedWorkIds),
          works: this.sortWorks(this.uniqueWorks(works))
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeLocalWork(work: Partial<Work>): Work | null {
    if (!work.title?.trim() || !work.summary?.trim()) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const title = work.title.trim();
    const summary = work.summary.trim();
    const genreTags = this.normalizeGenreTagInput(work.genreTags, ["女性成长"]);
    const styleTags = work.styleTags ?? [];
    const fullText = work.fullText?.trim() || this.fallbackFullText({ title, summary, genreTags, styleTags });
    const storyPlan = this.isStoryPlan(work.storyPlan) ? { ...work.storyPlan, draft: fullText } : undefined;

    return {
      id: work.id ?? `local-${Date.now()}`,
      title,
      cover: work.cover ?? "/assets/work-cover-1.svg",
      status: work.status ?? "draft",
      platform: work.platform ?? "番茄短故事",
      genreTags,
      styleTags,
      wordCount: work.wordCount ?? this.countWords(fullText),
      summary,
      fullText,
      storyPlan,
      commentFeedback: work.commentFeedback?.trim() || undefined,
      commentKeywords: this.normalizeKeywords(work.commentKeywords),
      sourceLabel: work.sourceLabel?.trim() || undefined,
      sourceDetail: work.sourceDetail?.trim() || undefined,
      importedAt: work.importedAt,
      readCount: work.readCount ?? 0,
      subscriptionCount: work.subscriptionCount ?? 0,
      revenue: work.revenue ?? 0,
      completionRate: work.completionRate ?? 0,
      createdAt: work.createdAt ?? today,
      updatedAt: work.updatedAt ?? today
    };
  }

  private normalizeWorkInput(input: CreateWorkInput) {
    const title = input.title?.trim() || "未命名短篇";
    const summary = input.summary?.trim() || "这是一部手动创建的短篇作品，可以在正文编辑器里继续补充梗概和正文。";
    const genreTags = this.normalizeGenreTagInput(input.genreTags, ["未分类"]);
    const styleTags = this.normalizeTagInput(input.styleTags, []);

    return {
      title,
      status: this.normalizeWorkStatus(input.status),
      platform: input.platform?.trim() || "本地创作",
      genreTags,
      styleTags,
      summary,
      fullText: input.fullText?.trim(),
      commentFeedback: input.commentFeedback?.trim() || undefined,
      commentKeywords: this.normalizeTagInput(input.commentKeywords, []),
      readCount: this.positiveNumber(input.readCount) ?? 0,
      subscriptionCount: this.positiveNumber(input.subscriptionCount) ?? 0,
      revenue: this.positiveNumber(input.revenue) ?? 0,
      completionRate: this.clampPercent(input.completionRate) ?? 0
    };
  }

  private normalizeWorkUpdate(existing: Work, input: UpdateWorkInput): Work {
    const fullText = input.fullText === undefined ? existing.fullText : input.fullText.trim();
    const genreTags = input.genreTags === undefined ? existing.genreTags : this.normalizeGenreTagInput(input.genreTags, existing.genreTags);
    const styleTags = input.styleTags === undefined ? existing.styleTags : this.normalizeTagInput(input.styleTags, []);
    const wordCount = input.wordCount ?? (input.fullText === undefined ? existing.wordCount : this.countWords(fullText || ""));

    return {
      ...existing,
      title: input.title?.trim() || existing.title,
      status: input.status ? this.normalizeWorkStatus(input.status) : existing.status,
      platform: input.platform?.trim() || existing.platform,
      genreTags,
      styleTags,
      wordCount,
      summary: input.summary?.trim() || existing.summary,
      fullText,
      commentFeedback: input.commentFeedback === undefined ? existing.commentFeedback : input.commentFeedback.trim() || undefined,
      commentKeywords: input.commentKeywords === undefined ? existing.commentKeywords ?? [] : this.normalizeTagInput(input.commentKeywords, []),
      readCount: this.positiveNumber(input.readCount) ?? existing.readCount,
      subscriptionCount: this.positiveNumber(input.subscriptionCount) ?? existing.subscriptionCount,
      revenue: this.positiveNumber(input.revenue) ?? existing.revenue,
      completionRate: this.clampPercent(input.completionRate) ?? existing.completionRate,
      updatedAt: new Date().toISOString().slice(0, 10)
    };
  }

  private normalizeWorkStatus(status: WorkStatus | undefined): WorkStatus {
    const allowed: WorkStatus[] = ["draft", "published", "serializing", "finished"];
    return status && allowed.includes(status) ? status : "draft";
  }

  private normalizeTagInput(value: string[] | string | undefined, fallback: string[]) {
    const tags = Array.isArray(value) ? value : value?.split(/[、，,;；/|]/);
    const normalized = Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));

    return normalized.length ? normalized.slice(0, 12) : fallback;
  }

  private normalizeGenreTagInput(value: string[] | string | undefined, fallback: string[]) {
    const tags = this.normalizeTagInput(value, fallback);
    const normalized = Array.from(new Set(tags.map((tag) => cleanTrendGenre(tag)).filter(Boolean)));

    return normalized.length ? normalized.slice(0, 12) : fallback;
  }

  private normalizeDeletedWorkIds(ids: string[] | undefined) {
    return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
  }

  private normalizePerformanceRow(row: WorkPerformanceImportRow): WorkPerformanceImportRow | null {
    const title = row.title?.trim();

    if (!title) {
      return null;
    }

    return {
      ...row,
      title,
      platform: row.platform?.trim() || undefined,
      genre: row.genre ? cleanTrendGenre(row.genre) : undefined,
      tags: row.tags?.map((tag) => tag.trim()).filter(Boolean),
      summary: row.summary?.trim() || undefined,
      commentFeedback: row.commentFeedback?.trim() || undefined,
      commentKeywords: this.normalizeKeywords(row.commentKeywords),
      sourceLabel: row.sourceLabel?.trim() || undefined,
      sourceDetail: row.sourceDetail?.trim() || undefined,
      importedAt: row.importedAt,
      wordCount: this.positiveNumber(row.wordCount),
      readCount: this.positiveNumber(row.readCount),
      subscriptionCount: this.positiveNumber(row.subscriptionCount),
      revenue: this.positiveNumber(row.revenue),
      completionRate: this.clampPercent(row.completionRate)
    };
  }

  private performancePayload(row: WorkPerformanceImportRow) {
    return {
      status: "published" as WorkStatus,
      platform: row.platform,
      genreTags: row.genre ? [row.genre] : undefined,
      styleTags: row.tags,
      wordCount: row.wordCount,
      summary: row.summary,
      readCount: row.readCount,
      subscriptionCount: row.subscriptionCount,
      revenue: row.revenue,
      completionRate: row.completionRate,
      commentFeedback: row.commentFeedback,
      commentKeywords: row.commentKeywords?.length ? row.commentKeywords : undefined,
      sourceLabel: row.sourceLabel,
      sourceDetail: row.sourceDetail,
      importedAt: row.importedAt ? new Date(row.importedAt) : undefined
    };
  }

  private updateWorkPerformance(work: Work, row: WorkPerformanceImportRow): Work {
    const now = new Date().toISOString().slice(0, 10);
    const genreTags = row.genre ? [row.genre] : work.genreTags;
    const styleTags = row.tags?.length ? row.tags : work.styleTags;

    return {
      ...work,
      status: "published",
      platform: row.platform ?? work.platform,
      genreTags,
      styleTags,
      wordCount: row.wordCount ?? work.wordCount,
      summary: row.summary ?? work.summary,
      commentFeedback: row.commentFeedback ?? work.commentFeedback,
      commentKeywords: this.mergeKeywords(work.commentKeywords, row.commentKeywords),
      sourceLabel: row.sourceLabel ?? work.sourceLabel,
      sourceDetail: row.sourceDetail ?? work.sourceDetail,
      importedAt: row.importedAt ?? work.importedAt,
      readCount: row.readCount ?? work.readCount,
      subscriptionCount: row.subscriptionCount ?? work.subscriptionCount,
      revenue: row.revenue ?? work.revenue,
      completionRate: row.completionRate ?? work.completionRate,
      updatedAt: now
    };
  }

  private createImportedWork(row: WorkPerformanceImportRow, index: number): Work {
    const now = new Date().toISOString().slice(0, 10);

    return {
      id: `platform-${Date.now()}-${index}`,
      title: row.title,
      cover: "/assets/work-cover-1.svg",
      status: "published",
      platform: row.platform ?? "手动导入",
      genreTags: row.genre ? [row.genre] : ["未分类"],
      styleTags: row.tags ?? [],
      wordCount: row.wordCount ?? 0,
      summary: row.summary ?? "来自作品表现 CSV 导入，后续可以在作品详情页补充简介和正文。",
      fullText: row.summary ?? "",
      commentFeedback: row.commentFeedback,
      commentKeywords: this.normalizeKeywords(row.commentKeywords),
      sourceLabel: row.sourceLabel,
      sourceDetail: row.sourceDetail,
      importedAt: row.importedAt,
      readCount: row.readCount ?? 0,
      subscriptionCount: row.subscriptionCount ?? 0,
      revenue: row.revenue ?? 0,
      completionRate: row.completionRate ?? 0,
      createdAt: now,
      updatedAt: now
    };
  }

  private sameTitle(left: string, right: string) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  private withImportedComments(work: Work, row: WorkPerformanceImportRow): Work {
    return {
      ...work,
      commentFeedback: row.commentFeedback ?? work.commentFeedback,
      commentKeywords: this.mergeKeywords(work.commentKeywords, row.commentKeywords),
      sourceLabel: row.sourceLabel ?? work.sourceLabel,
      sourceDetail: row.sourceDetail ?? work.sourceDetail,
      importedAt: row.importedAt ?? work.importedAt
    };
  }

  private normalizeKeywords(keywords: string[] | undefined) {
    return Array.from(
      new Set(
        (keywords ?? [])
          .flatMap((keyword) => keyword.split(/[、，,;；/|]/))
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      )
    ).slice(0, 12);
  }

  private mergeKeywords(left: string[] | undefined, right: string[] | undefined) {
    return this.normalizeKeywords([...(left ?? []), ...(right ?? [])]);
  }

  private positiveNumber(value: number | undefined) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  private clampPercent(value: number | undefined) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }

    return Math.max(0, Math.min(100, value));
  }

  private isStoryPlan(value: unknown): value is StoryPlan {
    if (!value || typeof value !== "object") {
      return false;
    }

    const plan = value as Partial<StoryPlan>;

    return Boolean(
      plan.id &&
        plan.title &&
        plan.platform &&
        plan.genre &&
        plan.topicJudgement &&
        Array.isArray(plan.characters) &&
        Array.isArray(plan.sceneCards) &&
        Array.isArray(plan.emotionalCurve) &&
        Array.isArray(plan.conflictLadder) &&
        plan.informationGap &&
        plan.readerReport &&
        typeof plan.draft === "string"
    );
  }

  private toStoryPlan(value: unknown, fullText?: string): StoryPlan | undefined {
    if (!this.isStoryPlan(value)) {
      return undefined;
    }

    return {
      ...value,
      draft: fullText?.trim() || value.draft
    };
  }

  private storyPlanToJson(plan: unknown): Prisma.InputJsonValue | undefined {
    if (!this.isStoryPlan(plan)) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(plan)) as Prisma.InputJsonValue;
  }

  private uniqueWorks(works: Work[]) {
    const seenIds = new Set<string>();
    const seenImportedTitles = new Set<string>();

    return works.filter((work) => {
      if (seenIds.has(work.id)) {
        return false;
      }

      const importedTitleKey = this.importedWorkTitleKey(work);

      if (importedTitleKey && seenImportedTitles.has(importedTitleKey)) {
        return false;
      }

      seenIds.add(work.id);
      if (importedTitleKey) {
        seenImportedTitles.add(importedTitleKey);
      }
      return true;
    });
  }

  private importedWorkTitleKey(work: Work) {
    if (!work.sourceLabel && !work.sourceDetail && work.status !== "published") {
      return "";
    }

    return work.title.trim().toLowerCase();
  }

  private sortWorks(works: Work[]) {
    return [...works].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private fallbackFullText(work: Pick<Work, "title" | "summary" | "genreTags" | "styleTags">) {
    const tags = [...work.genreTags, ...work.styleTags].filter(Boolean).join("、") || "短篇小说";

    return `${work.summary}

题名：《${work.title}》

题材方向：${tags}

这是当前作品的正文草稿占位。你可以在正文编辑器里继续扩写、标记问题片段，并让 Agent 针对某一段做局部改稿。`;
  }

  private workspacePlan(work: Work): StoryPlan {
    const generatedPlan = work.storyPlan ?? generateStoryPlan({ inspiration: work.summary, genre: work.genreTags[0] });
    const draft = work.fullText?.trim() || generatedPlan.draft;
    const storedSceneDrafts = (generatedPlan as StoryPlan & { sceneDrafts?: StoryPlan["sceneDrafts"] }).sceneDrafts;
    const scenePrompts =
      generatedPlan.scenePrompts?.length > 0
        ? generatedPlan.scenePrompts
        : createScenePrompts(generatedPlan.sceneCards, {
            platform: work.platform || generatedPlan.platform,
            genre: work.genreTags[0] || generatedPlan.genre,
            style: generatedPlan.tags?.[3],
            selectedTopic: generatedPlan.selectedTopic,
            characters: generatedPlan.characters,
            informationGap: generatedPlan.informationGap
          });
    const sceneDrafts =
      storedSceneDrafts?.length > 0
        ? storedSceneDrafts
        : createSceneDrafts(generatedPlan.sceneCards, generatedPlan.tags?.[3] ?? "现实质感", generatedPlan.memoryUsed?.[0] ?? "");
    const qualityReport =
      generatedPlan.qualityReport ??
      createStoryQualityReport({
        ...generatedPlan,
        sceneDrafts
      });
    const originalityReport =
      generatedPlan.originalityReport ??
      createStoryOriginalityReport({
        ...generatedPlan,
        scenePrompts
      });
    const continuityMemory =
      generatedPlan.continuityMemory ??
      createStoryContinuityMemory({
        ...generatedPlan,
        sceneDrafts
      });

    return {
      ...generatedPlan,
      title: work.title || generatedPlan.title,
      platform: work.platform || generatedPlan.platform,
      genre: work.genreTags[0] || generatedPlan.genre,
      synopsis: work.summary || generatedPlan.synopsis,
      scenePrompts,
      sceneDrafts,
      draft,
      qualityReport,
      originalityReport,
      continuityMemory,
      agentTrace:
        generatedPlan.agentTrace ??
        createAgentTrace({
          source: generatedPlan.source,
          platform: work.platform || generatedPlan.platform,
          genre: work.genreTags[0] || generatedPlan.genre,
          topicCards: generatedPlan.topicCards,
          selectedTopic: generatedPlan.selectedTopic,
          emotionalCurve: generatedPlan.emotionalCurve,
          conflictLadder: generatedPlan.conflictLadder,
          informationGap: generatedPlan.informationGap,
          characters: generatedPlan.characters,
          sceneCards: generatedPlan.sceneCards,
          scenePrompts,
          sceneDrafts,
          readerReport: generatedPlan.readerReport,
          memoryUsed: generatedPlan.memoryUsed
        })
    };
  }

  private workspaceFiles(
    work: Work,
    plan: StoryPlan,
    review?: ReviewReportResult | null,
    editorRecords: EditorExportRecords = { marks: [], versions: [] },
    memoryStrategyRecords: MemoryStrategyExportRecords = { memories: [], strategies: [] }
  ) {
    return {
      "先看我.md": this.workspaceGuideMarkdown(work, plan, review, editorRecords, memoryStrategyRecords),
      "story.md": `# ${work.title}

- 平台：${work.platform}
- 状态：${work.status}
- 字数：${work.wordCount}
- 标签：${[...work.genreTags, ...work.styleTags].join("、")}

## 简介

${work.summary}
`,
      "outline.md": `# 大纲

## 选题判断

${plan.topicJudgement}

## 可发布简介

${plan.synopsis}
`,
      "characters.md": `# 人物卡

${plan.characters
  .map(
    (character) => `## ${character.name}

- 角色：${character.role}
- 性格：${character.personality}
- 背景：${character.background}
- 欲望：${character.desire}
- 恐惧：${character.fear}
- 关系备注：${character.relationNotes}
`
  )
  .join("\n")}`,
      "emotional_curve.md": `# 情绪曲线

${plan.emotionalCurve
  .map(
    (beat) => `## ${beat.stage}

- 情绪：${beat.emotion}
- 对应场景：${beat.scene}
- 读者预期：${beat.readerExpectation}
- 释放点：${beat.releasePoint}
`
  )
  .join("\n")}`,
      "conflict_ladder.md": `# 冲突阶梯

${plan.conflictLadder
  .map(
    (step) => `## 第 ${step.level} 级

- 事件：${step.event}
- 冲突双方：${step.parties}
- 代价：${step.cost}
- 作用：${step.purpose}
`
  )
  .join("\n")}`,
      "information_gap.md": `# 信息差设计

- 读者知道：${plan.informationGap.readerKnows}
- 主角知道：${plan.informationGap.protagonistKnows}
- 反派不知道：${plan.informationGap.antagonistMisses}
- 揭示时机：${plan.informationGap.revealTiming}
- 爽点/反转：${plan.informationGap.payoff}
`,
      "scene_cards.md": `# 场景卡

${plan.sceneCards
  .map(
    (scene) => `## 场景 ${scene.index}：${scene.title}

- 场景目标：${scene.goal}
- 主角想要：${scene.protagonistWant}
- 阻碍：${scene.obstacle}
- 冲突升级：${scene.conflictUpgrade}
- 信息差：${scene.informationGap}
- 情绪：${scene.emotion}
- 关键动作：${scene.keyAction}
- 关键对白：${scene.keyDialogue}
- 结尾钩子：${scene.hook}
- 预计字数：${scene.estimatedWords}
`
  )
  .join("\n")}`,
      "scene_prompts.md": `# 场景写作提示词

${plan.scenePrompts.map((prompt) => this.scenePromptMarkdown(prompt)).join("\n")}`,
      ...Object.fromEntries(plan.scenePrompts.map((prompt) => [`prompts/scene-${String(prompt.index).padStart(2, "0")}.md`, this.scenePromptMarkdown(prompt)])),
      "draft.md": `# 正文草稿

${plan.draft}
`,
      "scene_drafts.md": `# 分场正文

${plan.sceneDrafts.map((scene) => this.sceneDraftMarkdown(scene)).join("\n")}
`,
      ...Object.fromEntries(plan.sceneDrafts.map((scene) => [`drafts/scene-${String(scene.index).padStart(2, "0")}.md`, this.sceneDraftMarkdown(scene)])),
      "source_plan.json": `${JSON.stringify(plan, null, 2)}
`,
      "agent_trace.md": `# Agent 调度轨迹

${this.agentTraceMarkdown(plan)}
`,
      "work_memory.md": this.workMemoryMarkdown(plan),
      "marks.md": this.editorMarksMarkdown(work, editorRecords),
      "editor_history.json": `${JSON.stringify(editorRecords, null, 2)}
`,
      "reader_report.md": `# 测试读者报告

- 开头抓人程度：${plan.readerReport.openingScore}
- 人物代入感：${plan.readerReport.empathyScore}
- 情绪推进：${plan.readerReport.emotionScore}
- 反转有效性：${plan.readerReport.reversalScore}
- 短篇闭环完整度：${plan.readerReport.closureScore}
- 平台适配度：${plan.readerReport.platformFitScore}
- 同质化风险：${plan.readerReport.samenessRisk}

## 主要问题

${plan.readerReport.problems.map((item) => `- ${item}`).join("\n")}
`,
      "quality_report.md": this.qualityReportMarkdown(plan),
      "originality_report.md": this.originalityReportMarkdown(plan),
      "revision_suggestions.md": `# 修订建议

## 优先修订

${plan.readerReport.suggestions.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## 分场修改清单

${plan.sceneDrafts
  .map(
    (scene) => `### 场景 ${scene.index}：${scene.title}

- 当前评分：${scene.qualityScore}
- 修改重点：${scene.revisionFocus}
`
  )
  .join("\n")}
`,
      "review.md": this.reviewMarkdown(work, review),
      "writing_memory.md": this.writingMemoryMarkdown(work, plan, memoryStrategyRecords.memories),
      "strategy.md": this.personalStrategyMarkdown(work, plan, memoryStrategyRecords.strategies),
      "memory_context.json": `${JSON.stringify(memoryStrategyRecords, null, 2)}
`
    };
  }

  private workspaceGuideMarkdown(
    work: Work,
    plan: StoryPlan,
    review?: ReviewReportResult | null,
    editorRecords: EditorExportRecords = { marks: [], versions: [] },
    memoryStrategyRecords: MemoryStrategyExportRecords = { memories: [], strategies: [] }
  ) {
    const genreTags = work.genreTags.length ? work.genreTags.join("、") : plan.genre;
    const styleTags = work.styleTags.length ? work.styleTags.join("、") : "暂无";
    const reviewState = review ? "已有发布后复盘，可看 review.md。" : "暂时还没有发布后复盘，后续可以在页面里补。";
    const editorState = editorRecords.marks.length
      ? `已有 ${editorRecords.marks.length} 条正文标记和 ${editorRecords.versions.length} 条改稿记录，可看 marks.md 和 editor_history.json。`
      : "暂时没有正文标记，后续在编辑器里标记后会同步到 marks.md。";
    const memoryState = memoryStrategyRecords.memories.length || memoryStrategyRecords.strategies.length
      ? `本包带入了 ${memoryStrategyRecords.memories.length} 条写作记忆和 ${memoryStrategyRecords.strategies.length} 条个人策略。`
      : "本包暂时没有带入额外写作记忆或个人策略。";

    return `# 先看我：${work.title}

这是自动保存到本机的作品工程包。你可以把它理解成这篇短篇小说的“项目文件夹”：既有成稿，也有 AI 写作过程、分场提示、测试读者反馈和后续修改方向。

## 推荐打开顺序

1. story.md：先看作品标题、平台、标签和简介。
2. outline.md：看选题判断和可发布简介。
3. scene_cards.md：看每一场戏承担什么任务。
4. scene_prompts.md：看每一场戏是按什么提示词写出来的。
5. draft.md：看合并后的正文草稿。
6. scene_drafts.md：看按场景拆开的正文，适合逐场改。
7. reader_report.md：看测试读者报告，判断开头、人物、情绪和反转是否够强。
8. quality_report.md 和 originality_report.md：看质量评分、原创性风险和需要加强的地方。
9. revision_suggestions.md：最后看修改清单，决定下一轮怎么改。

## 本包概况

- 平台：${work.platform}
- 类型：${genreTags}
- 风格：${styleTags}
- 主题卡：${plan.topicCards.length} 张
- 人物卡：${plan.characters.length} 张
- 场景卡：${plan.sceneCards.length} 张
- 场景提示词：${plan.scenePrompts.length} 条
- 分场草稿：${plan.sceneDrafts.length} 段
- ${editorState}
- ${memoryState}
- ${reviewState}

## 文件怎么理解

- prompts/：每一场戏单独的写作提示词，方便你复制给 AI 继续扩写。
- drafts/：每一场戏单独的正文草稿，方便你逐场重写。
- agent_trace.md：记录主控 Agent 怎么调度各个子 Agent。
- work_memory.md、writing_memory.md、strategy.md：记录这篇作品沉淀下来的写作经验。
- source_plan.json、memory_context.json、editor_history.json：给系统读取的结构化数据，平时只看不用改。

## 小提醒

所有文件都保存在你的本机目录里，不包含 API Key。普通修改建议优先改 draft.md、scene_drafts.md 或在网页编辑器里改；JSON 文件更像系统存档，改错后页面可能读不回来。
`;
  }

  private async editorRecords(workId: string): Promise<EditorExportRecords> {
    const localRecords = await this.localEditorRecords(workId);
    const records: EditorExportRecords = {
      marks: localRecords.marks,
      versions: localRecords.versions
    };

    try {
      const [dbMarks, dbVersions] = await Promise.all([
        this.prisma.mark.findMany({
          where: { workId },
          orderBy: { index: "asc" }
        }),
        this.prisma.workVersion.findMany({
          where: { workId },
          orderBy: { createdAt: "desc" }
        })
      ]);

      records.marks = this.uniqueEditorMarks([...records.marks, ...dbMarks.map((mark) => this.toEditorMarkExport(mark as DbMark))]);
      records.versions = this.uniqueEditorVersions([
        ...records.versions,
        ...dbVersions.map((version) => this.toEditorVersionExport(version as DbWorkVersion))
      ]);
    } catch {
      return records;
    }

    return {
      marks: records.marks.sort((a, b) => a.index - b.index || a.startOffset - b.startOffset),
      versions: records.versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }

  private async localEditorRecords(workId: string): Promise<EditorExportRecords> {
    try {
      const parsed = JSON.parse(await readFile(this.localEditorFilePath(), "utf8")) as {
        marks?: Partial<EditorMarkRecord>[];
        versions?: Partial<EditorVersionRecord>[];
      };

      return {
        marks: (parsed.marks ?? [])
          .map((mark) => this.normalizeEditorMark(mark))
          .filter((mark): mark is EditorMarkRecord => Boolean(mark))
          .filter((mark) => mark.workId === workId)
          .sort((a, b) => a.index - b.index || a.startOffset - b.startOffset),
        versions: (parsed.versions ?? [])
          .map((version) => this.normalizeEditorVersion(version))
          .filter((version): version is EditorVersionRecord => Boolean(version))
          .filter((version) => version.workId === workId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      };
    } catch {
      return { marks: [], versions: [] };
    }
  }

  private async allLocalEditorRecords(): Promise<EditorExportRecords> {
    try {
      const parsed = JSON.parse(await readFile(this.localEditorFilePath(), "utf8")) as {
        marks?: Partial<EditorMarkRecord>[];
        versions?: Partial<EditorVersionRecord>[];
      };

      return {
        marks: (parsed.marks ?? []).map((mark) => this.normalizeEditorMark(mark)).filter((mark): mark is EditorMarkRecord => Boolean(mark)),
        versions: (parsed.versions ?? [])
          .map((version) => this.normalizeEditorVersion(version))
          .filter((version): version is EditorVersionRecord => Boolean(version))
      };
    } catch {
      return { marks: [], versions: [] };
    }
  }

  private async upsertLocalEditorMarks(marks: EditorMarkRecord[]) {
    const localRecords = await this.allLocalEditorRecords();
    const nextRecords: EditorExportRecords = {
      marks: this.uniqueEditorMarks([...marks, ...localRecords.marks]).sort((a, b) => a.workId.localeCompare(b.workId) || a.index - b.index),
      versions: this.uniqueEditorVersions(localRecords.versions).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };

    await this.writeLocalEditorRecords(nextRecords);
  }

  private async writeLocalEditorRecords(records: EditorExportRecords) {
    const filePath = this.localEditorFilePath();

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          marks: records.marks,
          versions: records.versions
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeEditorMark(mark: Partial<EditorMarkRecord>): EditorMarkRecord | null {
    if (!mark.workId || !mark.selectedText) {
      return null;
    }

    const index = mark.index ?? 1;

    return {
      id: mark.id ?? `mark-${Date.now()}`,
      workId: mark.workId,
      label: mark.label ?? `标记${index}`,
      index,
      type: this.normalizeMarkType(mark.type),
      selectedText: mark.selectedText,
      comment: mark.comment ?? "",
      startOffset: mark.startOffset ?? 0,
      endOffset: mark.endOffset ?? 0,
      persisted: mark.persisted ?? false,
      createdAt: mark.createdAt ?? new Date().toISOString()
    };
  }

  private normalizeEditorVersion(version: Partial<EditorVersionRecord>): EditorVersionRecord | null {
    if (!version.workId || !version.originalText || !version.newText) {
      return null;
    }

    return {
      id: version.id ?? `version-${Date.now()}`,
      workId: version.workId,
      markId: version.markId ?? "",
      markLabel: version.markLabel ?? "标记",
      originalText: version.originalText,
      newText: version.newText,
      reason: version.reason ?? "应用了一次局部改稿。",
      impactNotes: version.impactNotes ?? [],
      persisted: version.persisted ?? false,
      createdAt: version.createdAt ?? new Date().toISOString()
    };
  }

  private toEditorMarkExport(mark: DbMark): EditorMarkRecord {
    return {
      id: mark.id,
      workId: mark.workId,
      label: `标记${mark.index}`,
      index: mark.index,
      type: this.normalizeMarkType(mark.type as MarkType),
      selectedText: mark.selectedText,
      comment: mark.comment ?? "",
      startOffset: mark.startOffset,
      endOffset: mark.endOffset,
      persisted: true,
      createdAt: mark.createdAt.toISOString()
    };
  }

  private toEditorVersionExport(version: DbWorkVersion): EditorVersionRecord {
    return {
      id: version.id,
      workId: version.workId,
      markId: version.markId,
      markLabel: version.markLabel,
      originalText: version.originalText,
      newText: version.newText,
      reason: version.reason,
      impactNotes: version.impactNotes,
      persisted: true,
      createdAt: version.createdAt.toISOString()
    };
  }

  private editorMarksMarkdown(work: Work, records: EditorExportRecords) {
    const marksMarkdown = records.marks.length
      ? records.marks
          .map(
            (mark) => `### ${mark.label}：${this.markTypeLabel(mark.type)}

- 位置：${mark.startOffset}-${mark.endOffset}
- 保存状态：${mark.persisted ? "已保存" : "临时"}
- 创建时间：${mark.createdAt}
- 批注：${mark.comment || "未填写"}

#### 标记原文

${this.markdownQuote(mark.selectedText)}
`
          )
          .join("\n")
      : "- 暂无待处理标记。";
    const versionsMarkdown = records.versions.length
      ? records.versions
          .map(
            (version) => `### ${version.markLabel}｜${version.createdAt}

- 保存状态：${version.persisted ? "已保存" : "临时"}
- 改稿原因：${version.reason}

#### 原文

${this.markdownQuote(version.originalText)}

#### 新文

${this.markdownQuote(version.newText)}

#### 影响说明

${this.markdownList(version.impactNotes)}
`
          )
          .join("\n")
      : "- 暂无已应用的改稿版本。";

    return `# 标记改稿记录

- 作品：${work.title}
- 待处理标记：${records.marks.length}
- 已应用改稿版本：${records.versions.length}

## 待处理标记

${marksMarkdown}

## 已应用改稿版本

${versionsMarkdown}
`;
  }

  private uniqueEditorMarks(marks: EditorMarkRecord[]) {
    const seen = new Set<string>();

    return marks.filter((mark) => {
      if (seen.has(mark.id)) {
        return false;
      }

      seen.add(mark.id);
      return true;
    });
  }

  private uniqueEditorVersions(versions: EditorVersionRecord[]) {
    const seen = new Set<string>();

    return versions.filter((version) => {
      if (seen.has(version.id)) {
        return false;
      }

      seen.add(version.id);
      return true;
    });
  }

  private async memoryStrategyRecords(work: Work, plan: StoryPlan): Promise<MemoryStrategyExportRecords> {
    const localRecords = await this.localMemoryStrategyRecords();
    const records: MemoryStrategyExportRecords = {
      memories: localRecords.memories,
      strategies: localRecords.strategies
    };

    try {
      const [dbMemories, dbStrategies] = await Promise.all([
        this.prisma.writingMemory.findMany({
          orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }]
        }),
        this.prisma.personalStrategy.findMany({
          orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }]
        })
      ]);

      records.memories = this.uniqueWritingMemories([...records.memories, ...dbMemories.map((memory) => this.toWritingMemoryExport(memory as DbWritingMemory))]);
      records.strategies = this.uniquePersonalStrategies([
        ...records.strategies,
        ...dbStrategies.map((strategy) => this.toPersonalStrategyExport(strategy as DbPersonalStrategy))
      ]);
    } catch {
      return this.rankMemoryStrategyRecords(work, plan, records);
    }

    return this.rankMemoryStrategyRecords(work, plan, records);
  }

  private async localMemoryStrategyRecords(): Promise<MemoryStrategyExportRecords> {
    const [memories, strategies] = await Promise.all([this.localWritingMemories(), this.localPersonalStrategies()]);
    return { memories, strategies };
  }

  private async localWritingMemories(): Promise<WritingMemory[]> {
    try {
      const parsed = JSON.parse(await readFile(this.localMemoryFilePath(), "utf8")) as { memories?: Partial<WritingMemory>[] };

      return (parsed.memories ?? [])
        .map((memory) => this.normalizeWritingMemoryExport(memory))
        .filter((memory): memory is WritingMemory => Boolean(memory));
    } catch {
      return [];
    }
  }

  private async localPersonalStrategies(): Promise<PersonalStrategy[]> {
    try {
      const parsed = JSON.parse(await readFile(this.localStrategiesFilePath(), "utf8")) as { strategies?: Partial<PersonalStrategy>[] };

      return (parsed.strategies ?? [])
        .map((strategy) => this.normalizePersonalStrategyExport(strategy))
        .filter((strategy): strategy is PersonalStrategy => Boolean(strategy));
    } catch {
      return [];
    }
  }

  private rankMemoryStrategyRecords(work: Work, plan: StoryPlan, records: MemoryStrategyExportRecords): MemoryStrategyExportRecords {
    return {
      memories: this.uniqueWritingMemories(records.memories)
        .filter((memory) => this.shouldExportMemory(memory, work, plan))
        .sort((a, b) => this.memoryScore(b, work, plan) - this.memoryScore(a, work, plan))
        .slice(0, 16),
      strategies: this.uniquePersonalStrategies(records.strategies)
        .filter((strategy) => this.shouldExportStrategy(strategy, work, plan))
        .sort((a, b) => this.strategyScore(b, work, plan) - this.strategyScore(a, work, plan))
        .slice(0, 16)
    };
  }

  private shouldExportMemory(memory: WritingMemory, work: Work, plan: StoryPlan) {
    return memory.relatedWorkIds.includes(work.id) || this.genreMatches(memory.genre, work, plan) || memory.genre === "通用";
  }

  private shouldExportStrategy(strategy: PersonalStrategy, work: Work, plan: StoryPlan) {
    return strategy.relatedWorkIds.includes(work.id) || this.genreMatches(strategy.genre, work, plan) || strategy.genre === "通用";
  }

  private memoryScore(memory: WritingMemory, work: Work, plan: StoryPlan) {
    return (
      (memory.enabled ? 1000 : 0) +
      (memory.relatedWorkIds.includes(work.id) ? 500 : 0) +
      (this.genreMatches(memory.genre, work, plan) ? 180 : 0) +
      (memory.genre === "通用" ? 40 : 0) +
      memory.confidence +
      this.dateScore(memory.updatedAt)
    );
  }

  private strategyScore(strategy: PersonalStrategy, work: Work, plan: StoryPlan) {
    return (
      (strategy.enabled ? 1000 : 0) +
      (strategy.relatedWorkIds.includes(work.id) ? 500 : 0) +
      (this.genreMatches(strategy.genre, work, plan) ? 180 : 0) +
      (strategy.genre === "通用" ? 40 : 0) +
      strategy.confidence +
      this.dateScore(strategy.updatedAt)
    );
  }

  private genreMatches(genre: string | undefined, work: Work, plan: StoryPlan) {
    const normalized = genre?.trim();

    if (!normalized) {
      return false;
    }

    return [plan.genre, ...work.genreTags].some((item) => item === normalized);
  }

  private dateScore(value: string) {
    const time = Date.parse(value);

    if (Number.isNaN(time)) {
      return 0;
    }

    return Math.min(99, Math.floor(time / 86_400_000) % 100);
  }

  private normalizeWritingMemoryExport(memory: Partial<WritingMemory>): WritingMemory | null {
    if (!memory.rule?.trim()) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    return {
      id: memory.id ?? `memory-${Date.now()}`,
      sourceType: this.normalizeMemorySourceType(memory.sourceType),
      genre: memory.genre ?? "通用",
      rule: memory.rule.trim(),
      positiveExample: memory.positiveExample ?? "",
      negativeExample: memory.negativeExample ?? "",
      confidence: this.confidence(memory.confidence),
      relatedWorkIds: memory.relatedWorkIds ?? [],
      enabled: memory.enabled ?? true,
      createdAt: memory.createdAt ?? today,
      updatedAt: memory.updatedAt ?? today
    };
  }

  private normalizePersonalStrategyExport(strategy: Partial<PersonalStrategy>): PersonalStrategy | null {
    if (!strategy.rule?.trim()) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    return {
      id: strategy.id ?? `strategy-${Date.now()}`,
      sourceType: this.normalizeStrategySourceType(strategy.sourceType),
      genre: strategy.genre ?? "通用",
      rule: strategy.rule.trim(),
      evidence: strategy.evidence ?? "",
      action: strategy.action ?? "写作前先检查这条策略是否适用。",
      confidence: this.confidence(strategy.confidence),
      relatedWorkIds: strategy.relatedWorkIds ?? [],
      enabled: strategy.enabled ?? true,
      createdAt: strategy.createdAt ?? today,
      updatedAt: strategy.updatedAt ?? today
    };
  }

  private toWritingMemoryExport(memory: DbWritingMemory): WritingMemory {
    return {
      id: memory.id,
      sourceType: this.normalizeMemorySourceType(memory.sourceType as WritingMemory["sourceType"]),
      genre: memory.genre ?? "通用",
      rule: memory.rule,
      positiveExample: memory.positiveExample ?? "",
      negativeExample: memory.negativeExample ?? "",
      confidence: memory.confidence,
      relatedWorkIds: memory.relatedWorkIds,
      enabled: memory.enabled,
      createdAt: memory.createdAt.toISOString().slice(0, 10),
      updatedAt: memory.updatedAt.toISOString().slice(0, 10)
    };
  }

  private toPersonalStrategyExport(strategy: DbPersonalStrategy): PersonalStrategy {
    return {
      id: strategy.id,
      sourceType: this.normalizeStrategySourceType(strategy.sourceType as PersonalStrategy["sourceType"]),
      genre: strategy.genre,
      rule: strategy.rule,
      evidence: strategy.evidence,
      action: strategy.action,
      confidence: strategy.confidence,
      relatedWorkIds: strategy.relatedWorkIds,
      enabled: strategy.enabled,
      createdAt: strategy.createdAt.toISOString().slice(0, 10),
      updatedAt: strategy.updatedAt.toISOString().slice(0, 10)
    };
  }

  private uniqueWritingMemories(memories: WritingMemory[]) {
    const seen = new Set<string>();

    return memories.filter((memory) => {
      const key = `${memory.id}:${memory.genre}:${memory.rule}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private uniquePersonalStrategies(strategies: PersonalStrategy[]) {
    const seen = new Set<string>();

    return strategies.filter((strategy) => {
      const key = `${strategy.id}:${strategy.genre}:${strategy.rule}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private async latestReview(workId: string): Promise<ReviewReportResult | null> {
    const candidates: ReviewReportResult[] = [];
    const localReview = await this.latestLocalReview(workId);

    if (localReview) {
      candidates.push(localReview);
    }

    try {
      const review = await this.prisma.reviewReport.findFirst({
        where: { workId },
        orderBy: { createdAt: "desc" }
      });

      if (review) {
        candidates.push(this.toReviewExport(review as DbReview, true));
      }
    } catch {
      return localReview;
    }

    return (
      candidates.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || this.reviewDetailScore(b) - this.reviewDetailScore(a)
      )[0] ?? null
    );
  }

  private async latestLocalReview(workId: string): Promise<ReviewReportResult | null> {
    try {
      const parsed = JSON.parse(await readFile(this.localReviewsFilePath(), "utf8")) as { reviews?: Partial<ReviewReportResult>[] };
      const reviews = (parsed.reviews ?? [])
        .map((review) => this.normalizeReviewExport(review))
        .filter((review): review is ReviewReportResult => Boolean(review))
        .filter((review) => review.workId === workId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return reviews[0] ?? null;
    } catch {
      return null;
    }
  }

  private normalizeReviewExport(review: Partial<ReviewReportResult>): ReviewReportResult | null {
    if (!review.workId || !review.performanceSummary) {
      return null;
    }

    return {
      id: review.id ?? `review-${Date.now()}`,
      workId: review.workId,
      performanceMetrics: review.performanceMetrics,
      contentDiagnostics: review.contentDiagnostics,
      performanceSummary: review.performanceSummary,
      strengths: review.strengths ?? [],
      weaknesses: review.weaknesses ?? [],
      nextWritingAdvice: review.nextWritingAdvice ?? [],
      strategyLessons: review.strategyLessons ?? [],
      persisted: review.persisted ?? true,
      createdAt: review.createdAt ?? new Date().toISOString()
    };
  }

  private toReviewExport(review: DbReview, persisted: boolean): ReviewReportResult {
    return {
      id: review.id,
      workId: review.workId,
      performanceMetrics: this.toReviewPerformanceMetrics(review),
      contentDiagnostics: this.toReviewContentDiagnostics(review.contentDiagnostics),
      performanceSummary: review.performanceSummary,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      nextWritingAdvice: review.nextWritingAdvice,
      strategyLessons: review.strategyLessons,
      persisted,
      createdAt: review.createdAt.toISOString()
    };
  }

  private toReviewPerformanceMetrics(review: DbReview): ReviewReportResult["performanceMetrics"] | undefined {
    const hasStoredMetrics =
      review.readCount !== null ||
      review.revenue !== null ||
      review.completionRate !== null ||
      Boolean(review.rankingChange) ||
      Boolean(review.recommendationChange) ||
      Boolean(review.commentFeedback);

    if (!hasStoredMetrics) {
      return undefined;
    }

    return {
      readCount: review.readCount ?? 0,
      revenue: this.toNumber(review.revenue ?? 0),
      completionRate: review.completionRate ?? 0,
      rankingChange: review.rankingChange ?? undefined,
      recommendationChange: review.recommendationChange ?? undefined,
      commentFeedback: review.commentFeedback ?? undefined
    };
  }

  private toReviewContentDiagnostics(value: unknown): ReviewReportResult["contentDiagnostics"] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const diagnostics = value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        if (typeof record.label !== "string" || typeof record.judgement !== "string" || typeof record.evidence !== "string" || typeof record.action !== "string") {
          return null;
        }

        return {
          label: record.label,
          score: typeof record.score === "number" ? Math.max(0, Math.min(100, Math.round(record.score))) : 0,
          judgement: record.judgement,
          evidence: record.evidence,
          action: record.action
        };
      })
      .filter((item): item is NonNullable<ReviewReportResult["contentDiagnostics"]>[number] => Boolean(item));

    return diagnostics.length ? diagnostics : undefined;
  }

  private reviewDetailScore(review: ReviewReportResult) {
    return (review.performanceMetrics ? 1 : 0) + (review.contentDiagnostics?.length ? 1 : 0);
  }

  private writingMemoryMarkdown(work: Work, plan: StoryPlan, memories: WritingMemory[]) {
    const memoryList = memories.length
      ? memories
          .map(
            (memory) => `## ${memory.rule}

- 来源：${this.memorySourceLabel(memory.sourceType)}
- 题材：${memory.genre}
- 状态：${memory.enabled ? "启用" : "停用"}
- 置信度：${memory.confidence}
- 关联作品：${memory.relatedWorkIds.includes(work.id) ? "本作品" : memory.relatedWorkIds.join("、") || "未指定"}
- 更新时间：${memory.updatedAt}

### 正面例子

${this.markdownQuote(memory.positiveExample || "暂无")}

### 反面例子

${this.markdownQuote(memory.negativeExample || "暂无")}
`
          )
          .join("\n")
      : `## 暂无直接关联记忆

- 题材：${plan.genre}
- 推荐标签：${plan.tags.join("、")}
- 建议：可以在编辑器应用改稿，或在复盘分析生成复盘后，让系统自动沉淀本作品记忆。
`;

    return `# 本作品写作记忆

- 作品：${work.title}
- 题材：${plan.genre}
- 推荐标签：${plan.tags.join("、")}
- 导出记忆数：${memories.length}

${memoryList}
`;
  }

  private personalStrategyMarkdown(work: Work, plan: StoryPlan, strategies: PersonalStrategy[]) {
    const strategyList = strategies.length
      ? strategies
          .map(
            (strategy) => `## ${strategy.rule}

- 来源：${this.strategySourceLabel(strategy.sourceType)}
- 题材：${strategy.genre}
- 状态：${strategy.enabled ? "启用" : "停用"}
- 置信度：${strategy.confidence}
- 关联作品：${strategy.relatedWorkIds.includes(work.id) ? "本作品" : strategy.relatedWorkIds.join("、") || "未指定"}
- 更新时间：${strategy.updatedAt}

### 证据

${strategy.evidence || "暂无"}

### 下一步动作

${strategy.action || "写作前先检查这条策略是否适用。"}
`
          )
          .join("\n")
      : `## 暂无直接关联策略

- 可复用结构：${plan.emotionalCurve.map((beat) => beat.stage).join(" → ")}
- 风险提醒：避免复制热门作品原文和完整桥段。
- 建议：生成发布复盘后，系统会把可执行经验写入个人策略库。
`;

    return `# 经验沉淀

- 作品：${work.title}
- 题材：${plan.genre}
- 导出策略数：${strategies.length}

${strategyList}
`;
  }

  private reviewMarkdown(work: Work, review?: ReviewReportResult | null) {
    if (!review) {
      return `# 发布后复盘

这部作品还没有生成复盘报告。

## 下一步

1. 打开「复盘分析」。
2. 选择《${work.title}》。
3. 录入阅读量、收益、完读率、排名变化、推荐量变化和评论反馈。
4. 点击「生成复盘」，再重新导出作品工程。
`;
    }

    const metrics = review.performanceMetrics;
    const metricsMarkdown = metrics
      ? `## 发布表现

- 阅读量：${this.formatNumber(metrics.readCount)}
- 收益：¥${metrics.revenue.toFixed(2)}
- 完读率：${metrics.completionRate}%
- 排名变化：${metrics.rankingChange || "未填写"}
- 推荐量变化：${metrics.recommendationChange || "未填写"}
- 评论反馈：${metrics.commentFeedback || "未填写"}
`
      : `## 发布表现

- 阅读量：${this.formatNumber(work.readCount)}
- 收益：¥${work.revenue.toFixed(2)}
- 完读率：${work.completionRate}%
- 评论反馈：${work.commentFeedback || "未填写"}
`;
    const diagnosticsMarkdown = review.contentDiagnostics?.length
      ? `## 内容维度诊断

${review.contentDiagnostics
  .map(
    (item) => `### ${item.label}：${item.score}

- 判断：${item.judgement}
- 依据：${item.evidence}
- 下次处理：${item.action}
`
  )
  .join("\n")}`
      : "";

    return `# 发布后复盘

- 复盘时间：${review.createdAt}
- 保存状态：${review.persisted ? "已保存" : "临时"}

${metricsMarkdown}

## 内容表现判断

${review.performanceSummary}

${diagnosticsMarkdown}

## 做得好的地方

${this.markdownList(review.strengths)}

## 需要注意的地方

${this.markdownList(review.weaknesses)}

## 下一篇创作建议

${this.markdownList(review.nextWritingAdvice)}

## 经验沉淀

${this.markdownList(review.strategyLessons)}
`;
  }

  private agentTraceMarkdown(plan: StoryPlan) {
    const trace = plan.agentTrace?.length
      ? plan.agentTrace
      : plan.agentSteps.map((step, index) => ({
          id: `trace-fallback-${index + 1}`,
          order: index + 1,
          agent: step,
          role: step,
          input: "来自旧版写作方案。",
          output: "已完成该阶段产出。",
          handoff: "继续交给下一步。",
          status: "done" as const
        }));

    return trace
      .map(
        (step) => `## ${step.order}. ${step.agent}

- 状态：${step.status === "done" ? "完成" : "等待"}
- 角色：${step.role}
- 输入：${step.input}
- 产出：${step.output}
- 交接：${step.handoff}
`
      )
      .join("\n");
  }

  private qualityReportMarkdown(plan: StoryPlan) {
    const report = plan.qualityReport ?? createStoryQualityReport(plan);

    return `# 质量体检

- 综合评分：${report.overallScore}
- 发布准备度：${report.publishReadiness}
- 总结：${report.summary}

## 发布前避坑清单

${report.checks
  .map(
    (check) => `### ${check.label}

- 状态：${check.status}
- 分数：${check.score}
- 关联场景：${check.relatedScenes.length ? check.relatedScenes.join("、") : "全篇"}
- 依据：${check.evidence}
- 改法：${check.fix}
`
  )
  .join("\n")}

## 发布前边界

${report.guardrails.map((item) => `- ${item}`).join("\n")}
`;
  }

  private originalityReportMarkdown(plan: StoryPlan) {
    const report = plan.originalityReport ?? createStoryOriginalityReport(plan);

    return `# 原创边界

- 原创分：${report.originalityScore}
- 风险等级：${report.riskLevel}
- 判断：${report.verdict}

## 可学习点

${report.learningPoints.map((item) => `- ${item}`).join("\n")}

## 避免复制点

${report.avoidCopyPoints.map((item) => `- ${item}`).join("\n")}

## 分项检查

${report.checks
  .map(
    (check) => `### ${check.label}

- 风险：${check.riskLevel}
- 关联场景：${check.relatedScenes.length ? check.relatedScenes.join("、") : "全篇"}
- 依据：${check.evidence}
- 可学习：${check.learnFrom}
- 避免复制：${check.avoidCopy}
- 原创化动作：${check.rewriteAction}
`
  )
  .join("\n")}

## 下一轮原创化动作

${report.rewriteActions.map((item) => `- ${item}`).join("\n")}
`;
  }

  private workMemoryMarkdown(plan: StoryPlan) {
    const memory = plan.continuityMemory ?? createStoryContinuityMemory(plan);

    return `# 作品记忆

${memory.summary}

## 人物状态

${memory.characterMemories
  .map(
    (character) => `### ${character.name}

- 角色：${character.role}
- 当前状态：${character.currentState}
- 关系变化：${character.relationshipShift}
- 下次使用：${character.nextUse}
`
  )
  .join("\n")}

## 伏笔状态

${memory.foreshadowMemories
  .map(
    (item) => `### ${item.clue}

- 状态：${item.status}
- 埋下场景：${item.plantedInScenes.length ? item.plantedInScenes.join("、") : "待补"}
- 回收场景：${item.payoffInScenes.length ? item.payoffInScenes.join("、") : "待补"}
- 备注：${item.note}
`
  )
  .join("\n")}

## 分场连续性

${memory.sceneMemories
  .map(
    (scene) => `### 场景 ${scene.index}：${scene.title}

- 情绪状态：${scene.emotionalState}
- 人物状态：${scene.characterState}
- 关系变化：${scene.relationshipChange}
- 埋下伏笔：${scene.plantedForeshadows.length ? scene.plantedForeshadows.join("、") : "无"}
- 回收伏笔：${scene.paidForeshadows.length ? scene.paidForeshadows.join("、") : "无"}
- 下次改稿提醒：${scene.nextContinuityNote}
`
  )
  .join("\n")}

## 后续写作注意

${memory.nextWritingNotes.map((item) => `- ${item}`).join("\n")}
`;
  }

  private scenePromptMarkdown(prompt: StoryPlan["scenePrompts"][number]) {
    return `## 场景 ${prompt.index}：${prompt.title}

### 写作目标

${prompt.objective}

### 上下文

${prompt.context}

### 正文提示词

${prompt.writingPrompt}

### 必须包含

${prompt.mustInclude.map((item) => `- ${item}`).join("\n")}

### 避免

${prompt.avoid.map((item) => `- ${item}`).join("\n")}
`;
  }

  private sceneDraftMarkdown(scene: StoryPlan["sceneDrafts"][number]) {
    return `## 场景 ${scene.index}：${scene.title}

- 目标字数：${scene.wordTarget}
- 本场评分：${scene.qualityScore}
- 修改重点：${scene.revisionFocus}

### 读者提醒

${scene.readerNotes.map((item) => `- ${item}`).join("\n")}

### 正文

${scene.text}
`;
  }

  private workspaceWorksRoot() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.WORKSPACE_DIR ?? "workspace", "works");
  }

  private localWorksFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "works.json");
  }

  private localReviewsFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "reviews.json");
  }

  private localEditorFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "editor.json");
  }

  private localMemoryFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "writing-memories.json");
  }

  private localStrategiesFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "personal-strategies.json");
  }

  private formatNumber(value: number) {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }

    return value.toLocaleString("zh-CN");
  }

  private markdownList(items: string[]) {
    return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
  }

  private markdownQuote(text: string) {
    const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
    return lines.length ? lines.map((line) => `> ${line}`).join("\n") : "> 暂无";
  }

  private normalizeMarkType(type: MarkType | string | undefined): MarkType {
    const allowed: MarkType[] = ["delete", "optimize", "rewrite", "logic", "emotion", "rhythm", "character", "information_gap", "scene_goal"];
    return type && allowed.includes(type as MarkType) ? (type as MarkType) : "optimize";
  }

  private normalizeMemorySourceType(sourceType: WritingMemory["sourceType"] | string | undefined): WritingMemory["sourceType"] {
    const allowed: WritingMemory["sourceType"][] = ["user_feedback", "review", "platform_result", "manual_rule", "reader_report"];
    return sourceType && allowed.includes(sourceType as WritingMemory["sourceType"]) ? (sourceType as WritingMemory["sourceType"]) : "manual_rule";
  }

  private normalizeStrategySourceType(sourceType: PersonalStrategy["sourceType"] | string | undefined): PersonalStrategy["sourceType"] {
    const allowed: PersonalStrategy["sourceType"][] = ["review", "platform_result", "manual_rule", "editor_feedback"];
    return sourceType && allowed.includes(sourceType as PersonalStrategy["sourceType"]) ? (sourceType as PersonalStrategy["sourceType"]) : "manual_rule";
  }

  private confidence(value: number | undefined) {
    if (value === undefined || Number.isNaN(value)) {
      return 75;
    }

    return Math.min(100, Math.max(1, Math.round(value)));
  }

  private markTypeLabel(type: MarkType) {
    const labels: Record<MarkType, string> = {
      delete: "删除冗余",
      optimize: "优化表达",
      rewrite: "重写段落",
      logic: "逻辑检查",
      emotion: "情绪加强",
      rhythm: "节奏调整",
      character: "人物塑造",
      information_gap: "信息差",
      scene_goal: "场景目标"
    };

    return labels[type];
  }

  private memorySourceLabel(sourceType: WritingMemory["sourceType"]) {
    const labels: Record<WritingMemory["sourceType"], string> = {
      user_feedback: "编辑改稿",
      review: "发布复盘",
      platform_result: "平台表现",
      manual_rule: "手动规则",
      reader_report: "测试读者"
    };

    return labels[sourceType];
  }

  private strategySourceLabel(sourceType: PersonalStrategy["sourceType"]) {
    const labels: Record<PersonalStrategy["sourceType"], string> = {
      review: "发布复盘",
      platform_result: "平台表现",
      manual_rule: "手动策略",
      editor_feedback: "改稿沉淀"
    };

    return labels[sourceType];
  }

  private safeName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled-work";
  }
}
