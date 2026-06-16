import { Inject, Injectable } from "@nestjs/common";
import type { GeneratePlanInput, PersonalStrategy, ReviseSceneDraftInput, WritingMemory } from "@shenbi/shared";
import { AiProviderService } from "../ai/ai-provider.service.js";
import { KnowledgeService, type KnowledgeMatch } from "../knowledge/knowledge.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { StrategiesService } from "../strategies/strategies.service.js";

type RewriteBody = {
  markId: string;
  selectedText: string;
  feedback: string;
};

type RetrievalContext = {
  genre: string;
  queryText: string;
  queryTokens: Set<string>;
  reviewIntent: boolean;
  knowledgeMatches: Map<string, KnowledgeMatch>;
};

type RankedMemory = {
  memory: WritingMemory;
  score: number;
  reasons: string[];
};

type RankedStrategy = {
  strategy: PersonalStrategy;
  score: number;
  reasons: string[];
};

@Injectable()
export class WritingWorkflowService {
  constructor(
    @Inject(AiProviderService) private readonly aiProvider: AiProviderService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService,
    @Inject(StrategiesService) private readonly strategiesService: StrategiesService
  ) {}

  async createFromInspiration(input: GeneratePlanInput) {
    return this.aiProvider.generateStoryPlan(await this.withLearningHints(input));
  }

  async createFromParameters(input: GeneratePlanInput) {
    return this.aiProvider.generateStoryPlan(await this.withLearningHints(input));
  }

  rewriteMark(input: RewriteBody) {
    return this.aiProvider.rewriteMarkedText(input.markId, input.selectedText, input.feedback);
  }

  reviseScene(input: ReviseSceneDraftInput) {
    return this.aiProvider.reviseSceneDraft(input);
  }

  private async withLearningHints(input: GeneratePlanInput): Promise<GeneratePlanInput> {
    const [memories, strategies] = await Promise.all([
      this.memoryService.listMemory().catch(() => []),
      this.strategiesService.listStrategies().catch(() => [])
    ]);
    const enabledMemories = memories.filter((memory) => memory.enabled && memory.rule.trim());
    const enabledStrategies = strategies.filter((strategy) => strategy.enabled && strategy.rule.trim());

    if (!enabledMemories.length && !enabledStrategies.length) {
      return input;
    }

    const context = await this.createRetrievalContext(input, enabledMemories, enabledStrategies);
    const selectedMemories = this.selectMemoriesForHints(this.rankMemories(this.uniqueMemories(enabledMemories), context), context).map((result) =>
      this.toMemoryHint(result)
    );
    const selectedStrategies = this.selectStrategiesForHints(this.rankStrategies(this.uniqueStrategies(enabledStrategies), context), context).map((result) =>
      this.toStrategyHint(result)
    );

    return {
      ...input,
      memoryHints: selectedMemories,
      strategyHints: selectedStrategies
    };
  }

  private async createRetrievalContext(input: GeneratePlanInput, memories: WritingMemory[], strategies: PersonalStrategy[]): Promise<RetrievalContext> {
    const genre = input.genre?.trim() || "女性成长";
    const queryText = [
      input.inspiration,
      input.platform,
      genre,
      input.length,
      input.emotion,
      input.protagonist,
      input.ending,
      input.style,
      input.mode
    ]
      .filter(Boolean)
      .join(" ");

    const knowledgeMatches = await this.knowledgeService
      .retrieve({
        query: queryText,
        items: [
          ...memories.map((memory) => ({
            sourceType: "memory" as const,
            sourceId: memory.id,
            genre: memory.genre,
            content: [memory.genre, memory.rule, memory.positiveExample, memory.negativeExample].filter(Boolean).join(" "),
            confidence: memory.confidence,
            enabled: memory.enabled,
            updatedAt: memory.updatedAt
          })),
          ...strategies.map((strategy) => ({
            sourceType: "strategy" as const,
            sourceId: strategy.id,
            genre: strategy.genre,
            content: [strategy.genre, strategy.rule, strategy.evidence, strategy.action].filter(Boolean).join(" "),
            confidence: strategy.confidence,
            enabled: strategy.enabled,
            updatedAt: strategy.updatedAt
          }))
        ],
        limit: 16
      })
      .catch(() => []);

    return {
      genre,
      queryText,
      queryTokens: this.tokenize(queryText),
      reviewIntent: this.hasReviewIntent(queryText),
      knowledgeMatches: new Map(knowledgeMatches.map((match) => [this.knowledgeKey(match.sourceType, match.sourceId), match]))
    };
  }

