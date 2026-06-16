"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, RefreshCw, Sparkles, Target, Trophy } from "lucide-react";
import type { Trend, Work } from "@shenbi/shared";
import { Badge, Card, CardHeader, GhostButton, Progress } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { getTrends, getWorks } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";

const chartColors = ["#111111", "#77736b", "#c0a94d", "#3f6f65", "#8b5e34"];
const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink";

export function DataDashboardWorkspace({ fallbackWorks, fallbackTrends }: { fallbackWorks: Work[]; fallbackTrends: Trend[] }) {
  const [works, setWorks] = useState<Work[]>(fallbackWorks);
  const [trends, setTrends] = useState<Trend[]>(fallbackTrends);
  const [message, setMessage] = useState("已显示本地样例；正在同步后端作品和趋势数据。");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setMessage("正在刷新数据看板。");
    }

    try {
      const [nextWorks, nextTrends] = await Promise.all([getWorks(), getTrends()]);
      setWorks(nextWorks);
      setTrends(nextTrends);
      setMessage("已读取后端作品和趋势数据。");
    } catch (error) {
      setWorks(fallbackWorks);
      setTrends(fallbackTrends);
      setMessage(error instanceof Error ? `${error.message}；已显示本地样例。` : "后端暂时不可用，已显示本地样例。");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [fallbackTrends, fallbackWorks]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const totals = useMemo(() => {
    const totalReads = works.reduce((sum, work) => sum + work.readCount, 0);
    const totalSubscriptions = works.reduce((sum, work) => sum + work.subscriptionCount, 0);
    const totalRevenue = works.reduce((sum, work) => sum + work.revenue, 0);
    const publishedWorks = works.filter((work) => work.completionRate > 0 || work.readCount > 0 || work.revenue > 0);
    const averageCompletion =
      publishedWorks.length > 0
        ? publishedWorks.reduce((sum, work) => sum + work.completionRate, 0) / publishedWorks.length
        : 0;

    return {
      totalReads,
      totalSubscriptions,
      totalRevenue,
      averageCompletion,
      topTrend: trends[0]?.genre ?? "暂无"
    };
  }, [trends, works]);

  const tagScores = useMemo(() => buildTagScores(works, trends), [trends, works]);
  const chart = useMemo(() => buildChart(trends.slice(0, 5)), [trends]);
  const rankedWorks = useMemo(() => [...works].sort((left, right) => right.revenue - left.revenue).slice(0, 5), [works]);
  const platformBreakdowns = useMemo(() => buildPlatformBreakdowns(trends), [trends]);
  const activityCalendar = useMemo(() => buildActivityCalendar(trends), [trends]);
  const opportunityPerformance = useMemo(() => buildOpportunityPerformance(trends, works), [trends, works]);
  const highPerformanceWorks = useMemo(() => buildHighPerformanceWorks(works), [works]);
  const sceneDropOffInsights = useMemo(() => buildSceneDropOffInsights(works), [works]);
  const genrePerformance = useMemo(() => buildGenrePerformance(works), [works]);
  const completionRisks = useMemo(() => buildCompletionRisks(works), [works]);
  const datePerformance = useMemo(() => buildDatePerformance(works), [works]);
  const commentInsights = useMemo(() => buildCommentInsights(works), [works]);
  const reviewQueue = useMemo(() => buildReviewQueue(works), [works]);

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="总阅读量" value={formatNumber(totals.totalReads)} change="来自作品库" />
        <MetricCard label="总订阅量" value={formatNumber(totals.totalSubscriptions)} change="来自作品库" />
        <MetricCard label="总收益" value={formatMoney(totals.totalRevenue)} change="来自作品库" />
        <MetricCard label="平均完读率" value={`${totals.averageCompletion.toFixed(1)}%`} change="已发布作品" />
        <MetricCard label="当前强势赛道" value={totals.topTrend} change="来自趋势接口" />
      </section>

      <Card>
        <CardHeader title="复盘队列" eyebrow="优先处理发布表现和读者反馈" action={<AlertTriangle size={18} className="text-muted" />} />
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {reviewQueue.map((item) => (
            <div key={item.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">{item.metric}</p>
                </div>
                <Badge>{item.badge}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{item.reason}</p>
              <Link className={`${linkButtonClass} mt-4 w-full`} href={`/review?workId=${encodeURIComponent(item.id)}`}>
                进入复盘
                <ArrowRight size={16} />
              </Link>
            </div>
          ))}
          {reviewQueue.length === 0 ? <EmptyNote>暂时没有需要优先复盘的作品。</EmptyNote> : null}
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="平台风向数据"
            action={
              <GhostButton onClick={() => refresh()} disabled={loading}>
                <RefreshCw size={16} />
                刷新
              </GhostButton>
            }
          />
          <p className="border-b border-line px-5 py-3 text-sm text-muted">{message}</p>
          <div className="p-5">
            <TrendChart data={chart.data} series={chart.series} />
          </div>
        </Card>

        <Card>
          <CardHeader title="自己作品排行" />
          <div className="grid gap-3 p-5">
            {rankedWorks.map((work) => (
              <div key={work.id} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{work.title}</span>
                  <span className="text-sm text-muted">{formatMoney(work.revenue)}</span>
                </div>
                <div className="mt-3">
                  <Progress value={work.completionRate || 36} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...work.genreTags, ...work.styleTags].slice(0, 4).map((tag, index) => (
                    <Badge key={`${tag}-${index}`}>{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader title="平台榜单拆解" eyebrow="只学习结构，不复用原文设定" action={<Trophy size={18} className="text-muted" />} />
          <div className="grid gap-3 p-5">
            {platformBreakdowns.map((item) => (
              <div key={item.key} className="grid gap-4 rounded-md border border-line bg-white p-4 xl:grid-cols-[86px_1fr_1fr]">
                <div>
                  <Badge>TOP {item.rank}</Badge>
                  <p className="mt-3 text-sm text-muted">热度 {item.heat}</p>
                </div>
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-sm leading-6 text-muted">
                  <p>开篇：{item.opening}</p>
                  <p>冲突：{item.conflict}</p>
                  <p>可学：{item.learn}</p>
                  <p>避开：{item.avoid}</p>
                </div>
              </div>
            ))}
            {platformBreakdowns.length === 0 ? <EmptyNote>导入公开榜单或趋势数据后，这里会拆解可学习结构。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="活动/征文窗口" eyebrow="把平台方向转成发布节奏" action={<CalendarDays size={18} className="text-muted" />} />
          <div className="grid gap-3 p-5">
            {activityCalendar.map((item) => (
              <div key={item.key} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.genre}</p>
                    <p className="mt-1 text-sm text-muted">{item.platform}</p>
                  </div>
                  <Badge>{item.window}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{item.direction}</p>
                <p className="mt-2 text-xs leading-5 text-muted">建议动作：{item.action}</p>
              </div>
            ))}
            {activityCalendar.length === 0 ? <EmptyNote>导入活动页、征文方向或趋势数据后，这里会出现可跟进窗口。</EmptyNote> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="题材机会卡表现" eyebrow="同时看平台机会和自己历史表现" action={<Target size={18} className="text-muted" />} />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {opportunityPerformance.map((item) => (
              <div key={item.key} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.genre}</p>
                    <p className="mt-1 text-xs text-muted">{item.relatedWorks} 部相关作品</p>
                  </div>
                  <Badge>{item.score.toFixed(0)}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                  <p>平台热度：{item.heat}</p>
                  <p>历史完读：{item.averageCompletion.toFixed(1)}%</p>
                  <p>历史收益：{formatMoney(item.revenue)}</p>
                  <p>下一步：{item.action}</p>
                </div>
                <Link href={opportunityAutoHref(item)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80">
                  <Sparkles size={16} />
                  用这个机会写下一篇
                </Link>
              </div>
            ))}
            {opportunityPerformance.length === 0 ? <EmptyNote>还没有足够数据计算题材机会表现。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="高完读/高收益作品拆解" eyebrow="把表现好的作品转成下一篇可复用经验" />
          <div className="grid gap-3 p-5">
            {highPerformanceWorks.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      阅读 {formatNumber(item.readCount)} · 收益 {formatMoney(item.revenue)} · 完读 {item.completionRate.toFixed(1)}%
                    </p>
                  </div>
                  <Badge>{item.signal}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                  <p>可复用：{item.strength}</p>
                  <p>别照搬：{item.warning}</p>
                  <p>下一篇用法：{item.nextUse}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Link className={linkButtonClass} href={`/review?workId=${encodeURIComponent(item.id)}`}>
                    复盘这部作品
                    <ArrowRight size={16} />
                  </Link>
                  <Link className={linkButtonClass} href={workAutoHref(item)}>
                    基于它写下一篇
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            ))}
            {highPerformanceWorks.length === 0 ? <EmptyNote>导入发布表现后，这里会拆解高完读或高收益作品。</EmptyNote> : null}
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="章节/场景流失点" eyebrow="用完读率和评论反馈推测最该复查的位置" action={<AlertTriangle size={18} className="text-muted" />} />
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {sceneDropOffInsights.map((item) => (
            <div key={item.id} className="rounded-md border border-line bg-paper p-4">
              <p className="font-medium text-ink">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">疑似流失点：{item.likelyPoint}</p>
              <p className="mt-2 text-xs leading-5 text-muted">依据：{item.evidence}</p>
              <p className="mt-2 text-xs leading-5 text-muted">处理：{item.fix}</p>
            </div>
          ))}
          {sceneDropOffInsights.length === 0 ? <EmptyNote>目前没有足够数据判断流失点。</EmptyNote> : null}
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-4">
        <Card>
          <CardHeader title="赛道收益对比" eyebrow="按作品主赛道汇总" />
          <div className="grid gap-4 p-5">
            {genrePerformance.map((item) => (
              <div key={item.genre}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.genre}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.workCount} 部作品 · 阅读 {formatNumber(item.reads)} · 订阅 {formatNumber(item.subscriptions)}
                    </p>
                  </div>
                  <span className="text-sm font-medium">{formatMoney(item.revenue)}</span>
                </div>
                <div className="mt-3">
                  <Progress value={item.revenueShare} />
                </div>
                <p className="mt-2 text-xs text-muted">平均完读率 {item.averageCompletion.toFixed(1)}%</p>
              </div>
            ))}
            {genrePerformance.length === 0 ? <EmptyNote>还没有可分析的作品表现。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="完读率观察" eyebrow="优先复盘低完读作品" />
          <div className="grid gap-4 p-5">
            {completionRisks.map((work) => (
              <div key={work.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{work.title}</p>
                    <p className="mt-1 text-xs text-muted">{work.reason}</p>
                  </div>
                  <Badge>{work.completionRate.toFixed(1)}%</Badge>
                </div>
                <div className="mt-3">
                  <Progress value={work.completionRate} />
                </div>
              </div>
            ))}
            {completionRisks.length === 0 ? <EmptyNote>暂时没有明显的完读率风险。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="创建/导入日期表现" eyebrow="用于粗看发布时间窗口" />
          <div className="grid gap-4 p-5">
            {datePerformance.map((item) => (
              <div key={item.label}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.label}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.workCount} 部作品 · 阅读 {formatNumber(item.reads)}
                    </p>
                  </div>
                  <span className="text-sm font-medium">{formatMoney(item.revenue)}</span>
                </div>
                <div className="mt-3">
                  <Progress value={item.revenueShare} />
                </div>
              </div>
            ))}
            {datePerformance.length === 0 ? <EmptyNote>还没有创建或导入日期数据。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="评论关键词" eyebrow="来自导入作品反馈" />
          <div className="grid gap-4 p-5">
            {commentInsights.map((item) => (
              <div key={item.keyword} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.keyword}</p>
                    <p className="mt-1 text-xs text-muted">{item.sample}</p>
                  </div>
                  <Badge>{item.count} 次</Badge>
                </div>
              </div>
            ))}
            {commentInsights.length === 0 ? <EmptyNote>导入作品表现时带上评论反馈后，这里会显示高频读者声音。</EmptyNote> : null}
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="标签表现" />
        <div className="grid gap-3 p-5 md:grid-cols-4">
          {tagScores.map((item) => (
            <div key={item.tag} className="rounded-md border border-line bg-white p-4">
              <p className="text-sm text-muted">{item.tag}</p>
              <p className="mt-2 text-2xl font-semibold">{item.score.toFixed(1)}</p>
              <p className="mt-2 text-xs text-muted">{item.source}</p>
            </div>
          ))}
          {tagScores.length === 0 ? <EmptyNote>还没有可计算的标签表现。</EmptyNote> : null}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 break-words text-2xl font-semibold leading-tight">{value}</p>
      <p className="mt-2 text-sm text-muted">{change}</p>
    </Card>
  );
}

function EmptyNote({ children }: { children: string }) {
  return <p className="rounded-md border border-line bg-paper px-4 py-3 text-sm text-muted">{children}</p>;
}

function buildTagScores(works: Work[], trends: Trend[]) {
  const scores = new Map<string, { score: number; source: string }>();

  trends.forEach((trend) => {
    scores.set(trend.genre, { score: trend.opportunityScore, source: "趋势机会分" });
    trend.tags.forEach((tag) => {
      if (!scores.has(tag)) {
        scores.set(tag, { score: Math.max(60, trend.heat - trend.saturationScore / 3), source: "趋势标签" });
      }
    });
  });

  works.forEach((work) => {
    [...work.genreTags, ...work.styleTags].forEach((tag) => {
      if (!scores.has(tag)) {
        scores.set(tag, { score: work.completionRate || 36, source: "作品标签" });
      }
    });
  });

  return Array.from(scores.entries())
    .map(([tag, value]) => ({ tag, ...value }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function buildGenrePerformance(works: Work[]) {
  const groups = new Map<
    string,
    { genre: string; workCount: number; reads: number; subscriptions: number; revenue: number; completionTotal: number; completionCount: number }
  >();

  works
    .filter((work) => work.readCount > 0 || work.revenue > 0 || work.completionRate > 0)
    .forEach((work) => {
      const genre = work.genreTags[0] ?? "未标注赛道";
      const current =
        groups.get(genre) ??
        { genre, workCount: 0, reads: 0, subscriptions: 0, revenue: 0, completionTotal: 0, completionCount: 0 };

      current.workCount += 1;
      current.reads += work.readCount;
      current.subscriptions += work.subscriptionCount;
      current.revenue += work.revenue;
      if (work.completionRate > 0) {
        current.completionTotal += work.completionRate;
        current.completionCount += 1;
      }
      groups.set(genre, current);
    });

  const rows = Array.from(groups.values()).sort((left, right) => right.revenue - left.revenue);
  const maxRevenue = Math.max(...rows.map((item) => item.revenue), 1);

  return rows.slice(0, 5).map((item) => ({
    ...item,
    averageCompletion: item.completionCount > 0 ? item.completionTotal / item.completionCount : 0,
    revenueShare: (item.revenue / maxRevenue) * 100
  }));
}

function buildCompletionRisks(works: Work[]) {
  return works
    .filter((work) => work.completionRate > 0 && (work.readCount > 0 || work.revenue > 0))
    .sort((left, right) => left.completionRate - right.completionRate)
    .slice(0, 4)
    .map((work) => ({
      id: work.id,
      title: work.title,
      completionRate: work.completionRate,
      reason:
        work.completionRate < 60
          ? "完读率偏低，建议优先检查开头钩子、中段重复和情绪释放。"
          : work.completionRate < 70
            ? "完读率有提升空间，可以复盘中段节奏和结尾爽点。"
            : "表现尚可，适合继续观察同赛道后续数据。"
    }));
}

function buildReviewQueue(works: Work[]) {
  return works
    .map((work) => {
      const hasPerformance = work.readCount > 0 || work.subscriptionCount > 0 || work.revenue > 0 || work.completionRate > 0;
      const hasFeedback = Boolean(work.commentFeedback?.trim() || work.commentKeywords?.length);
      const reasons: string[] = [];
      let priority = 0;

      if (hasFeedback) {
        priority += 35;
        reasons.push("已有读者反馈，适合沉淀为写作记忆和个人策略。");
      }

      if (work.completionRate > 0 && work.completionRate < 70) {
        priority += 40;
        reasons.push("完读率偏低，优先检查开头钩子、中段节奏和结尾兑现。");
      }

      if (hasPerformance && !hasFeedback) {
        priority += 30;
        reasons.push("已有表现数据，建议补充评论反馈后做一次完整复盘。");
      }

      if (work.status === "published" && !hasPerformance) {
        priority += 25;
        reasons.push("已发布但还没有录入表现，适合先补阅读、收益和完读率。");
      }

      if (work.revenue > 100 || work.completionRate >= 70) {
        priority += 20;
        reasons.push("表现较好，可以提炼下一篇可复用经验。");
      }

      return {
        id: work.id,
        title: work.title,
        badge: reviewQueueBadge(work, hasFeedback, hasPerformance),
        metric: reviewQueueMetric(work),
        reason: reasons[0] ?? "数据已经更新，建议做一次发布后复盘。",
        priority
      };
    })
    .filter((item) => item.priority > 0)
    .sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, 4);
}

function reviewQueueBadge(work: Work, hasFeedback: boolean, hasPerformance: boolean) {
  if (work.completionRate > 0 && work.completionRate < 70) {
    return "完读风险";
  }

  if (hasFeedback) {
    return "有反馈";
  }

  if (work.revenue > 100 || work.completionRate >= 70) {
    return "可复用";
  }

  if (hasPerformance) {
    return "待复盘";
  }

  return "待录入";
}

function reviewQueueMetric(work: Work) {
  const metrics = [
    work.readCount > 0 ? `阅读 ${formatNumber(work.readCount)}` : "",
    work.revenue > 0 ? `收益 ${formatMoney(work.revenue)}` : "",
    work.completionRate > 0 ? `完读 ${work.completionRate.toFixed(1)}%` : ""
  ].filter(Boolean);

  if (metrics.length > 0) {
    return metrics.join(" · ");
  }

  return work.status === "published" ? "已发布，等待录入表现" : "草稿作品，可在发布后复盘";
}

function buildPlatformBreakdowns(trends: Trend[]) {
  return trends.slice(0, 5).map((trend, index) => ({
    key: `${index}-${trend.id || trend.platform}-${trend.genre}`,
    rank: index + 1,
    heat: trend.heat,
    title: `《${trend.genre}榜单样本》`,
    tags: trend.tags.slice(0, 4),
    summary: `${trend.platform} 当前${trend.genre}热度较高，核心看点集中在${trend.tags.slice(0, 2).join("、") || "强钩子和情绪兑现"}。`,
    opening: trend.growthRate > 8 ? "高压场面 + 立即抛问题" : "生活细节 + 关系错位",
    conflict: trend.saturationScore > 65 ? "换人物关系，避免同款冲突" : "主角目标清楚，对手逐步加码",
    learn: "节奏分段、钩子密度、反转位置。",
    avoid: "不要复用原文桥段、人名和完整设定。"
  }));
}

function buildActivityCalendar(trends: Trend[]) {
  return trends.slice(0, 4).map((trend, index) => ({
    key: `${index}-${trend.id || trend.platform}-${trend.genre}`,
    genre: trend.genre,
    platform: trend.platform,
    window: index === 0 ? "本周" : index === 1 ? "下周" : "本月",
    direction:
      trend.growthRate > 8
        ? `${trend.genre}正在升温，适合先用短篇测试一个强钩子切口。`
        : `${trend.genre}有稳定基础盘，适合做一篇更克制、更生活化的差异化稿。`,
    action:
      trend.saturationScore > 65
        ? "先写题材反套路清单，再生成选题卡。"
        : "先做 5-8 场景短篇骨架，再进入正文。"
  }));
}

function buildOpportunityPerformance(trends: Trend[], works: Work[]) {
  return trends.slice(0, 6).map((trend, index) => {
    const relatedWorks = works.filter((work) => [work.genreTags, work.styleTags].flat().some((tag) => tag === trend.genre || trend.tags.includes(tag)));
    const averageCompletion =
      relatedWorks.length > 0
        ? relatedWorks.reduce((sum, work) => sum + work.completionRate, 0) / relatedWorks.length
        : 0;
    const revenue = relatedWorks.reduce((sum, work) => sum + work.revenue, 0);
    const historyBonus = relatedWorks.length > 0 ? Math.min(12, averageCompletion / 8) : 0;
    const score = Math.max(0, Math.min(100, trend.opportunityScore - trend.saturationScore / 5 + historyBonus));

    return {
      key: `${index}-${trend.id || trend.platform}-${trend.genre}`,
      genre: trend.genre,
      platform: trend.platform,
      tags: trend.tags,
      heat: trend.heat,
      saturationScore: trend.saturationScore,
      relatedWorks: relatedWorks.length,
      averageCompletion,
      revenue,
      score,
      action:
        relatedWorks.length === 0
          ? "没有历史样本，适合先写小体量测试。"
          : averageCompletion < 65
            ? "历史完读偏低，先修开头钩子和中段重复。"
            : "历史表现可用，适合延续题材但换人物关系。"
    };
  }).sort((left, right) => right.score - left.score).slice(0, 4);
}

function buildHighPerformanceWorks(works: Work[]) {
  return works
    .filter((work) => work.readCount > 0 || work.revenue > 0 || work.completionRate > 0)
    .map((work) => {
      const tags = [...work.genreTags, ...work.styleTags];
      const signal = work.completionRate >= 70 ? "高完读" : work.revenue > 100 ? "高收益" : "可复盘";

      return {
        id: work.id,
        title: work.title,
        readCount: work.readCount,
        revenue: work.revenue,
        completionRate: work.completionRate,
        signal,
        platform: work.platform,
        genre: work.genreTags[0] ?? "通用",
        tags,
        strength: tags.includes("人味细节") || tags.includes("现实质感") ? "生活细节能托住情绪，适合继续强化真实感。" : "题材标签清晰，读者能快速理解看点。",
        warning: tags.includes("强钩子") ? "不要只复制悬念外壳，要换掉谜题和人物动机。" : "不要复用同一个家庭压迫或身份反转套路。",
        nextUse: work.completionRate < 65 ? "保留题材，下一篇先缩短铺垫。" : "保留情绪路径，换场景和人物关系。"
      };
    })
    .sort((left, right) => right.completionRate + right.revenue / 20 - (left.completionRate + left.revenue / 20))
    .slice(0, 3);
}

function buildSceneDropOffInsights(works: Work[]) {
  return works
    .filter((work) => work.readCount > 0 || work.revenue > 0 || work.completionRate > 0 || work.commentFeedback)
    .sort((left, right) => left.completionRate - right.completionRate)
    .slice(0, 3)
    .map((work) => {
      const feedback = work.commentFeedback ?? "";
      const likelyPoint = feedback.includes("中段") || feedback.includes("节奏慢") || work.completionRate < 65 ? "第 3-4 场，中段推进" : "结尾前一场，情绪兑现";

      return {
        id: work.id,
        title: work.title,
        likelyPoint,
        evidence: work.commentFeedback ? work.commentFeedback : `完读率 ${work.completionRate.toFixed(1)}%，需要结合场景卡复查。`,
        fix:
          likelyPoint.includes("中段")
            ? "删掉重复争执，让每场都带来新证据、新代价或新选择。"
            : "提前埋情绪线索，让结尾释放更自然。"
      };
    });
}

function buildDatePerformance(works: Work[]) {
  const groups = new Map<string, { label: string; workCount: number; reads: number; revenue: number }>();

  works
    .filter((work) => work.createdAt)
    .forEach((work) => {
      const label = weekdayLabel(work.createdAt);
      const current = groups.get(label) ?? { label, workCount: 0, reads: 0, revenue: 0 };

      current.workCount += 1;
      current.reads += work.readCount;
      current.revenue += work.revenue;
      groups.set(label, current);
    });

  const rows = Array.from(groups.values()).sort((left, right) => right.revenue - left.revenue);
  const maxRevenue = Math.max(...rows.map((item) => item.revenue), 1);

  return rows.slice(0, 5).map((item) => ({
    ...item,
    revenueShare: (item.revenue / maxRevenue) * 100
  }));
}

function buildCommentInsights(works: Work[]) {
  const groups = new Map<string, { keyword: string; count: number; sample: string }>();

  works.forEach((work) => {
    const keywords = work.commentKeywords?.length ? work.commentKeywords : keywordsFromFeedback(work.commentFeedback);

    keywords.forEach((keyword) => {
      const current = groups.get(keyword) ?? {
        keyword,
        count: 0,
        sample: work.commentFeedback ? `${work.title}：${work.commentFeedback}` : `${work.title} 的评论关键词`
      };

      current.count += 1;
      groups.set(keyword, current);
    });
  });

  return Array.from(groups.values())
    .sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, "zh-CN"))
    .slice(0, 6);
}

function keywordsFromFeedback(feedback?: string) {
  if (!feedback) {
    return [];
  }

  const stopWords = new Set(["这个", "真的", "感觉", "作者", "读者", "评论", "反馈", "有点", "还是", "不是", "没有", "可以", "但是", "就是", "非常", "比较"]);

  return Array.from(feedback.matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/gu))
    .map((match) => match[0])
    .filter((keyword) => !stopWords.has(keyword))
    .slice(0, 8);
}

function weekdayLabel(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  if (Number.isNaN(date.getTime())) {
    return "未知日期";
  }

  return labels[date.getDay()] ?? "未知日期";
}

function buildChart(trends: Trend[]) {
  const genreCounts = trends.reduce((counts, trend) => counts.set(trend.genre, (counts.get(trend.genre) ?? 0) + 1), new Map<string, number>());
  const series = trends.map((trend, index) => ({
    key: `trend-${index}-${trend.id || trend.genre}`,
    label: (genreCounts.get(trend.genre) ?? 0) > 1 ? `${trend.genre} · ${trend.platform}` : trend.genre,
    color: chartColors[index] ?? "#111111"
  }));
  const data = Array.from({ length: 7 }, (_, index) => {
    const daysAgo = 6 - index;
    const row: { day: string } & Record<string, number | string> = { day: formatTrendDay(trends[0]?.createdAt, daysAgo) };

    trends.forEach((trend, trendIndex) => {
      const baseline = trend.heat - trend.growthRate * (daysAgo / 6);
      const texture = ((trendIndex + index) % 3) * 0.8;
      row[series[trendIndex]?.key ?? trend.genre] = Number(Math.max(30, Math.min(100, baseline + texture)).toFixed(1));
    });

    return row;
  });

  return {
    data: data.length > 0 ? data : [{ day: "今日" }],
    series
  };
}

function formatTrendDay(createdAt: string | undefined, daysAgo: number) {
  const base = createdAt ? new Date(`${createdAt}T00:00:00`) : new Date();
  base.setDate(base.getDate() - daysAgo);

  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");

  return `${month}-${day}`;
}

function opportunityAutoHref(item: { platform: string; genre: string; tags: string[]; action: string; saturationScore: number }) {
  const params = new URLSearchParams({
    platform: item.platform,
    genre: item.genre,
    note: `来自数据看板题材机会：${item.action}。标签：${item.tags.join("、") || "暂无"}。同质化风险 ${item.saturationScore}，请保留机会方向，但更换人物关系、场景物件和反转桥段。`
  });

  return `/auto?${params.toString()}`;
}

function workAutoHref(item: { title: string; platform: string; genre: string; tags: string[]; signal: string; strength: string; warning: string; nextUse: string }) {
  const params = new URLSearchParams({
    platform: item.platform,
    genre: item.genre,
    note: `来自数据看板高表现作品《${item.title}》：${item.signal}。可复用：${item.strength} 下一篇用法：${item.nextUse} 必须避开：${item.warning} 请换新的主角、关系、场景物件和反转，不要复刻原作品。标签：${item.tags.join("、") || "暂无"}。`
  });

  return `/auto?${params.toString()}`;
}
