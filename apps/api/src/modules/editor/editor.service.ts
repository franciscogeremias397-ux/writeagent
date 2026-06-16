import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplyRewriteResult, EditorMarkRecord, EditorVersionRecord, MarkType, RewriteMemorySummary } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { WorksService } from "../works/works.service.js";

type CreateMarkInput = {
  workId: string;
  label: string;
  index: number;
  type: MarkType;
  selectedText: string;
  comment?: string;
  startOffset: number;
  endOffset: number;
};

type ApplyRewriteInput = {
  workId: string;
  markId: string;
  markLabel: string;
  originalText: string;
  newText: string;
  reason: string;
  impactNotes?: string[];
  updateMemory?: boolean;
  fullText?: string;
};

type LocalEditorFile = {
  marks: EditorMarkRecord[];
  versions: EditorVersionRecord[];
};

const fallbackMarks: EditorMarkRecord[] = [];
const fallbackVersions: EditorVersionRecord[] = [];

@Injectable()
export class EditorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(WorksService) private readonly worksService: WorksService
  ) {}

  async listMarks(workId: string): Promise<EditorMarkRecord[]> {
    try {
      const marks = await this.prisma.mark.findMany({
        where: { workId },
        orderBy: { index: "asc" }
      });

      return marks.map((mark) => ({
        id: mark.id,
        workId: mark.workId,
        label: `标记${mark.index}`,
        index: mark.index,
        type: mark.type as MarkType,
        selectedText: mark.selectedText,
        comment: mark.comment ?? "",
        startOffset: mark.startOffset,
        endOffset: mark.endOffset,
        persisted: true,
        createdAt: mark.createdAt.toISOString()
      }));
    } catch {
      const localEditor = await this.readLocalEditorFile();
      return localEditor.marks.filter((mark) => mark.workId === workId).sort((a, b) => a.index - b.index);
    }
  }

  async createMark(input: CreateMarkInput): Promise<EditorMarkRecord> {
    try {
      const mark = await this.prisma.mark.create({
        data: {
          workId: input.workId,
          index: input.index,
          type: input.type,
          selectedText: input.selectedText,
          comment: input.comment ?? "",
          startOffset: input.startOffset,
          endOffset: input.endOffset
        }
      });

      const savedMark = {
        id: mark.id,
        workId: mark.workId,
        label: `标记${mark.index}`,
        index: mark.index,
        type: mark.type as MarkType,
        selectedText: mark.selectedText,
        comment: mark.comment ?? "",
        startOffset: mark.startOffset,
        endOffset: mark.endOffset,
        persisted: true,
        createdAt: mark.createdAt.toISOString()
      };
      const localEditor = await this.readLocalEditorFile().catch(() => ({ marks: [], versions: [] }));

      await this.writeLocalEditorFile({
        ...localEditor,
        marks: [savedMark, ...localEditor.marks.filter((item) => item.id !== savedMark.id)]
      }).catch(() => undefined);

      return savedMark;
    } catch {
      const mark: EditorMarkRecord = {
        id: `mark-${Date.now()}`,
        workId: input.workId,
        label: input.label,
        index: input.index,
        type: input.type,
        selectedText: input.selectedText,
        comment: input.comment ?? "",
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        persisted: false,
        createdAt: new Date().toISOString()
      };

      fallbackMarks.push(mark);
      const localEditor = await this.readLocalEditorFile();
      localEditor.marks.push(mark);
      await this.writeLocalEditorFile(localEditor);

      return mark;
    }
  }

  async deleteMark(markId: string) {
    try {
      await this.prisma.mark.delete({ where: { id: markId } });
      const localEditor = await this.readLocalEditorFile().catch(() => ({ marks: [], versions: [] }));

      await this.writeLocalEditorFile({
        ...localEditor,
        marks: localEditor.marks.filter((mark) => mark.id !== markId)
      }).catch(() => undefined);

      return { persisted: true, message: "标记已从本地数据库删除。" };
    } catch {
      const index = fallbackMarks.findIndex((mark) => mark.id === markId);

      if (index >= 0) {
        fallbackMarks.splice(index, 1);
      }

      const localEditor = await this.readLocalEditorFile();
      localEditor.marks = localEditor.marks.filter((mark) => mark.id !== markId);
      await this.writeLocalEditorFile(localEditor);

      return { persisted: false, message: "数据库暂时不可用，已从本地文件移除标记。" };
    }
  }

  async listVersions(workId: string): Promise<EditorVersionRecord[]> {
    try {
      const versions = await this.prisma.workVersion.findMany({
        where: { workId },
        orderBy: { createdAt: "desc" }
      });

      return versions.map((version) => ({
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
      }));
    } catch {
      const localEditor = await this.readLocalEditorFile();
      return localEditor.versions.filter((version) => version.workId === workId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  async applyRewrite(input: ApplyRewriteInput): Promise<ApplyRewriteResult> {
    try {
      const version = await this.prisma.workVersion.create({
        data: {
          workId: input.workId,
          markId: input.markId,
          markLabel: input.markLabel,
          originalText: input.originalText,
          newText: input.newText,
          reason: input.reason,
          impactNotes: input.impactNotes ?? []
        }
      });

      await this.prisma.mark.delete({ where: { id: input.markId } }).catch(() => undefined);
      await this.saveWorkFullText(input);
      const memory = await this.createRewriteMemorySummary(input);

      const savedVersion = {
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
      const localEditor = await this.readLocalEditorFile().catch(() => ({ marks: [], versions: [] }));

      await this.writeLocalEditorFile({
        marks: localEditor.marks.filter((mark) => mark.id !== input.markId),
        versions: [savedVersion, ...localEditor.versions.filter((item) => item.id !== savedVersion.id)]
      }).catch(() => undefined);

      return this.toApplyRewriteResult(savedVersion, input, memory);
    } catch {
      const version: EditorVersionRecord = {
        id: `version-${Date.now()}`,
        workId: input.workId,
        markId: input.markId,
        markLabel: input.markLabel,
        originalText: input.originalText,
        newText: input.newText,
        reason: input.reason,
        impactNotes: input.impactNotes ?? [],
        persisted: false,
        createdAt: new Date().toISOString()
      };

      fallbackVersions.unshift(version);
      const markIndex = fallbackMarks.findIndex((mark) => mark.id === input.markId);
      if (markIndex >= 0) {
        fallbackMarks.splice(markIndex, 1);
      }

      const localEditor = await this.readLocalEditorFile();
      localEditor.versions.unshift(version);
      localEditor.marks = localEditor.marks.filter((mark) => mark.id !== input.markId);
      await this.writeLocalEditorFile(localEditor);
      await this.saveWorkFullText(input);

      const memory = await this.createRewriteMemorySummary(input);

      return this.toApplyRewriteResult(version, input, memory);
    }
  }

  private async createRewriteMemorySummary(input: ApplyRewriteInput): Promise<RewriteMemorySummary> {
    if (input.updateMemory === false) {
      return {
        requested: false,
        created: 0,
        skipped: 0,
        rules: [],
        skippedRules: [],
        persisted: true,
        message: "本次未更新写作记忆。"
      };
    }

    const genre = await this.resolveWorkGenre(input.workId);

    try {
      return await this.memoryService.createFromRewrite({
        workId: input.workId,
        genre,
        originalText: input.originalText,
        newText: input.newText,
        reason: input.reason,
        impactNotes: input.impactNotes ?? []
      });
    } catch {
      return {
        requested: true,
        created: 0,
        skipped: 0,
        rules: [],
        skippedRules: [],
        persisted: false,
        message: "改稿版本已保存，但写作记忆沉淀失败，可稍后在记忆库手动补录。"
      };
    }
  }

  private async resolveWorkGenre(workId: string) {
    try {
      const work = await this.worksService.getWork(workId);
      return work.storyPlan?.genre || work.genreTags[0] || "女性成长";
    } catch {
      return "女性成长";
    }
  }

  private async saveWorkFullText(input: ApplyRewriteInput) {
    if (!input.fullText?.trim()) {
      return;
    }

    await this.worksService.updateFullText(input.workId, input.fullText.trim());
  }

  private toApplyRewriteResult(version: EditorVersionRecord, input: ApplyRewriteInput, memory: RewriteMemorySummary): ApplyRewriteResult {
    const diff = {
      originalLength: this.countText(input.originalText),
      newLength: this.countText(input.newText),
      delta: this.countText(input.newText) - this.countText(input.originalText),
      changed: input.originalText.replace(/\s+/g, "") !== input.newText.replace(/\s+/g, "")
    };
    const storage = version.persisted ? "本地数据库" : "本地文件";
    const message = `新版片段已应用，版本历史已保存到${storage}。${memory.message}`;

    return {
      version,
      memory,
      diff,
      message
    };
  }

  private countText(value: string) {
    return value.replace(/\s+/g, "").length;
  }

  private async readLocalEditorFile(): Promise<LocalEditorFile> {
    try {
      const parsed = JSON.parse(await readFile(this.localEditorFilePath(), "utf8")) as {
        marks?: Partial<EditorMarkRecord>[];
        versions?: Partial<EditorVersionRecord>[];
      };

      const marks = (parsed.marks ?? []).map((mark) => this.normalizeMark(mark)).filter((mark): mark is EditorMarkRecord => Boolean(mark));
      const versions = (parsed.versions ?? [])
        .map((version) => this.normalizeVersion(version))
        .filter((version): version is EditorVersionRecord => Boolean(version));

      this.replaceFallbackEditorData(marks, versions);

      return {
        marks,
        versions
      };
    } catch {
      return {
        marks: fallbackMarks,
        versions: fallbackVersions
      };
    }
  }

  private async writeLocalEditorFile(editor: LocalEditorFile) {
    const filePath = this.localEditorFilePath();
    const marks = this.uniqueMarks(editor.marks).sort((a, b) => a.workId.localeCompare(b.workId) || a.index - b.index);
    const versions = this.uniqueVersions(editor.versions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    this.replaceFallbackEditorData(marks, versions);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          marks,
          versions
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeMark(mark: Partial<EditorMarkRecord>): EditorMarkRecord | null {
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
      persisted: false,
      createdAt: mark.createdAt ?? new Date().toISOString()
    };
  }

  private normalizeVersion(version: Partial<EditorVersionRecord>): EditorVersionRecord | null {
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
      persisted: false,
      createdAt: version.createdAt ?? new Date().toISOString()
    };
  }

  private normalizeMarkType(type: MarkType | undefined): MarkType {
    const allowed: MarkType[] = ["delete", "optimize", "rewrite", "logic", "emotion", "rhythm", "character", "information_gap", "scene_goal"];
    return type && allowed.includes(type) ? type : "optimize";
  }

  private uniqueMarks(marks: EditorMarkRecord[]) {
    const seen = new Set<string>();

    return marks.filter((mark) => {
      if (seen.has(mark.id)) {
        return false;
      }

      seen.add(mark.id);
      return true;
    });
  }

  private uniqueVersions(versions: EditorVersionRecord[]) {
    const seen = new Set<string>();

    return versions.filter((version) => {
      if (seen.has(version.id)) {
        return false;
      }

      seen.add(version.id);
      return true;
    });
  }

  private replaceFallbackEditorData(marks: EditorMarkRecord[], versions: EditorVersionRecord[]) {
    fallbackMarks.splice(0, fallbackMarks.length, ...marks);
    fallbackVersions.splice(0, fallbackVersions.length, ...versions);
  }

  private localEditorFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "editor.json");
  }
}
