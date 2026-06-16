"use client";

import { AlertTriangle, CheckCircle2, Fingerprint, RefreshCw } from "lucide-react";
import { createStoryOriginalityReport, type StoryOriginalityCheck, type StoryPlan } from "@shenbi/shared";
import { Badge, Card, CardHeader } from "@/components/ui";

export function OriginalityReportPanel({ plan }: { plan: StoryPlan }) {
  const report = plan.originalityReport ?? createStoryOriginalityReport(plan);

  return (
    <Card>
      <CardHeader title="原创边界" eyebrow="学习结构，不复制桥段" action={<Badge>{report.riskLevel}风险</Badge>} />
      <div className="grid gap-4 p-5 lg:grid-cols-[220px_1fr]">
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Fingerprint size={17} />
            原创分
          </div>
          <p className="mt-4 text-4xl font-semibold text-ink">{report.originalityScore}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{report.verdict}</p>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <BoundaryList title="可学习点" items={report.learningPoints} />
            <BoundaryList title="避免复制点" items={report.avoidCopyPoints} />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {report.checks.map((check) => (
              <OriginalityCheckCard key={check.id} check={check} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-line p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <RefreshCw size={15} />
          下一轮原创化动作
        </p>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
          {report.rewriteActions.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function BoundaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function OriginalityCheckCard({ check }: { check: StoryOriginalityCheck }) {
  const Icon = check.riskLevel === "低" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-ink">{check.label}</p>
          <p className="mt-1 text-xs text-muted">{check.relatedScenes.length ? `关联场景：${check.relatedScenes.join("、")}` : "关联全篇"}</p>
        </div>
        <Badge className={check.riskLevel === "高" ? "gap-1 border-ink bg-ink text-white" : check.riskLevel === "中" ? "gap-1 border-ink bg-paper text-ink" : "gap-1"}>
          <Icon size={13} />
          {check.riskLevel}风险
        </Badge>
      </div>
      <p className="break-words text-xs leading-5 text-muted">依据：{check.evidence}</p>
      <p className="break-words text-xs leading-5 text-muted">学习：{check.learnFrom}</p>
      <p className="break-words text-xs leading-5 text-muted">避开：{check.avoidCopy}</p>
      <p className="break-words rounded-md border border-line bg-paper p-3 text-xs leading-5 text-ink">改法：{check.rewriteAction}</p>
    </div>
  );
}
