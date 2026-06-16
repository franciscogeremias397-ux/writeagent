import { Inject, Injectable } from "@nestjs/common";
import { trends as seedTrends, weeklyTrendPoints, type Trend } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";
import { cleanTrendGenre } from "./trend-cleaning.js";
import { listRuntimeTrends } from "./runtime-trends.js";

type DbTrend = {
  id: string;
  platform: string;
  genre: string;
  heat: number;
  growthRate: number;
  opportunityScore: number;
  saturationScore: number;
  reason: string;
  tags: string[];
  sourceLabel: string | null;
  sourceDetail: string | null;
  createdAt: Date;
};

@Injectable()
export class TrendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listTrends(): Promise<Trend[]> {
    try {
      await this.ensureSeedTrends();
      const dbTrends = await this.prisma.trend.findMany({
        orderBy: [{ createdAt: "desc" }, { heat: "desc" }]
      });

      return dbTrends.map((trend) => this.toTrend(trend as DbTrend));
    } catch {
      return listRuntimeTrends();
    }
  }

  async today() {
    const allTrends = await this.listTrends();

    return {
      date: new Date().toISOString().slice(0, 10),
      recommendations: allTrends.slice(0, 5)
    };
  }

  chart() {
    return weeklyTrendPoints;
  }

  analyze() {
    return {
      status: "ready",
      message: "趋势分析已能读取数据库、CSV 导入数据或本地趋势文件。"
    };
  }

  private async ensureSeedTrends() {
    const count = await this.prisma.trend.count();

    if (count > 0) {
      return;
    }

    await this.prisma.trend.createMany({
      data: seedTrends.map((trend) => ({
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
  }

  private toTrend(trend: DbTrend): Trend {
    return {
      id: trend.id,
      platform: trend.platform,
      genre: cleanTrendGenre(trend.genre),
      heat: trend.heat,
      growthRate: trend.growthRate,
      opportunityScore: trend.opportunityScore,
      saturationScore: trend.saturationScore,
      reason: trend.reason,
      tags: trend.tags,
      sourceLabel: trend.sourceLabel ?? undefined,
      sourceDetail: trend.sourceDetail ?? undefined,
      createdAt: trend.createdAt.toISOString().slice(0, 10)
    };
  }
}
