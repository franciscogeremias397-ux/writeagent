"use client";

import type { AgentTraceStep, StoryPlan } from "@shenbi/shared";
import { Badge } from "@/components/ui";

type Props = {
  plan: StoryPlan;
  compact?: boolean;
};

export function AgentTracePanel({ plan, compact = false }: Props) {
  const trace = plan.agentTrace?.length ? plan.agentTrace : fallbackTrace(plan.agentSteps);

  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-ink">Agent 调度轨迹</p>
        <Badge>{trace.length} 步</Badge>
      </div>
      <div className={compact ? "mt-3 grid gap-2" : "mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {trace.map((step) => (
          <div key={step.id} className="rounded-md border border-line bg-white p-3 text-xs leading-5 text-muted">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-medium text-ink">
                {step.order}. {step.agent}
              </span>
              <Badge>{step.status === "done" ? "完成" : "等待"}</Badge>
            </div>
            <p className="text-ink">{step.role}</p>
            <p className="mt-2">输入：{step.input}</p>
            <p>产出：{step.output}</p>
            {!compact ? <p>交接：{step.handoff}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function fallbackTrace(steps: string[] = []): AgentTraceStep[] {
  return steps.map((step, index) => ({
    id: `trace-fallback-${index + 1}`,
    order: index + 1,
    agent: agentName(step),
    role: step,
    input: "来自旧版写作方案。",
    output: "已完成该阶段产出。",
    handoff: "继续交给下一步。",
    status: "done"
  }));
}

function agentName(step: string) {
  return step.match(/^(.+?Agent)/u)?.[1] ?? step;
}
