"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, Feather, RefreshCw, Sparkles } from "lucide-react";
import { todayIdea, todayIdeas, trends as fallbackTrends, works as fallbackWorks } from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, GhostButton, Progress } from "@/components/ui";
import { getTrends, getWorks } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { buildWeeklyWritingProgress } from "@/lib/writing-progress";

export function HomePage() {
  const [works, setWorks] = useState(fallbackWorks);
  const [trends, setTrends] = useState(fallbackTrends);
  const [message, setMessage] = useState("正在读取后端数据。");
  const [loading, setLoading] = useState(false);
  const [ideaIndex, setIdeaIndex] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("正在刷新创作驾驶舱。");

    try {
      const [nextWorks, nextTrends] = await Promise.all([getWorks(), getTrends()]);
      setWorks(nextWorks);
      setTrends(nextTrends);
      setMessage("已读取后端作品和趋势数据。");
    } catch (error) {
      setWorks(fallbackWorks);
      setTrends(fallbackTrends);
      setMessage(error instanceof Error ? error.message : "后端暂时不可用，正在展示示例数据。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    const publishedWorks = works.filter((work) => work.completionRate > 0);

    return {
      reads: works.reduce((sum, work) => sum + work.readCount, 0),
      subscriptions: works.reduce((sum, work) => sum + work.subscriptionCount, 0),
      revenue: works.reduce((sum, work) => sum + work.revenue, 0),
      completion:
        publishedWorks.length > 0
          ? publishedWorks.reduce((sum, work) => sum + work.completionRate, 0) / publishedWorks.length
          : 0
    };
  }, [works]);
  const weeklyProgress = useMemo(() => buildWeeklyWritingProgress(works), [works]);
  const currentIdea = todayIdeas[ideaIndex % todayIdeas.length] ?? todayIdea;
  const currentIdeaHref = useMemo(() => {
    const params = new URLSearchParams({ idea: currentIdea });

    return `/inspiration?${params.toString()}`;
  }, [currentIdea]);

  const switchIdea = useCallback(() => {
    setIdeaIndex((current) => (current + 1) % todayIdeas.length);
  }, []);

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="mb-3 text-sm font-medium text-muted">创作驾驶舱</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-ink md:text-5xl">
            从一个灵感，到一篇能发布的故事。
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">专为番茄等平台打造的短篇小说创作工作台。</p>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
          AI 生成内容仅供创作参考，请结合人工编辑、原创设定与平台规范后再发布。
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <div className="mb-5 grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
              <Feather size={20} />
            </div>
            <h2 className="text-xl font-semibold">开始一篇短篇</h2>
            <p className="mt-3 min-h-16 text-sm leading-7 text-muted">输入一句方向，Agent 自动跑完选题、结构、分场正文和测试读者报告。</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["一句话输入", "十步生成", "保存到编辑器", "复盘沉淀"].map((item) => (
                <Badge key={item}>{item}</Badge>
              ))}
            </div>
            <Link href="/auto" className="mt-6 inline-flex w-full">
              <Button className="w-full">
                开始创作
                <ArrowRight size={16} />
              </Button>
            </Link>
          </Card>

          <Card className="p-6">
            <div className="mb-5 grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
              <Database size={20} />
            </div>
            <h2 className="text-xl font-semibold">导入学习素材</h2>
            <p className="mt-3 min-h-16 text-sm leading-7 text-muted">把你授权可见的作品数据、评论和趋势导入，下一篇会优先参考。</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["授权可见页", "CSV", "截图校正", "写作记忆"].map((item) => (
                <Badge key={item}>{item}</Badge>
              ))}
            </div>
            <Link href="/sources" className="mt-6 inline-flex w-full">
              <Button className="w-full">
                导入素材
                <ArrowRight size={16} />
              </Button>
            </Link>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="数据概览"
            eyebrow="今日"
            action={
              <GhostButton onClick={refresh} disabled={loading}>
                <RefreshCw size={16} />
                刷新
              </GhostButton>
            }
          />
          <p className="border-b border-line px-5 py-3 text-sm text-muted">{message}</p>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              ["阅读量", formatNumber(totals.reads), "作品库"],
              ["订阅量", formatNumber(totals.subscriptions), "作品库"],
              ["收益", formatMoney(totals.revenue), "作品库"],
              ["完读率", `${totals.completion.toFixed(1)}%`, "已发布作品"]
            ].map(([label, value, change]) => (
              <div key={label} className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-muted">{change}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader title="今日风向标推荐" action={<Link href="/trends" className="text-sm text-muted">查看全部</Link>} />
          <div className="grid gap-3 p-5">
            {trends.slice(0, 5).map((trend) => (
              <Link key={trend.id} href={autoHref(trend)} className="grid gap-3 rounded-md border border-line bg-white p-4 transition hover:border-ink md:grid-cols-[1fr_120px]">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-paper">
                    <Sparkles size={17} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{trend.genre}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{trend.reason}</p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-muted">热度</span>
                    <span className="font-medium">{trend.heat}</span>
                  </div>
                  <Progress value={trend.heat} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="作品专栏" action={<Link href="/works" className="text-sm text-muted">进入书架</Link>} />
          <div className="grid gap-4 p-5">
            {works.map((work) => (
              <div key={work.id} className="grid grid-cols-[72px_1fr] gap-4 rounded-md border border-line bg-white p-3">
                <Image src={work.cover} alt={work.title} width={72} height={104} className="h-[104px] rounded object-cover" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{work.title}</h3>
                    <Badge>{work.status === "draft" ? "草稿" : work.status === "published" ? "已发布" : "连载中"}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{work.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {work.genreTags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
                    <span>{work.wordCount.toLocaleString("zh-CN")} 字</span>
                    <span>{formatNumber(work.readCount)} 阅读</span>
                    <span>{formatMoney(work.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm text-muted">今日灵感</p>
            <p className="mt-2 break-words text-lg font-medium leading-8">{currentIdea}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <GhostButton type="button" onClick={switchIdea}>
              <RefreshCw size={16} />
              换一个灵感
            </GhostButton>
            <Link href={currentIdeaHref}>
              <Button>用这个灵感</Button>
            </Link>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium">本周创作进度</span>
            <span className="text-muted">{weeklyProgress.label}</span>
          </div>
          <Progress value={weeklyProgress.progress} />
          <p className="mt-3 text-sm leading-6 text-muted">{weeklyProgress.advice}</p>
          <Link href={weeklyProgress.href} className="mt-4 inline-flex w-full">
            <GhostButton className="w-full">
              {weeklyProgress.action}
              <ArrowRight size={16} />
            </GhostButton>
          </Link>
        </Card>
      </section>
    </div>
  );
}

function autoHref(trend: (typeof fallbackTrends)[number]) {
  const params = new URLSearchParams({
    platform: trend.platform,
    genre: trend.genre,
    note: `来自首页风向标：${trend.reason}。标签：${trend.tags.join("、") || "暂无"}。请围绕该方向生成原创短篇，不要复制热门作品桥段。`
  });

  return `/auto?${params.toString()}`;
}
