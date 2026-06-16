import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { works as mockWorks, type ReviewReportResult, type Work } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { StrategiesService } from "../strategies/strategies.service.js";
import { WorksService } from "../works/works.service.js";

type CreateReviewInput = {
  readCount?: number;
  subscriptionCount?: number;
  revenue?: number;
  completionRate?: number;
  rankingChange?: string;
  recommendationChange?: string;
  commentFeedback?: string;
  commentKeywords?: string[] | string;
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

const fallbackReviews: ReviewReportResult[] = [];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

@Injectable()
export class ReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(StrategiesService) private readonly strategiesService: StrategiesService,
    @Inject(WorksService) private readonly worksService: WorksService
  ) {}

  async getReview(workId: string): Promise<ReviewReportResult> {
    const work = await this.findWork(workId);

    try {
      const review = await this.prisma.reviewReport.findFirst({
        where: { workId },
        orderBy: { createdAt: "desc" }
      });

      if (review) {
        return this.withDerivedDetails(this.toReviewResult(review as DbReview, true), work);
      }
    } catch {
      const localReview = await this.findLocalReview(workId);
      if (localReview) {
        return this.withDerivedDetails(localReview, work);
      }
    }

    return this.buildReview(workId, work, {});
  }

  async createReview(workId: string, input: CreateReviewInput = {}): Promise<ReviewReportResult> {
    const work = await this.findWork(workId);
    const generated = this.buildReview(workId, work, input);
    await this.syncWorkPerformance(workId, generated.performanceMetrics, this.normalizeCommentKeywords(input.commentKeywords, generated.performanceMetrics?.commentFeedback));

    try {
      const review = await this.prisma.reviewReport.create({
        data: {
          workId,
          readCount: generated.performanceMetrics?.readCount,
          revenue: generated.performanceMetrics?.revenue,
          completionRate: generated.performanceMetrics?.completionRate,
          rankingChange: generated.performanceMetrics?.rankingChange,
          recommendationChange: generated.performanceMetrics?.recommendationChange,
          commentFeedback: generated.performanceMetrics?.commentFeedback,
          contentDiagnostics: generated.contentDiagnostics ?? [],
          performanceSummary: generated.performanceSummary,
          strengths: generated.strengths,
          weaknesses: generated.weaknesses,
          nextWritingAdvice: generated.nextWritingAdvice,
          strategyLessons: generated.strategyLessons
        }
      });
      const savedReview = this.withDerivedDetails(this.toReviewResult(review as DbReview, true), work, input);
      const localReviews = await this.readLocalReviewsFile().catch(() => []);

      await this.writeLocalReviewsFile([savedReview, ...localReviews.filter((item) => item.id !== savedReview.id)]).catch(() => undefined);

      await this.memoryService.createMemory({
        sourceType: "review",
        genre: work.genreTags[0] ?? "通用",
        rule: generated.strategyLessons[0] ?? generated.performanceSummary,
        positiveExample: generated.strengths.join("；"),
        negativeExample: generated.weaknesses.join("；"),
        confidence: 82,
        relatedWorkIds: [workId],
        enabled: true
      });
      await this.strategiesService.createFromReview(generated, work);

      return savedReview;
    } catch {
      const localReview = {
        ...generated,
        persisted: true
      };
      const localReviews = await this.readLocalReviewsFile();

      fallbackReviews.unshift(localReview);
      await this.writeLocalReviewsFile([localReview, ...localReviews.filter((review) => review.id !== localReview.id)]);

      await this.memoryService.createMemory({
        sourceType: "review",
        genre: work.genreTags[0] ?? "通用",
        rule: generated.strategyLessons[0] ?? generated.performanceSummary,
        positiveExample: generated.strengths.join("；"),
        negativeExample: generated.weaknesses.join("；"),
        confidence: 76,
        relatedWorkIds: [workId],
        enabled: true
      });
      await this.strategiesService.createFromReview(generated, work);

      return localReview;
    }
  }

  private async findWork(workId: string): Promise<Work> {
    try {
      return await this.worksService.getWork(workId);
    } catch {
      return this.worksService.getWork(workId);
    }
  }

  private async syncWorkPerformance(workId: string, metrics: ReviewReportResult["performanceMetrics"], commentKeywords: string[] = []) {
    if (!metrics) {
      return;
    }

    await this.worksService
      .updateWork(workId, {
        readCount: metrics.readCount,
        subscriptionCount: metrics.subscriptionCount,
        revenue: metrics.revenue,
        completionRate: metrics.completionRate,
        commentFeedback: metrics.commentFeedback,
        ...(commentKeywords.length ? { commentKeywords } : {})
      })
      .catch(() => undefined);
  }

  private mockWork(workId: string) {
    return mockWorks.find((work) => work.id === workId) ?? mockWorks[0];
  }

  private buildReview(workId: string, work: Work, input: CreateReviewInput): ReviewReportResult {
    const readCount = input.readCount ?? work.readCount;
    const subscriptionCount = input.subscriptionCount ?? work.subscriptionCount;
    const revenue = input.revenue ?? work.revenue;
    const completionRate = input.completionRate ?? work.completionRate;
    const rankingChange = input.rankingChange?.trim();
    const recommendationChange = input.recommendationChange?.trim();
    const genre = work.genreTags[0] ?? "当前赛道";
    const style = work.styleTags[0] ?? "当前文风";
    const commentFeedback = input.commentFeedback?.trim() || work.commentFeedback?.trim();
    const commentKeywords = this.normalizeCommentKeywords(input.commentKeywords, commentFeedback).length
      ? this.normalizeCommentKeywords(input.commentKeywords, commentFeedback)
      : work.commentKeywords?.slice(0, 5) ?? [];
    const commentSignal = commentFeedback
      ? `评论反馈集中提到：${commentFeedback}`
      : commentKeywords.length
        ? `评论关键词集中在：${commentKeywords.join("、")}`
        : "评论区话题点还可以更尖锐，让读者更愿意留言。";

    const contentDiagnostics = this.buildContentDiagnostics(work, {
      readCount,
      completionRate,
      commentFeedback,
      commentKeywords
    });

    return {
      id: `review-${Date.now()}`,
      workId,
      performanceMetrics: {
        readCount,
        subscriptionCount,
        revenue,
        completionRate,
        rankingChange,
        recommendationChange,
        commentFeedback
      },
      contentDiagnostics,
      performanceSummary: `${genre} + ${style} 的表现重点在“开头压迫清晰、主角主动行动、结尾情绪落地”。当前阅读 ${this.formatNumber(readCount)}，订阅 ${this.formatNumber(subscriptionCount)}，收益 ¥${revenue.toFixed(2)}，完读率 ${completionRate}%。${rankingChange ? `排名变化：${rankingChange}。` : ""}${recommendationChange ? `推荐量变化：${recommendationChange}。` : ""}${commentSignal}`,
      strengths: [
        "开头能快速建立冲突，读者知道主角受到了什么不公平对待。",
        "主角不是被动等待救场，而是通过证据和行动推进反击。",
        "结尾用生活动作收束情绪，比单纯喊口号更有后劲。",
        ...contentDiagnostics.filter((item) => item.score >= 75).slice(0, 2).map((item) => `${item.label}表现较好：${item.judgement}`),
        commentKeywords.length ? `评论关键词里出现了“${commentKeywords[0]}”，说明读者已经抓住了可讨论的话题点。` : "读者反馈可以继续用来判断哪些情绪点最容易被记住。"
      ],
      weaknesses: [
        "中段信息追查容易密集，需要避免连续堆证据造成阅读压力。",
        "反派动机还可以更真实，不要只写成单纯坏人。",
        ...contentDiagnostics.filter((item) => item.score < 72).slice(0, 2).map((item) => `${item.label}需要复查：${item.action}`),
        commentFeedback ? `评论反馈提醒：${commentFeedback}` : "评论区话题点还可以更尖锐，让读者更愿意留言。"
      ],
      nextWritingAdvice: [
        `下一篇继续保留 ${genre} 的情绪优势，但换一个更具体的职业或地域场景。`,
        "反击仍然要由主角亲手完成，少用突然出现的外部强者解决问题。",
        "场景卡里每一场都要有一个物件钩子，例如缴费单、旧手机、钥匙或直播邀请。",
        commentKeywords.length ? `下一篇可以主动设计能引发“${commentKeywords.join("、")}”讨论的桥段，但不要复刻原作品情节。` : "导入评论摘要后，再把高频读者反馈转成下一篇的选题约束。"
      ],
      strategyLessons: [
        `${genre} 题材里，“现实细节 + 克制反击 + 情绪落点”的组合值得继续复用。`,
        "如果中段必须查真相，每 1200 字左右要安排一次情绪释放，避免只推信息不推情绪。",
        ...contentDiagnostics.slice(0, 2).map((item) => `${item.label}复盘结论：${item.action}`),
        commentKeywords.length ? `评论关键词“${commentKeywords.join("、")}”可作为账号下一轮内容测试标签。` : "评论反馈不足时，复盘结论要降低置信度，优先补充真实读者声音。"
      ],
      persisted: false,
      createdAt: new Date().toISOString()
    };
  }

  private buildContentDiagnostics(
    work: Work,
    input: { readCount: number; completionRate: number; commentFeedback?: string; commentKeywords: string[] }
  ): NonNullable<ReviewReportResult["contentDiagnostics"]> {
    const feedback = input.commentFeedback ?? "";
    const keywordText = input.commentKeywords.join("、");
    const hasSlowSignal = /慢|拖|啰嗦|解释|中段/.test(feedback) || input.commentKeywords.some((keyword) => /慢|拖|解释/.test(keyword));
    const hasEndingSignal = /结尾|后劲|意难平|爽|反转/.test(feedback) || input.commentKeywords.some((keyword) => /结尾|后劲|反转/.test(keyword));
    const hasCharacterSignal = /人物|女主|男主|主角|代入/.test(feedback) || input.commentKeywords.some((keyword) => /人物|主角|代入/.test(keyword));
    const base = Math.max(48, Math.min(92, input.completionRate + 8));

    return [
      {
        label: "开头抓人程度",
        score: clampScore(base + (input.readCount > 100000 ? 6 : 0)),
        judgement: input.readCount > 100000 ? "开头已经能带来点击和继续阅读。" : "开头还需要更快给出冲突和可追问题。",
        evidence: `阅读 ${this.formatNumber(input.readCount)}，评论线索：${feedback || keywordText || "暂无"}`,
        action: "前 300 字内放出主角困境、对手压力和一个具体物件钩子。"
      },
      {
        label: "中段拖沓风险",
        score: clampScore(hasSlowSignal ? input.completionRate - 12 : base),
        judgement: hasSlowSignal ? "读者已经感到中段解释偏多。" : "中段暂未出现明显拖沓信号。",
        evidence: feedback || keywordText || `完读率 ${input.completionRate}%`,
        action: "每 800-1200 字给一次新证据、新代价或新选择，删掉重复争执。"
      },
      {
        label: "高潮有效性",
        score: clampScore(base + (hasEndingSignal ? 5 : -2)),
        judgement: hasEndingSignal ? "高潮或反转已经被读者注意到。" : "高潮需要更明确的情绪兑现动作。",
        evidence: feedback || keywordText || "暂无明确高潮反馈",
        action: "把反击写成主角主动完成的选择，而不是外部人物替她解决。"
      },
      {
        label: "结尾情绪释放",
        score: clampScore(hasEndingSignal ? base + 7 : input.completionRate),
        judgement: hasEndingSignal ? "结尾有一定记忆点。" : "结尾可以增加更克制、有后劲的生活动作。",
        evidence: feedback || keywordText || `完读率 ${input.completionRate}%`,
        action: "结尾少喊口号，多给一个能让读者停一下的动作或物件回收。"
      },
      {
        label: "人物记忆点",
        score: clampScore(base + (hasCharacterSignal ? 6 : -4)),
        judgement: hasCharacterSignal ? "人物已经有可讨论点。" : "人物标签还可以更具体，避免只靠身份反转。",
        evidence: feedback || keywordText || work.genreTags.join("、"),
        action: "给主角一个稳定行为习惯、一个现实软肋和一次独立解决问题的动作。"
      },
      {
        label: "场景卡有效性",
        score: clampScore(work.storyPlan?.sceneCards?.length ? base + 4 : base - 4),
        judgement: work.storyPlan?.sceneCards?.length ? "作品有可追踪的场景结构。" : "缺少可回查的场景卡，复盘粒度会变粗。",
        evidence: work.storyPlan?.sceneCards?.length ? `${work.storyPlan.sceneCards.length} 张场景卡` : "未保存场景卡",
        action: "下一篇保存完整场景卡，并给每场标注目标、阻碍、情绪和结尾钩子。"
      },
      {
        label: "信息差发挥",
        score: clampScore(base + (/真相|秘密|误会|身份|信息/.test(feedback) ? 5 : -3)),
        judgement: /真相|秘密|误会|身份|信息/.test(feedback) ? "信息差已经形成阅读动力。" : "信息差需要更早埋、更晚揭。",
        evidence: feedback || keywordText || "暂无信息差反馈",
        action: "让读者、主角、反派分别掌握不同信息，并在高潮前完成关键揭示。"
      },
      {
        label: "冲突阶梯升级",
        score: clampScore(input.completionRate >= 70 ? base + 3 : input.completionRate + 2),
        judgement: input.completionRate >= 70 ? "冲突升级基本能托住阅读。" : "冲突升级可能不够清晰或有重复。",
        evidence: `完读率 ${input.completionRate}%`,
        action: "按“被压住-失去资源-公开受挫-拿到证据-反击兑现”检查每级是否加码。"
      }
    ];
  }

  private withDerivedDetails(report: ReviewReportResult, work: Work, input: CreateReviewInput = {}): ReviewReportResult {
    const readCount = input.readCount ?? report.performanceMetrics?.readCount ?? work.readCount;
    const subscriptionCount = input.subscriptionCount ?? report.performanceMetrics?.subscriptionCount ?? work.subscriptionCount;
    const revenue = input.revenue ?? report.performanceMetrics?.revenue ?? work.revenue;
    const completionRate = input.completionRate ?? report.performanceMetrics?.completionRate ?? work.completionRate;
    const commentFeedback = input.commentFeedback?.trim() || report.performanceMetrics?.commentFeedback || work.commentFeedback;
    const commentKeywords = this.normalizeCommentKeywords(input.commentKeywords, commentFeedback).length
      ? this.normalizeCommentKeywords(input.commentKeywords, commentFeedback)
      : work.commentKeywords?.slice(0, 5) ?? [];

    return {
      ...report,
      performanceMetrics: {
        readCount,
        subscriptionCount,
        revenue,
        completionRate,
        rankingChange: input.rankingChange?.trim() || report.performanceMetrics?.rankingChange,
        recommendationChange: input.recommendationChange?.trim() || report.performanceMetrics?.recommendationChange,
        commentFeedback
      },
      contentDiagnostics: report.contentDiagnostics?.length
        ? report.contentDiagnostics
        : this.buildContentDiagnostics(work, { readCount, completionRate, commentFeedback, commentKeywords })
    };
  }

  private toReviewResult(review: DbReview, persisted: boolean): ReviewReportResult {
    return {
      id: review.id,
      workId: review.workId,
      performanceMetrics: this.toStoredPerformanceMetrics(review),
      contentDiagnostics: this.toStoredContentDiagnostics(review.contentDiagnostics),
      performanceSummary: review.performanceSummary,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      nextWritingAdvice: review.nextWritingAdvice,
      strategyLessons: review.strategyLessons,
      persisted,
      createdAt: review.createdAt.toISOString()
    };
  }

  private normalizeCommentKeywords(value?: string[] | string, fallbackText?: string) {
    const rawKeywords = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[、,，\s]+/u)
        : this.keywordsFromFeedback(fallbackText);

    return Array.from(new Set(rawKeywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 8);
  }

  private keywordsFromFeedback(feedback?: string) {
    if (!feedback?.trim()) {
      return [];
    }

    const stopWords = new Set(["这个", "真的", "感觉", "作者", "读者", "评论", "反馈", "有点", "还是", "不是", "没有", "可以", "但是", "就是", "非常", "比较"]);

    return Array.from(feedback.matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/gu))
      .map((match) => match[0])
      .filter((keyword) => !stopWords.has(keyword))
      .slice(0, 8);
  }

  private toStoredPerformanceMetrics(review: DbReview): ReviewReportResult["performanceMetrics"] | undefined {
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
      revenue: this.decimalToNumber(review.revenue),
      completionRate: review.completionRate ?? 0,
      rankingChange: review.rankingChange ?? undefined,
      recommendationChange: review.recommendationChange ?? undefined,
      commentFeedback: review.commentFeedback ?? undefined
    };
  }

  private toStoredContentDiagnostics(value: unknown): ReviewReportResult["contentDiagnostics"] | undefined {
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
          score: typeof record.score === "number" ? clampScore(record.score) : 0,
          judgement: record.judgement,
          evidence: record.evidence,
          action: record.action
        };
      })
      .filter((item): item is NonNullable<ReviewReportResult["contentDiagnostics"]>[number] => Boolean(item));

    return diagnostics.length ? diagnostics : undefined;
  }

  private decimalToNumber(value: DbReview["revenue"]) {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return Number(value) || 0;
    }

    return value.toNumber?.() ?? 0;
  }

  private formatNumber(value: number) {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }

    return value.toLocaleString("zh-CN");
  }

  private async findLocalReview(workId: string) {
    return (await this.readLocalReviewsFile())
      .filter((review) => review.workId === workId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private async readLocalReviewsFile(): Promise<ReviewReportResult[]> {
    try {
      const parsed = JSON.parse(await readFile(this.localReviewsFilePath(), "utf8")) as { reviews?: Partial<ReviewReportResult>[] };
      const reviews = (parsed.reviews ?? []).map((review) => this.normalizeLocalReview(review)).filter((review): review is ReviewReportResult => Boolean(review));

      this.replaceFallbackReviews(reviews);

      return reviews;
    } catch {
      return fallbackReviews;
    }
  }

  private async writeLocalReviewsFile(reviews: ReviewReportResult[]) {
    const filePath = this.localReviewsFilePath();
    const normalizedReviews = this.uniqueReviews(reviews).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    this.replaceFallbackReviews(normalizedReviews);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          reviews: normalizedReviews
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeLocalReview(review: Partial<ReviewReportResult>): ReviewReportResult | null {
    if (!review.workId || !review.performanceSummary) {
      return null;
    }

    return {
      id: review.id ?? `review-${Date.now()}`,
      workId: review.workId,
      performanceSummary: review.performanceSummary,
      performanceMetrics: review.performanceMetrics,
      contentDiagnostics: review.contentDiagnostics,
      strengths: review.strengths ?? [],
      weaknesses: review.weaknesses ?? [],
      nextWritingAdvice: review.nextWritingAdvice ?? [],
      strategyLessons: review.strategyLessons ?? [],
      persisted: true,
      createdAt: review.createdAt ?? new Date().toISOString()
    };
  }

  private uniqueReviews(reviews: ReviewReportResult[]) {
    const seen = new Set<string>();

    return reviews.filter((review) => {
      if (seen.has(review.id)) {
        return false;
      }

      seen.add(review.id);
      return true;
    });
  }

  private replaceFallbackReviews(reviews: ReviewReportResult[]) {
    fallbackReviews.splice(0, fallbackReviews.length, ...reviews);
  }

  private localReviewsFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "reviews.json");
  }
}
