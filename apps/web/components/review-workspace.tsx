"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Brain, ChartColumn, CheckCircle2, ListChecks, Sparkles } from "lucide-react";
import type { ReviewReportResult, Work } from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, Progress } from "@/components/ui";
import { createReviewReport, getReviewReport, getWorks } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";

const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink";

export function ReviewWorkspace({ fallbackWorks, initialWorkId = "" }: { fallbackWorks: Work[]; initialWorkId?: string }) {
  const [works, setWorks] = useState<Work[]>(fallbackWorks);
  const [selectedWorkId, setSelectedWorkId] = useState(() => (fallbackWorks.some((work) => work.id === initialWorkId) ? initialWorkId : fallbackWorks[0]?.id ?? ""));
  const [report, setReport] = useState<ReviewReportResult | null>(null);
  const [readCount, setReadCount] = useState(String(fallbackWorks[0]?.readCount ?? 0));
  const [subscriptionCount, setSubscriptionCount] = useState(String(fallbackWorks[0]?.subscriptionCount ?? 0));
  const [revenue, setRevenue] = useState(String(fallbackWorks[0]?.revenue ?? 0));
  const [completionRate, setCompletionRate] = useState(String(fallbackWorks[0]?.completionRate ?? 0));
  const [rankingChange, setRankingChange] = useState("暂无明显变化");
  const [recommendationChange, setRecommendationChange] = useState("暂无导入数据");
  const [commentFeedback, setCommentFeedback] = useState("读者喜欢克制反击，但希望中段少一点解释。");
  const [commentKeywords, setCommentKeywords] = useState("");
  const [message, setMessage] = useState("正在读取最近一次复盘。");
  const [loading, setLoading] = useState(false);
  const initialWorkIdRef = useRef(initialWorkId);

  const selectedWork = useMemo(() => works.find((work) => work.id === selectedWorkId) ?? works[0], [selectedWorkId, works]);

  useEffect(() => {
    let alive = true;

    getWorks()
      .then((result) => {
        if (!alive) {
          return;
        }

        setWorks(result);
        setSelectedWorkId((current) => {
          if (initialWorkIdRef.current && result.some((work) => work.id === initialWorkIdRef.current)) {
            return initialWorkIdRef.current;
          }

          return current && result.some((work) => work.id === current) ? current : result[0]?.id ?? "";
        });
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkId) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("workId") === selectedWorkId) {
      return;
    }

    url.searchParams.set("workId", selectedWorkId);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedWorkId]);

  useEffect(() => {
    if (!selectedWork) {
      return;
    }

    setReadCount(String(selectedWork.readCount));
    setSubscriptionCount(String(selectedWork.subscriptionCount));
    setRevenue(String(selectedWork.revenue));
    setCompletionRate(String(selectedWork.completionRate));
    setRankingChange("暂无明显变化");
    setRecommendationChange("暂无导入数据");
    setCommentFeedback(selectedWork.commentFeedback ?? "读者喜欢克制反击，但希望中段少一点解释。");
    setCommentKeywords(selectedWork.commentKeywords?.join("、") ?? "");
    setMessage("正在读取最近一次复盘。");
    getReviewReport(selectedWork.id)
      .then((result) => {
        setReport(result);
        setMessage(result.persisted ? "已读取保存过的复盘报告。" : "还没有保存过的复盘报告，正在展示一份预览。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "复盘服务暂时不可用。");
      });
  }, [selectedWork]);

  const handleCreateReview = async () => {
    if (!selectedWork) {
      return;
    }

    setLoading(true);
    setMessage("正在生成复盘报告，并整理成写作记忆和个人策略。");

    try {
      const result = await createReviewReport(selectedWork.id, {
        readCount: parseNumericInput(readCount),
        subscriptionCount: parseNumericInput(subscriptionCount),
        revenue: parseNumericInput(revenue),
        completionRate: parseNumericInput(completionRate),
        rankingChange,
        recommendationChange,
        commentFeedback,
        commentKeywords: splitKeywords(commentKeywords)
      });
      setReport(result);
      setWorks((current) =>
        current.map((work) =>
          work.id === selectedWork.id
            ? {
                ...work,
                readCount: result.performanceMetrics?.readCount ?? parseNumericInput(readCount),
                subscriptionCount: result.performanceMetrics?.subscriptionCount ?? parseNumericInput(subscriptionCount),
                revenue: result.performanceMetrics?.revenue ?? parseNumericInput(revenue),
                completionRate: result.performanceMetrics?.completionRate ?? parseNumericInput(completionRate),
                commentFeedback: result.performanceMetrics?.commentFeedback ?? commentFeedback,
                commentKeywords: splitKeywords(commentKeywords)
              }
            : work
        )
      );
      setMessage(result.persisted ? "复盘报告已保存，并已沉淀到写作记忆库和个人策略库。" : "复盘报告已生成，并已沉淀到写作记忆库和个人策略库。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成复盘失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  if (!selectedWork) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted">还没有可复盘的作品。</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="复盘报告"
        action={
          <select
            className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
            value={selectedWorkId}
            onChange={(event) => setSelectedWorkId(event.target.value)}
          >
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-5 p-5 xl:grid-cols-[360px_1fr]">
        <div className="grid gap-4">
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="text-sm font-medium">{selectedWork.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{selectedWork.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...selectedWork.genreTags, ...selectedWork.styleTags].map((tag, index) => (
                <Badge key={`${tag}-${index}`}>{tag}</Badge>
              ))}
            </div>
          </div>

          <section className="grid gap-3 rounded-md border border-line bg-white p-4">
            <p className="text-sm font-medium">发布表现录入</p>
            <div className="grid gap-3">
              <NumberField label="阅读量" value={readCount} onChange={setReadCount} />
              <NumberField label="订阅量" value={subscriptionCount} onChange={setSubscriptionCount} />
              <NumberField label="收益" value={revenue} onChange={setRevenue} />
              <NumberField label="完读率" value={completionRate} onChange={setCompletionRate} suffix="%" />
              <TextField label="排名变化" value={rankingChange} onChange={setRankingChange} />
              <TextField label="推荐量变化" value={recommendationChange} onChange={setRecommendationChange} />
              <TextField label="评论关键词" value={commentKeywords} onChange={setCommentKeywords} />
            </div>
          </section>

          <Metric label="阅读量" value={formatNumber(parseNumericInput(readCount))} progress={Math.min(96, parseNumericInput(readCount) / 18000)} />
          <Metric label="订阅量" value={formatNumber(parseNumericInput(subscriptionCount))} progress={Math.min(96, parseNumericInput(subscriptionCount) / 2400)} />
          <Metric label="收益" value={formatMoney(parseNumericInput(revenue))} progress={Math.min(96, parseNumericInput(revenue) / 5)} />
          <Metric label="完读率" value={`${parseNumericInput(completionRate)}%`} progress={parseNumericInput(completionRate)} />

          <label className="grid gap-2 text-sm font-medium">
            评论反馈
            <textarea
              className="min-h-24 rounded-md border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-ink"
              value={commentFeedback}
              onChange={(event) => setCommentFeedback(event.target.value)}
            />
          </label>

          <Button onClick={handleCreateReview} disabled={loading}>
            <Sparkles size={16} />
            {loading ? "生成中" : "生成复盘"}
          </Button>
          {report ? (
            <div className="grid gap-2">
              <Link className={linkButtonClass} href={nextStoryLink(selectedWork, report)}>
                用复盘写下一篇
                <ArrowRight size={16} />
              </Link>
              <Link className={linkButtonClass} href="/memory#writing-memory-library">
                查看写作记忆
                <Brain size={16} />
              </Link>
              <Link className={linkButtonClass} href="/memory#personal-strategy-library">
                查看个人策略库
                <ListChecks size={16} />
              </Link>
              <Link className={linkButtonClass} href="/dashboard">
                查看数据看板
                <ChartColumn size={16} />
              </Link>
            </div>
          ) : null}
          <p className="text-sm leading-6 text-muted">{message}</p>
        </div>

        <div className="grid gap-5">
          {report ? (
            <>
              {report.performanceMetrics ? (
                <section className="grid gap-3 md:grid-cols-3">
                  <MetricCard label="阅读量" value={formatNumber(report.performanceMetrics.readCount)} />
                  <MetricCard label="订阅量" value={formatNumber(report.performanceMetrics.subscriptionCount ?? 0)} />
                  <MetricCard label="收益" value={formatMoney(report.performanceMetrics.revenue)} />
                  <MetricCard label="完读率" value={`${report.performanceMetrics.completionRate}%`} />
                  <MetricCard label="排名变化" value={report.performanceMetrics.rankingChange || "未填写"} />
                  <MetricCard label="推荐量变化" value={report.performanceMetrics.recommendationChange || "未填写"} />
                  <MetricCard label="评论反馈" value={report.performanceMetrics.commentFeedback || "未填写"} compact />
                </section>
              ) : null}

              <section className="rounded-md border border-line bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">内容表现判断</p>
                  <Badge>{report.persisted ? "已保存" : "预览报告"}</Badge>
                </div>
                <p className="text-sm leading-7 text-muted">{report.performanceSummary}</p>
              </section>

              {report.contentDiagnostics?.length ? (
                <section className="rounded-md border border-line bg-white p-4">
                  <p className="font-medium">内容维度诊断</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {report.contentDiagnostics.map((item) => (
                      <div key={item.label} className="rounded-md border border-line bg-paper p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-ink">{item.label}</p>
                            <p className="mt-2 text-sm leading-6 text-muted">{item.judgement}</p>
                          </div>
                          <Badge>{item.score}</Badge>
                        </div>
                        <div className="mt-3">
                          <Progress value={item.score} />
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted">依据：{item.evidence}</p>
                        <p className="mt-2 text-xs leading-5 text-muted">处理：{item.action}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <ReviewBlock title="做得好的地方" items={report.strengths} />
              <ReviewBlock title="需要注意的地方" items={report.weaknesses} />
              <ReviewBlock title="下一篇创作建议" items={report.nextWritingAdvice} />
              <ReviewBlock title="经验沉淀" items={report.strategyLessons} />
            </>
          ) : (
            <section className="rounded-md border border-line bg-white p-4">
              <p className="text-sm leading-6 text-muted">复盘报告读取中。</p>
            </section>
          )}
        </div>
      </div>
    </Card>
  );
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: string; suffix?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <div className="flex items-center rounded-md border border-line bg-white px-3 focus-within:border-ink">
        <input
          className="h-10 min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="text-xs text-muted">{suffix}</span> : null}
      </div>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-ink"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
      <Progress value={progress} />
    </div>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 break-words font-semibold text-ink ${compact ? "text-sm leading-6" : "text-xl leading-tight"}`}>{value}</p>
    </div>
  );
}

function ReviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <p className="font-medium">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2">
            <CheckCircle2 size={16} className="mt-1 shrink-0 text-ink" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function nextStoryLink(work: Work, report: ReviewReportResult) {
  const params = new URLSearchParams({
    platform: work.platform,
    genre: work.genreTags[0] ?? "女性成长",
    note: nextStoryNote(work, report)
  });

  return `/auto?${params.toString()}`;
}

function nextStoryNote(work: Work, report: ReviewReportResult) {
  const advice = report.nextWritingAdvice.slice(0, 4).join("；");
  const lessons = report.strategyLessons.slice(0, 3).join("；");
  const keywords = work.commentKeywords?.length ? `评论关键词：${work.commentKeywords.slice(0, 5).join("、")}。` : "";

  return `基于《${work.title}》复盘生成下一篇。${keywords}下一篇建议：${advice}。复用策略：${lessons}。请保留有效写法，但更换具体人物关系、场景物件和反转桥段，避免复刻原作品。`;
}

function parseNumericInput(value: string) {
  const normalized = Number(value.replace(/[^\d.]/g, ""));

  return Number.isFinite(normalized) ? normalized : 0;
}

function splitKeywords(value: string) {
  return Array.from(new Set(value.split(/[、,，\s]+/u).map((item) => item.trim()).filter(Boolean))).slice(0, 8);
}
