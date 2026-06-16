"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { createStoryQualityReport, type StoryPlan, type StoryQualityCheck } from "@shenbi/shared";
import { Badge, Card, CardHeader } from "@/components/ui";

export function QualityReportPanel({ plan }: { plan: StoryPlan }) {
  const report = plan.qualityReport ?? createStoryQualityReport(plan);

  return (
    <Card>
      <CardHeader title="质量体检" eyebrow="发布前避坑清单" action={<Badge>{report.publishReadiness}</Badge>} />
      <div className="grid gap-4 p-5 lg:grid-cols-[220px_1fr]">
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <ShieldCheck size={17} />
            综合评分
          </div>
          <p className="mt-4 text-4xl font-semibold text-ink">{report.overallScore}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{report.summary}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.checks.map((check) => (
            <QualityCheckCard key={check.id} check={check} />
          ))}
        </div>
      </div>

      <div className="border-t border-line p-5">
        <p className="text-sm font-medium text-ink">发布前边界</p>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
          {report.guardrails.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function QualityCheckCard({ check }: { check: StoryQualityCheck }) {
  const Icon = check.status === "通过" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-ink">{check.label}</p>
          <p className="mt-1 text-xs text-muted">{check.relatedScenes.length ? `关联场景：${check.relatedScenes.join("、")}` : "关联全篇"}</p>
        </div>
        <Badge className={`gap-1 ${check.status === "高风险" ? "border-ink bg-ink text-white" : check.status === "注意" ? "border-ink bg-paper text-ink" : ""}`}>
          <Icon size={13} />
          {check.status}
        </Badge>
      </div>
      <p className="text-2xl font-semibold text-ink">{check.score}</p>
      <p className="break-words text-xs leading-5 text-muted">依据：{check.evidence}</p>
      <p className="break-words rounded-md border border-line bg-paper p-3 text-xs leading-5 text-ink">改法：{check.fix}</p>
    </div>
  );
}
