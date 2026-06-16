import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writingMemories, type RewriteMemorySummary, type StoryPlan, type WritingMemory } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";

type CreateMemoryInput = {
  sourceType?: WritingMemory["sourceType"];
  genre?: string;
  rule: string;
  positiveExample?: string;
  negativeExample?: string;
  confidence?: number;
  relatedWorkIds?: string[];
  enabled?: boolean;
};

type UpdateMemoryInput = Partial<Pick<WritingMemory, "rule" | "positiveExample" | "negativeExample" | "confidence" | "enabled">> & {
  genre?: string;
};

type DbMemory = {
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

const fallbackMemories: WritingMemory[] = [...writingMemories];

@Injectable()
export class MemoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMemory(): Promise<WritingMemory[]> {
    try {
      await this.ensureSeedMemory();
      const memories = await this.prisma.writingMemory.findMany({
        orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }]
      });

      return memories.map((memory) => this.toSharedMemory(memory as DbMemory));
    } catch {
      return this.listLocalMemory();
    }
  }

  async createMemory(input: CreateMemoryInput): Promise<WritingMemory & { persisted: boolean; message: string }> {
    const normalized = this.normalizeCreateInput(input);

    try {
      const memory = await this.prisma.writingMemory.create({
        data: normalized
      });

      return {
        ...this.toSharedMemory(memory as DbMemory),
        persisted: true,
        message: "写作记忆已保存到本地数据库。"
      };
    } catch {
      const now = new Date().toISOString();
      const localMemories = await this.listLocalMemory();
      const memory: WritingMemory & { persisted: boolean; message: string } = {
        id: `memory-${Date.now()}-${localMemories.length + 1}`,
        sourceType: normalized.sourceType as WritingMemory["sourceType"],
        genre: normalized.genre ?? "通用",
        rule: normalized.rule,
        positiveExample: normalized.positiveExample ?? "",
        negativeExample: normalized.negativeExample ?? "",
        confidence: normalized.confidence,
        relatedWorkIds: normalized.relatedWorkIds,
        enabled: normalized.enabled,
        createdAt: now.slice(0, 10),
        updatedAt: now.slice(0, 10),
        persisted: false,
        message: "数据库暂时不可用，写作记忆已保存到本地文件。"
      };
      const nextMemories = [memory, ...localMemories];

      this.replaceFallbackMemories(nextMemories);
      await this.writeLocalMemoryFile(nextMemories);

      return memory;
    }
  }

  async updateMemory(id: string, input: UpdateMemoryInput) {
    try {
      const memory = await this.prisma.writingMemory.update({
        where: { id },
        data: input
      });

      return {
        ...this.toSharedMemory(memory as DbMemory),
        persisted: true,
        message: "写作记忆已更新。"
      };
    } catch {
      const localMemories = await this.listLocalMemory();
      const index = localMemories.findIndex((memory) => memory.id === id);
      if (index >= 0) {
        localMemories[index] = {
          ...localMemories[index],
          ...input,
          updatedAt: new Date().toISOString().slice(0, 10)
        };
      }

      this.replaceFallbackMemories(localMemories);
      await this.writeLocalMemoryFile(localMemories);

      return {
        id,
        persisted: false,
        message: "数据库暂时不可用，已更新本地文件里的写作记忆。"
      };
    }
  }

  async deleteMemory(id: string) {
    try {
      const result = await this.prisma.writingMemory.deleteMany({
        where: { id }
      });

      return {
        id,
        deleted: result.count > 0,
        persisted: true,
        message: result.count > 0 ? "写作记忆已删除。" : "没有找到这条写作记忆。"
      };
    } catch {
      const localMemories = await this.listLocalMemory();
      const nextMemories = localMemories.filter((memory) => memory.id !== id);

      this.replaceFallbackMemories(nextMemories);
      await this.writeLocalMemoryFile(nextMemories);

      return {
        id,
        deleted: nextMemories.length !== localMemories.length,
        persisted: false,
        message: nextMemories.length !== localMemories.length ? "数据库暂时不可用，已删除本地文件里的写作记忆。" : "本地文件里没有找到这条写作记忆。"
      };
    }
  }

  async createFromRewrite(input: {
    workId: string;
    genre?: string;
    originalText: string;
    newText: string;
    reason: string;
    impactNotes: string[];
  }): Promise<RewriteMemorySummary> {
    const genre = input.genre ?? "女性成长";
    const noteDrafts = (input.impactNotes.length ? input.impactNotes : [input.reason])
      .map((note) => this.compactText(note, 180))
      .filter((note) => this.isUsableRewriteNote(note));
    const ruleDrafts = this.uniqueRules(noteDrafts.map((note) => `改稿偏好：${note}`));

    if (!ruleDrafts.length) {
      return {
        requested: true,
        created: 0,
        skipped: 0,
        rules: [],
        skippedRules: [],
        persisted: true,
        message: "本次改稿没有产生可沉淀的有效记忆。"
      };
    }

    const currentMemories = await this.listMemory().catch(() => [] as WritingMemory[]);
    const existingKeys = new Set(currentMemories.map((memory) => this.memoryKey(memory.sourceType, memory.genre, memory.rule)));
    const createdRules: string[] = [];
    const skippedRules: string[] = [];
    const createdMemories: Array<WritingMemory & { persisted: boolean; message: string }> = [];

    for (const rule of ruleDrafts) {
      const key = this.memoryKey("user_feedback", genre, rule);
      if (existingKeys.has(key)) {
        skippedRules.push(rule);
        continue;
      }

      const memory = await this.createMemory({
        sourceType: "user_feedback",
        genre,
        rule,
        positiveExample: input.newText.slice(0, 160),
        negativeExample: input.originalText.slice(0, 160),
        confidence: 72,
        relatedWorkIds: [input.workId],
        enabled: true
      });

      createdMemories.push(memory);
      createdRules.push(rule);
      existingKeys.add(key);
    }

    return {
      requested: true,
      created: createdRules.length,
      skipped: skippedRules.length,
      rules: createdRules,
      skippedRules,
      persisted: createdMemories.length ? createdMemories.every((memory) => memory.persisted) : true,
      message: this.rewriteMemoryMessage(createdRules.length, skippedRules.length)
    };
  }

  async createFromStoryPlan(input: { workId: string; plan: StoryPlan }) {
    const suggestions = input.plan.readerReport.suggestions.filter(Boolean);
    const problems = input.plan.readerReport.problems.filter(Boolean);
    const rule = this.compactText(`测试读者记忆：${suggestions[0] ?? "下一篇继续保留结构完整、情绪清晰的短篇写法。"}`);

    return this.createMemory({
      sourceType: "reader_report",
      genre: input.plan.genre,
      rule,
      positiveExample: this.compactText(`《${input.plan.title}》可保留：${input.plan.selectedTopic.hook} ${suggestions.slice(0, 2).join("；")}`),
      negativeExample: this.compactText(problems.slice(0, 2).join("；") || "暂无明显问题，下一篇仍需检查开头、节奏和同质化风险。"),
      confidence: this.readerReportConfidence(input.plan),
      relatedWorkIds: [input.workId],
      enabled: true
    });
  }

  private async ensureSeedMemory() {
    const count = await this.prisma.writingMemory.count();

    if (count > 0) {
      return;
    }

    await this.prisma.writingMemory.createMany({
      data: writingMemories.map((memory) => ({
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
  }

  private normalizeCreateInput(input: CreateMemoryInput) {
    return {
      sourceType: input.sourceType ?? "manual_rule",
      genre: input.genre ?? "通用",
      rule: input.rule?.trim() || "保留用户明确提出过的写作偏好。",
      positiveExample: input.positiveExample ?? "",
      negativeExample: input.negativeExample ?? "",
      confidence: input.confidence ?? 70,
      relatedWorkIds: input.relatedWorkIds ?? [],
      enabled: input.enabled ?? true
    };
  }

  private toSharedMemory(memory: DbMemory): WritingMemory {
    return {
      id: memory.id,
      sourceType: memory.sourceType as WritingMemory["sourceType"],
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

  private async listLocalMemory() {
    const fileMemories = await this.readLocalMemoryFile();
    const merged = this.sortMemories(this.uniqueMemories(fileMemories ?? writingMemories));

    this.replaceFallbackMemories(merged);

    if (!fileMemories) {
      await this.writeLocalMemoryFile(merged);
    }

    return merged;
  }

  private async readLocalMemoryFile(): Promise<WritingMemory[] | null> {
    try {
      const parsed = JSON.parse(await readFile(this.localMemoryFilePath(), "utf8")) as { memories?: Partial<WritingMemory>[] };

      return (parsed.memories ?? []).map((memory) => this.normalizeLocalMemory(memory)).filter((memory): memory is WritingMemory => Boolean(memory));
    } catch {
      return null;
    }
  }

  private async writeLocalMemoryFile(memories: WritingMemory[]) {
    const filePath = this.localMemoryFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          memories: this.sortMemories(this.uniqueMemories(memories))
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeLocalMemory(memory: Partial<WritingMemory>): WritingMemory | null {
    if (!memory.rule?.trim()) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    return {
      id: memory.id ?? `memory-${Date.now()}`,
      sourceType: this.normalizeSourceType(memory.sourceType),
      genre: memory.genre ?? "通用",
      rule: memory.rule.trim(),
      positiveExample: memory.positiveExample ?? "",
      negativeExample: memory.negativeExample ?? "",
      confidence: memory.confidence ?? 70,
      relatedWorkIds: memory.relatedWorkIds ?? [],
      enabled: memory.enabled ?? true,
      createdAt: memory.createdAt ?? today,
      updatedAt: memory.updatedAt ?? today
    };
  }

  private normalizeSourceType(sourceType: WritingMemory["sourceType"] | undefined): WritingMemory["sourceType"] {
    const allowed: WritingMemory["sourceType"][] = ["user_feedback", "review", "platform_result", "manual_rule", "reader_report"];
    return sourceType && allowed.includes(sourceType) ? sourceType : "manual_rule";
  }

  private uniqueMemories(memories: WritingMemory[]) {
    const seen = new Set<string>();

    return memories.filter((memory) => {
      const key = `${memory.sourceType}:${memory.genre}:${memory.rule}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private sortMemories(memories: WritingMemory[]) {
    return [...memories].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.updatedAt.localeCompare(a.updatedAt));
  }

  private uniqueRules(rules: string[]) {
    const seen = new Set<string>();

    return rules.filter((rule) => {
      const key = this.normalizeRuleKey(rule);
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private isUsableRewriteNote(note: string) {
    const normalized = note.replace(/\s+/g, "");

    if (normalized.length < 6) {
      return false;
    }

    return !["本次未更新作品记忆", "无", "暂无", "不更新"].some((blocked) => normalized.includes(blocked));
  }

  private memoryKey(sourceType: WritingMemory["sourceType"], genre: string, rule: string) {
    return `${sourceType}:${genre.trim() || "通用"}:${this.normalizeRuleKey(rule)}`;
  }

  private normalizeRuleKey(rule: string) {
    return rule.replace(/\s+/g, " ").trim();
  }

  private rewriteMemoryMessage(created: number, skipped: number) {
    if (created > 0 && skipped > 0) {
      return `写作记忆新增 ${created} 条，跳过重复 ${skipped} 条。`;
    }

    if (created > 0) {
      return `写作记忆新增 ${created} 条，会进入下一篇自动写作参考。`;
    }

    if (skipped > 0) {
      return `没有新增写作记忆，${skipped} 条同类规则已存在。`;
    }

    return "本次改稿没有新增写作记忆。";
  }

  private readerReportConfidence(plan: StoryPlan) {
    const report = plan.readerReport;
    const average =
      (report.openingScore + report.empathyScore + report.emotionScore + report.reversalScore + report.closureScore + report.platformFitScore) / 6;

    return Math.max(62, Math.min(92, Math.round(average)));
  }

  private compactText(text: string, maxLength = 220) {
    const normalized = text.replace(/\s+/g, " ").trim();

    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
  }

  private replaceFallbackMemories(memories: WritingMemory[]) {
    fallbackMemories.splice(0, fallbackMemories.length, ...memories);
  }

  private localMemoryFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "writing-memories.json");
  }
}
