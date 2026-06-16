import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersonalStrategy, ReviewReportResult, Work } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";

type CreateStrategyInput = {
  sourceType?: PersonalStrategy["sourceType"];
  genre?: string;
  rule: string;
  evidence?: string;
  action?: string;
  confidence?: number;
  relatedWorkIds?: string[];
  enabled?: boolean;
};

type UpdateStrategyInput = Partial<Pick<PersonalStrategy, "rule" | "evidence" | "action" | "confidence" | "enabled">> & {
  genre?: string;
};

type DbStrategy = {
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

const fallbackStrategies: PersonalStrategy[] = [
  {
    id: "strategy-1",
    sourceType: "manual_rule",
    genre: "女性成长",
    rule: "现实女性成长优先保留克制反击，不要让外部身份替主角解决问题。",
    evidence: "示例作品里，读者更容易接受主角自己整理证据、公开真相的路径。",
    action: "下一篇继续让主角主动完成关键动作，外部帮助只能做辅助。",
    confidence: 82,
    relatedWorkIds: ["work-1"],
    enabled: true,
    createdAt: "2026-06-07",
    updatedAt: "2026-06-07"
  }
];

@Injectable()
export class StrategiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listStrategies(): Promise<PersonalStrategy[]> {
    try {
      await this.ensureSeedStrategies();
      const strategies = await this.prisma.personalStrategy.findMany({
        orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }]
      });

      return strategies.map((strategy) => this.toSharedStrategy(strategy as DbStrategy));
    } catch {
      return this.listLocalStrategies();
    }
  }

  async createStrategy(input: CreateStrategyInput): Promise<PersonalStrategy & { persisted: boolean; message: string }> {
    const strategy = this.normalizeCreateInput(input);

    try {
      const created = await this.prisma.personalStrategy.create({
        data: this.toDbStrategy(strategy)
      });

      return {
        ...this.toSharedStrategy(created as DbStrategy),
        persisted: true,
        message: "个人策略已保存到本地数据库，并会进入下次写作参考。"
      };
    } catch {
      const strategies = await this.listLocalStrategies();
      const nextStrategies = [strategy, ...strategies];

      this.replaceFallbackStrategies(nextStrategies);
      await this.writeLocalStrategiesFile(nextStrategies);

      return {
        ...strategy,
        persisted: false,
        message: "数据库暂时不可用，个人策略已保存到本地文件，并会进入下次写作参考。"
      };
    }
  }

  async updateStrategy(id: string, input: UpdateStrategyInput) {
    try {
      const strategy = await this.prisma.personalStrategy.update({
        where: { id },
        data: this.cleanUpdateInput(input)
      });

      return {
        ...this.toSharedStrategy(strategy as DbStrategy),
        persisted: true,
        message: "个人策略已更新到本地数据库。"
      };
    } catch {
      const strategies = await this.listLocalStrategies();
      const index = strategies.findIndex((strategy) => strategy.id === id);

      if (index >= 0) {
        strategies[index] = {
          ...strategies[index],
          ...this.cleanUpdateInput(input),
          updatedAt: new Date().toISOString().slice(0, 10)
        };
      }

      this.replaceFallbackStrategies(strategies);
      await this.writeLocalStrategiesFile(strategies);

      return {
        ...(strategies[index] ?? { id }),
        persisted: false,
        message: "数据库暂时不可用，已更新本地文件里的个人策略。"
      };
    }
  }

  async deleteStrategy(id: string) {
    try {
      const result = await this.prisma.personalStrategy.deleteMany({
        where: { id }
      });

      return {
        id,
        deleted: result.count > 0,
        persisted: true,
        message: result.count > 0 ? "个人策略已删除。" : "没有找到这条个人策略。"
      };
    } catch {
      const strategies = await this.listLocalStrategies();
      const nextStrategies = strategies.filter((strategy) => strategy.id !== id);

      this.replaceFallbackStrategies(nextStrategies);
      await this.writeLocalStrategiesFile(nextStrategies);

      return {
        id,
        deleted: nextStrategies.length !== strategies.length,
        persisted: false,
        message: nextStrategies.length !== strategies.length ? "数据库暂时不可用，已删除本地文件里的个人策略。" : "本地文件里没有找到这条个人策略。"
      };
    }
  }

  async createFromReview(review: ReviewReportResult, work: Work) {
    const genre = work.genreTags[0] ?? "通用";
    const strategies = review.strategyLessons.map((lesson, index) =>
      this.normalizeCreateInput({
        sourceType: "review",
        genre,
        rule: lesson,
        evidence: `${work.title} 复盘：${review.performanceSummary}`,
        action: review.nextWritingAdvice[index] ?? review.nextWritingAdvice[0] ?? "下一篇写作时优先检查这条策略是否适用。",
        confidence: index === 0 ? 86 : 78,
        relatedWorkIds: [work.id],
        enabled: true
      })
    );

    try {
      await this.prisma.personalStrategy.createMany({
        data: strategies.map((strategy) => this.toDbStrategy(strategy)),
        skipDuplicates: true
      });
    } catch {
      const current = await this.listLocalStrategies();
      const nextStrategies = [...strategies, ...current];

      this.replaceFallbackStrategies(nextStrategies);
      await this.writeLocalStrategiesFile(nextStrategies);
    }

    return strategies;
  }

  async replaceAll(strategies: PersonalStrategy[]) {
    const normalized = strategies.map((strategy) => this.normalizeLocalStrategy(strategy)).filter((strategy): strategy is PersonalStrategy => Boolean(strategy));

    try {
      await this.prisma.personalStrategy.deleteMany();
      if (normalized.length) {
        await this.prisma.personalStrategy.createMany({
          data: normalized.map((strategy) => this.toDbStrategy(strategy)),
          skipDuplicates: true
        });
      }

      this.replaceFallbackStrategies(normalized);
    } catch {
      await this.writeLocalStrategiesFile(normalized);
    }
  }

  private normalizeCreateInput(input: CreateStrategyInput): PersonalStrategy {
    const today = new Date().toISOString().slice(0, 10);

    return {
      id: `strategy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceType: input.sourceType ?? "manual_rule",
      genre: input.genre?.trim() || "通用",
      rule: input.rule?.trim() || "保留表现稳定的写法，并在下一篇创作前主动检查。",
      evidence: input.evidence?.trim() || "来自手动策略记录。",
      action: input.action?.trim() || "写作前先检查这条策略是否适用。",
      confidence: this.toConfidence(input.confidence),
      relatedWorkIds: input.relatedWorkIds ?? [],
      enabled: input.enabled ?? true,
      createdAt: today,
      updatedAt: today
    };
  }

  private cleanUpdateInput(input: UpdateStrategyInput): UpdateStrategyInput {
    return {
      ...input,
      genre: input.genre?.trim(),
      rule: input.rule?.trim(),
      evidence: input.evidence?.trim(),
      action: input.action?.trim(),
      confidence: input.confidence === undefined ? undefined : this.toConfidence(input.confidence)
    };
  }

  private normalizeLocalStrategy(strategy: Partial<PersonalStrategy>): PersonalStrategy | null {
    if (!strategy.rule?.trim()) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    return {
      id: strategy.id ?? `strategy-${Date.now()}`,
      sourceType: this.normalizeSourceType(strategy.sourceType),
      genre: strategy.genre ?? "通用",
      rule: strategy.rule.trim(),
      evidence: strategy.evidence ?? "",
      action: strategy.action ?? "写作前先检查这条策略是否适用。",
      confidence: this.toConfidence(strategy.confidence),
      relatedWorkIds: strategy.relatedWorkIds ?? [],
      enabled: strategy.enabled ?? true,
      createdAt: strategy.createdAt ?? today,
      updatedAt: strategy.updatedAt ?? today
    };
  }

  private normalizeSourceType(sourceType: PersonalStrategy["sourceType"] | undefined): PersonalStrategy["sourceType"] {
    const allowed: PersonalStrategy["sourceType"][] = ["review", "platform_result", "manual_rule", "editor_feedback"];
    return sourceType && allowed.includes(sourceType) ? sourceType : "manual_rule";
  }

  private async ensureSeedStrategies() {
    const count = await this.prisma.personalStrategy.count();

    if (count > 0) {
      return;
    }

    await this.prisma.personalStrategy.createMany({
      data: fallbackStrategies.map((strategy) => this.toDbStrategy(strategy)),
      skipDuplicates: true
    });
  }

  private toSharedStrategy(strategy: DbStrategy): PersonalStrategy {
    return {
      id: strategy.id,
      sourceType: this.normalizeSourceType(strategy.sourceType as PersonalStrategy["sourceType"]),
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

  private toDbStrategy(strategy: PersonalStrategy) {
    return {
      id: strategy.id,
      sourceType: strategy.sourceType,
      genre: strategy.genre,
      rule: strategy.rule,
      evidence: strategy.evidence,
      action: strategy.action,
      confidence: strategy.confidence,
      relatedWorkIds: strategy.relatedWorkIds,
      enabled: strategy.enabled,
      createdAt: new Date(strategy.createdAt),
      updatedAt: new Date(strategy.updatedAt)
    };
  }

  private toConfidence(value: number | undefined) {
    if (value === undefined || Number.isNaN(value)) {
      return 75;
    }

    return Math.min(100, Math.max(1, Math.round(value)));
  }

  private async listLocalStrategies(): Promise<PersonalStrategy[]> {
    const fileStrategies = await this.readLocalStrategiesFile();
    const strategies = this.sortStrategies(this.uniqueStrategies(fileStrategies ?? fallbackStrategies));

    this.replaceFallbackStrategies(strategies);

    if (!fileStrategies) {
      await this.writeLocalStrategiesFile(strategies);
    }

    return strategies;
  }

  private async readLocalStrategiesFile(): Promise<PersonalStrategy[] | null> {
    try {
      const parsed = JSON.parse(await readFile(this.localStrategiesFilePath(), "utf8")) as {
        strategies?: Partial<PersonalStrategy>[];
      };

      return (parsed.strategies ?? [])
        .map((strategy) => this.normalizeLocalStrategy(strategy))
        .filter((strategy): strategy is PersonalStrategy => Boolean(strategy));
    } catch {
      return null;
    }
  }

  private async writeLocalStrategiesFile(strategies: PersonalStrategy[]) {
    const filePath = this.localStrategiesFilePath();
    const normalized = this.sortStrategies(this.uniqueStrategies(strategies));

    this.replaceFallbackStrategies(normalized);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          strategies: normalized
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private uniqueStrategies(strategies: PersonalStrategy[]) {
    const seen = new Set<string>();

    return strategies.filter((strategy) => {
      const key = `${strategy.genre}:${strategy.rule}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private sortStrategies(strategies: PersonalStrategy[]) {
    return [...strategies].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt));
  }

  private replaceFallbackStrategies(strategies: PersonalStrategy[]) {
    fallbackStrategies.splice(0, fallbackStrategies.length, ...strategies);
  }

  private localStrategiesFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "personal-strategies.json");
  }
}
