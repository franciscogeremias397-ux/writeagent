"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import type { Trend } from "@shenbi/shared";
import { Badge, Card, CardHeader, GhostButton, Progress } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { getTrends } from "@/lib/api";

const chartColors = ["#111111", "#77736b", "#c0a94d", "#3f6f65", "#8b5e34"];

export function TrendsWorkspace({ fallbackTrends }: { fallbackTrends: Trend[] }) {
  const [trends, setTrends] = useState<Trend[]>(fallbackTrends);
  const [message, setMessage] = useState("已显示本地趋势样例；正在同步后端和导入数据。");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setMessage("正在刷新风向数据。");
    }

    try {
      const result = await getTrends();
      setTrends(result);
      setMessage("已读取后端趋势数据；CSV 导入的题材会出现在这里。");
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}；已显示本地趋势样例。` : "趋势服务暂时不可用，已显示本地趋势样例。");
      setTrends(fallbackTrends);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [fallbackTrends]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const topTrends = trends.slice(0, 5);
  const opportunityTrends = trends.slice(0, 3);
  const chart = useMemo(() => buildChart(topTrends), [topTrends]);
  const leaderboardBreakdowns = useMemo(() => buildLeaderboardBreakdowns(topTrends), [topTrends]);
  const riskWarnings = useMemo(() => buildRiskWarnings(trends), [trends]);
  const activityCalendar = useMemo(() => buildActivityCalendar(topTrends), [topTrends]);

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="热度趋势"
            eyebrow="后端趋势数据"
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
          <CardHeader title="今日热门赛道" />
          <div className="grid gap-3 p-5">
            {topTrends.map((trend) => (
              <div key={trend.id} className="rounded-md border border-line bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{trend.genre}</span>
                  <Badge>{trend.heat}</Badge>
                </div>
                <Progress value={trend.heat} />
                <p className="mt-3 text-sm leading-6 text-muted">{trend.reason}</p>
                {trend.sourceLabel ? <p className="mt-2 text-xs leading-5 text-muted">来源：{sourceText(trend)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {trend.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="活动/征文日历"
            eyebrow="把公开活动方向转成选题窗口"
            action={<CalendarDays size={18} className="text-muted" />}
          />
          <div className="grid gap-3 p-5">
            {activityCalendar.map((item) => (
              <div key={`${item.platform}-${item.genre}`} className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[120px_1fr]">
                <div>
                  <Badge>{item.window}</Badge>
                  <p className="mt-3 text-sm text-muted">{item.platform}</p>
                </div>
                <div>
                  <p className="font-medium text-ink">{item.genre}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.direction}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">投稿侧重点：{item.focus}</p>
                </div>
              </div>
            ))}
            {activityCalendar.length === 0 ? <EmptyNote>导入公开活动或趋势数据后，这里会出现可跟进的创作窗口。</EmptyNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="风险提醒" eyebrow="选题前先避开同质化和水化风险" action={<ShieldAlert size={18} className="text-muted" />} />
          <div className="grid gap-3 p-5">
            {riskWarnings.map((warning) => (
              <div key={warning.title} className="rounded-md border border-line bg-paper p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-1 shrink-0 text-ink" />
                  <div>
                    <p className="font-medium text-ink">{warning.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{warning.detail}</p>
                    <p className="mt-2 text-xs leading-5 text-muted">建议：{warning.action}</p>
                  </div>
                </div>
              </div>
            ))}
            {riskWarnings.length === 0 ? <EmptyNote>暂时没有明显风险。</EmptyNote> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {opportunityTrends.map((trend) => (
          <Card key={trend.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">题材机会卡</p>
                <h2 className="mt-2 text-xl font-semibold">{trend.genre}</h2>
              </div>
              <Badge>推荐 {trend.opportunityScore}</Badge>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-muted">
              <p>推荐理由：{trend.reason}</p>
              <p>主角设定：带现实压力的普通人，最好有一个明确的身份缺口。</p>
              <p>核心冲突：资源被夺走、真相被误解、主角亲手完成反击。</p>
              <p>爽点：{opportunitySatisfaction(trend)}</p>
              <p>人味细节：{humanDetail(trend)}</p>
              <p>适合篇幅：{recommendedLength(trend)}</p>
              <p>同质化风险：{trend.saturationScore}%</p>
              {trend.sourceLabel ? <p>数据来源：{sourceText(trend)}</p> : null}
            </div>
            <Link
              href={autoHref(trend)}
              className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80"
            >
              <Sparkles size={16} />
              用这个方向生成
            </Link>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader title="榜单作品拆解" eyebrow="只学习结构，不复制原文和完整设定" action={<Badge>参考方向</Badge>} />
        <div className="grid gap-3 p-5">
          {leaderboardBreakdowns.map((item) => (
            <div key={item.id} className="grid gap-4 rounded-md border border-line bg-white p-4 xl:grid-cols-[92px_1fr_1fr_1fr]">
              <div>
                <Badge>TOP {item.rank}</Badge>
                <p className="mt-3 text-sm text-muted">热度 {item.heat}</p>
              </div>
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.synopsis}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="text-sm leading-6 text-muted">
                <p>开篇方式：{item.opening}</p>
                <p>冲突模式：{item.conflict}</p>
                <p>情绪曲线：{item.emotionalCurve}</p>
                <p>反转方式：{item.reversal}</p>
              </div>
              <div className="text-sm leading-6 text-muted">
                <p>可学习点：{item.learn}</p>
                <p>避免复制点：{item.avoid}</p>
              </div>
            </div>
          ))}
          {leaderboardBreakdowns.length === 0 ? <EmptyNote>导入榜单或趋势数据后，这里会生成作品拆解。</EmptyNote> : null}
        </div>
      </Card>
    </div>
  );
}

function sourceText(trend: Trend) {
  return [trend.sourceLabel, trend.sourceDetail].filter(Boolean).join(" · ");
}

function autoHref(trend: Trend) {
  const params = new URLSearchParams({
    platform: trend.platform,
    genre: trend.genre,
    note: `来自风向标：${trend.reason}。标签：${trend.tags.join("、") || "暂无"}。同质化风险 ${trend.saturationScore}，请保留优势但不要复制热门作品桥段。`
  });

  return `/auto?${params.toString()}`;
}

function opportunitySatisfaction(trend: Trend) {
  if (trend.tags.some((tag) => tag.includes("反转") || tag.includes("反击"))) {
    return "主角在证据、身份或资源上完成克制反击，让读者看到被压住后的翻盘。";
  }

  if (trend.genre.includes("甜") || trend.tags.some((tag) => tag.includes("甜"))) {
    return "关系推进里给出小承诺、小误会和明确偏爱，避免只靠撒糖堆密度。";
  }

  return "每一场都给主角一个可见收获，让读者知道故事在向结局推进。";
}

function humanDetail(trend: Trend) {
  if (trend.genre.includes("女性") || trend.tags.some((tag) => tag.includes("现实"))) {
    return "房租、工作排班、亲戚饭局、旧手机这类生活细节，比空泛豪门设定更抓人。";
  }

  if (trend.genre.includes("悬疑") || trend.tags.some((tag) => tag.includes("钩子"))) {
    return "把异常藏在日常物件里，例如门禁记录、外卖小票、旧合照。";
  }

  return "让主角的选择带一点现实成本，例如钱、名声、关系或时间。";
}

function recommendedLength(trend: Trend) {
  if (trend.heat >= 94 && trend.saturationScore <= 55) {
    return "8000 字到 1.5 万字，适合完整兑现反转和情绪释放。";
  }

  if (trend.saturationScore >= 65) {
    return "3000 到 8000 字，先用短篇测试差异化角度。";
  }

  return "8000 字左右，保留 5 到 8 个清晰场景。";
}

function buildActivityCalendar(trends: Trend[]) {
  return trends.slice(0, 4).map((trend, index) => ({
    platform: trend.platform,
    genre: trend.genre,
    window: index === 0 ? "本周" : index === 1 ? "下周" : "本月",
    direction: `${trend.genre}仍有热度，适合围绕“${trend.tags[0] ?? "强钩子"}”做一个原创短篇角度。`,
    focus:
      trend.saturationScore > 60
        ? "避开常见人设模板，优先提交开篇差异和反转设计。"
        : "突出情绪曲线、人物动机和结尾兑现。"
  }));
}

function buildRiskWarnings(trends: Trend[]) {
  const saturated = [...trends].sort((left, right) => right.saturationScore - left.saturationScore)[0];
  const topTrend = trends[0];
  const repeatedTag = mostCommonTag(trends);
  const warnings: Array<{ title: string; detail: string; action: string }> = [];

  if (saturated) {
    warnings.push({
      title: `${saturated.genre}同质化风险`,
      detail: `当前饱和度约 ${saturated.saturationScore}%，容易写成相似人设、相似开篇和相似反转。`,
      action: "保留情绪需求，替换人物职业、关系压力和关键物件。"
    });
  }

  if (topTrend) {
    warnings.push({
      title: "平台疲劳题材",
      detail: `${topTrend.genre}热度高，但连续追同一套路会让读者提前猜到结局。`,
      action: "在第 2 场放一个非模板选择，第 5 场再兑现真正反转。"
    });
  }

  if (repeatedTag) {
    warnings.push({
      title: "近期不建议重复写的套路",
      detail: `“${repeatedTag}”出现频率较高，继续照搬容易显得像同一篇故事换名字。`,
      action: "只借用节奏，不复用桥段、人物名字、完整关系和原文表达。"
    });
  }

  warnings.push({
    title: "内容水化风险",
    detail: "短篇最怕用解释、回忆和空泛独白拖过关键场景。",
    action: "每 800 到 1200 字至少安排一次行动、冲突升级或信息揭示。"
  });

  return warnings.slice(0, 4);
}

function mostCommonTag(trends: Trend[]) {
  const counts = new Map<string, number>();

  trends.forEach((trend) => {
    trend.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
}

function buildLeaderboardBreakdowns(trends: Trend[]) {
  return trends.slice(0, 5).map((trend, index) => ({
    id: trend.id,
    rank: index + 1,
    heat: trend.heat,
    title: `《${trend.genre}热榜样本 ${index + 1}》`,
    tags: trend.tags.length ? trend.tags.slice(0, 4) : [trend.genre],
    synopsis: `一个${trend.genre}方向的公开榜单样本，核心看点集中在${trend.tags.slice(0, 2).join("、") || "强钩子和情绪兑现"}。`,
    opening: index % 2 === 0 ? "压迫场面 + 物件钩子 + 可追问题" : "日常失衡 + 关系误解 + 轻反转",
    conflict: trend.saturationScore > 60 ? "外部压力先升级，再用人物选择破局" : "主角目标清晰，对手不断抬高代价",
    emotionalCurve: trend.growthRate > 10 ? "快钩子、快压迫、中段反击、结尾释放" : "铺垫、误解、选择、反转、余韵",
    reversal: trend.tags.some((tag) => tag.includes("身份")) ? "身份信息延迟揭开" : "把读者以为的弱点改成主角的筹码",
    learn: "节奏分段、冲突递进、反转位置和结尾情绪释放。",
    avoid: "不要复用原文桥段、人物名字、完整设定或具体表达。"
  }));
}

function EmptyNote({ children }: { children: string }) {
  return <p className="rounded-md border border-line bg-paper px-4 py-3 text-sm text-muted">{children}</p>;
}

function buildChart(trends: Trend[]) {
  const series = trends.slice(0, 5).map((trend, index) => ({
    key: trend.genre,
    color: chartColors[index] ?? "#111111"
  }));
  const data = Array.from({ length: 7 }, (_, index) => {
    const daysAgo = 6 - index;
    const row: { day: string } & Record<string, number | string> = { day: formatTrendDay(trends[0]?.createdAt, daysAgo) };

    trends.slice(0, 5).forEach((trend, trendIndex) => {
      const baseline = trend.heat - trend.growthRate * (daysAgo / 6);
      const texture = ((trendIndex + index) % 3) * 0.8;
      row[trend.genre] = Number(Math.max(30, Math.min(100, baseline + texture)).toFixed(1));
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