  private rankMemories(memories: WritingMemory[], context: RetrievalContext): RankedMemory[] {
    return memories
      .map((memory) => {
        const { score: genreScore, reason: genreReason } = this.scoreGenre(memory.genre, context.genre);
        const keywordHits = this.keywordHits(
          context.queryTokens,
          [memory.genre, memory.rule, memory.positiveExample, memory.negativeExample, memory.sourceType].join(" ")
        );
        const knowledgeMatch = context.knowledgeMatches.get(this.knowledgeKey("memory", memory.id));
        const canUseKnowledgeMatch = genreScore > 0 || keywordHits.length > 0;
        const knowledgeScore = canUseKnowledgeMatch && knowledgeMatch ? Math.round(knowledgeMatch.score * 40) : 0;
        const confidenceScore = Math.round(memory.confidence / 5);
        const platformResultBonus = this.platformResultBonus(memory.sourceType, genreScore, keywordHits.length, Boolean(knowledgeMatch));
        const reviewBonus = this.reviewSourceBonus(memory.sourceType, context.reviewIntent, genreScore, keywordHits.length, Boolean(knowledgeMatch));
        const reasons = [
          genreReason,
          platformResultBonus ? "用户授权后台学习" : "",
          reviewBonus ? `复盘结论优先 +${reviewBonus}` : "",
          keywordHits.length ? `关键词命中「${keywordHits.slice(0, 3).join("、")}」` : "",
          canUseKnowledgeMatch ? knowledgeMatch?.reason ?? "" : "",
          `置信度 ${memory.confidence}`
        ].filter(Boolean);

        return {
          memory,
          score: genreScore + Math.min(60, keywordHits.length * 8) + knowledgeScore + confidenceScore + platformResultBonus + reviewBonus,
          reasons
        };
      })
      .sort((a, b) => b.score - a.score || b.memory.confidence - a.memory.confidence || b.memory.updatedAt.localeCompare(a.memory.updatedAt));
  }

  private keepRelevantRanked<T extends { score: number }>(items: T[]) {
    const relevant = items.filter((item) => item.score >= 30);
    return relevant.length ? relevant : items.slice(0, 3);
  }

  private rankStrategies(strategies: PersonalStrategy[], context: RetrievalContext): RankedStrategy[] {
    return strategies
      .map((strategy) => {
        const { score: genreScore, reason: genreReason } = this.scoreGenre(strategy.genre, context.genre);
        const keywordHits = this.keywordHits(
          context.queryTokens,
          [strategy.genre, strategy.rule, strategy.evidence, strategy.action, strategy.sourceType].join(" ")
        );
        const knowledgeMatch = context.knowledgeMatches.get(this.knowledgeKey("strategy", strategy.id));
        const canUseKnowledgeMatch = genreScore > 0 || keywordHits.length > 0;
        const knowledgeScore = canUseKnowledgeMatch && knowledgeMatch ? Math.round(knowledgeMatch.score * 40) : 0;
        const confidenceScore = Math.round(strategy.confidence / 5);
        const platformResultBonus = this.platformResultBonus(strategy.sourceType, genreScore, keywordHits.length, Boolean(knowledgeMatch));
        const reviewBonus = this.reviewSourceBonus(strategy.sourceType, context.reviewIntent, genreScore, keywordHits.length, Boolean(knowledgeMatch));
        const reasons = [
          genreReason,
          platformResultBonus ? "用户授权后台学习" : "",
          reviewBonus ? `复盘结论优先 +${reviewBonus}` : "",
          keywordHits.length ? `关键词命中「${keywordHits.slice(0, 3).join("、")}」` : "",
          canUseKnowledgeMatch ? knowledgeMatch?.reason ?? "" : "",
          `置信度 ${strategy.confidence}`
        ].filter(Boolean);

        return {
          strategy,
          score: genreScore + Math.min(60, keywordHits.length * 8) + knowledgeScore + confidenceScore + platformResultBonus + reviewBonus,
          reasons
        };
      })
      .sort((a, b) => b.score - a.score || b.strategy.confidence - a.strategy.confidence || b.strategy.updatedAt.localeCompare(a.strategy.updatedAt));
  }

  private selectMemoriesForHints(items: RankedMemory[], context: RetrievalContext) {
    const platformReserved = items.find(
      (item) => item.memory.sourceType === "platform_result" && this.isReusableGenre(item.memory.genre, context.genre)
    );
    const reviewReserved = items.find((item) => item.memory.sourceType === "review" && this.isReusableGenre(item.memory.genre, context.genre));
    const reserved = (context.reviewIntent ? [reviewReserved, platformReserved] : [platformReserved, reviewReserved]).filter(
      (item): item is RankedMemory => Boolean(item)
    );

    return this.mergeRankedSelection(reserved, this.keepRelevantRanked(items), 5);
  }

  private selectStrategiesForHints(items: RankedStrategy[], context: RetrievalContext) {
    const platformReserved = items.find(
      (item) => item.strategy.sourceType === "platform_result" && this.isReusableGenre(item.strategy.genre, context.genre)
    );
    const reviewReserved = items.find((item) => item.strategy.sourceType === "review" && this.isReusableGenre(item.strategy.genre, context.genre));
    const reserved = (context.reviewIntent ? [reviewReserved, platformReserved] : [platformReserved, reviewReserved]).filter(
      (item): item is RankedStrategy => Boolean(item)
    );

    return this.mergeRankedSelection(reserved, this.keepRelevantRanked(items), 5);
  }

  private mergeRankedSelection<T extends { score: number }>(reserved: T[], ranked: T[], limit: number) {
    const selected: T[] = [];

    for (const item of [...reserved, ...ranked]) {
      if (!selected.includes(item)) {
        selected.push(item);
      }

      if (selected.length >= limit) {
        break;
      }
    }

    return selected;
  }

  private platformResultBonus(sourceType: WritingMemory["sourceType"] | PersonalStrategy["sourceType"], genreScore: number, keywordHitCount: number, hasKnowledgeMatch: boolean) {
    if (sourceType !== "platform_result") {
      return 0;
    }

    if (genreScore >= 42) {
      return 36;
    }

    if (keywordHitCount || hasKnowledgeMatch) {
      return 28;
    }

    return 12;
  }

  private reviewSourceBonus(
    sourceType: WritingMemory["sourceType"] | PersonalStrategy["sourceType"],
    reviewIntent: boolean,
    genreScore: number,
    keywordHitCount: number,
    hasKnowledgeMatch: boolean
  ) {
    if (sourceType !== "review") {
      return 0;
    }

    if (reviewIntent && genreScore >= 42) {
      return 48;
    }

    if (reviewIntent && (keywordHitCount || hasKnowledgeMatch)) {
      return 40;
    }

    if (genreScore >= 42) {
      return 30;
    }

    if (keywordHitCount || hasKnowledgeMatch) {
      return 22;
    }

    return 8;
  }

  private scoreGenre(candidateGenre: string, targetGenre: string) {
    if (candidateGenre === targetGenre) {
      return { score: 60, reason: "题材精确匹配" };
    }

    if (candidateGenre === "通用") {
      return { score: 24, reason: "通用经验可复用" };
    }

    if (candidateGenre.includes(targetGenre) || targetGenre.includes(candidateGenre)) {
      return { score: 42, reason: "题材相近" };
    }

    return { score: 0, reason: "" };
  }

  private isReusableGenre(candidateGenre: string, targetGenre: string) {
    return candidateGenre === targetGenre || candidateGenre === "通用" || candidateGenre.includes(targetGenre) || targetGenre.includes(candidateGenre);
  }

  private keywordHits(queryTokens: Set<string>, candidateText: string) {
    if (!queryTokens.size) {
      return [];
    }

    const candidateTokens = this.tokenize(candidateText);
    const normalizedCandidate = candidateText.toLowerCase();
    const hits: string[] = [];

    for (const token of queryTokens) {
      if (candidateTokens.has(token) || normalizedCandidate.includes(token)) {
        hits.push(token);
      }

      if (hits.length >= 8) {
        break;
      }
    }

    return hits;
  }

  private tokenize(text: string) {
    const tokens = new Set<string>();
    const normalized = text.toLowerCase();
    const stopTokens = new Set(["一个", "最后", "长期", "故事", "主角", "女主", "女孩", "完成", "平台"]);

    for (const word of normalized.split(/[^\p{L}\p{N}]+/u)) {
      if (word.length >= 2 && !stopTokens.has(word)) {
        tokens.add(word);
      }
    }

    for (const run of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
      for (const size of [2, 3, 4]) {
        for (let index = 0; index <= run.length - size; index += 1) {
          const token = run.slice(index, index + size);

          if (!stopTokens.has(token)) {
            tokens.add(token);
          }
        }
      }
    }

    return tokens;
  }

  private hasReviewIntent(text: string) {
    return /复盘|下一篇|评论关键词|读者反馈|完读|收益|发布表现|中段|开头抓人|策略|记忆/u.test(text);
  }

  private uniqueMemories(memories: WritingMemory[]) {
    const seen = new Set<string>();

    return memories.filter((memory) => {
      const key = `${memory.genre}:${memory.rule.trim()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private uniqueStrategies(strategies: PersonalStrategy[]) {
    const seen = new Set<string>();

    return strategies.filter((strategy) => {
      const key = `${strategy.genre}:${strategy.rule.trim()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private knowledgeKey(sourceType: KnowledgeMatch["sourceType"], sourceId: string) {
    return `${sourceType}:${sourceId}`;
  }

  private toMemoryHint(result: RankedMemory): NonNullable<GeneratePlanInput["memoryHints"]>[number] {
    const { memory, score, reasons } = result;

    return {
      id: memory.id,
      sourceType: memory.sourceType,
      genre: memory.genre,
      rule: memory.rule,
      positiveExample: memory.positiveExample,
      negativeExample: memory.negativeExample,
      confidence: memory.confidence,
      matchScore: score,
      matchReason: `召回分 ${score}：${reasons.join("、") || "备用高置信度经验"}`
    };
  }

  private toStrategyHint(result: RankedStrategy): NonNullable<GeneratePlanInput["strategyHints"]>[number] {
    const { strategy, score, reasons } = result;

    return {
      id: strategy.id,
      sourceType: strategy.sourceType,
      genre: strategy.genre,
      rule: strategy.rule,
      evidence: strategy.evidence,
      action: strategy.action,
      confidence: strategy.confidence,
      matchScore: score,
      matchReason: `召回分 ${score}：${reasons.join("、") || "备用高置信度策略"}`
    };
  }
}
