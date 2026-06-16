"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Brain, CheckCircle2, Lock, PenLine, RefreshCw, Save } from "lucide-react";
import {
  createStoryContinuityMemory,
  createStoryOriginalityReport,
  createStoryQualityReport,
  storyWorkflowAgentOrder,
  validateStoryWorkflow,
  type StoryPlan,
  type Work,
  type WorkspaceExportResult
} from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, GhostButton } from "@/components/ui";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { ContinuityMemoryPanel } from "@/components/continuity-memory-panel";
import { OriginalityReportPanel } from "@/components/originality-report-panel";
import { QualityReportPanel } from "@/components/quality-report-panel";
import { reviseSceneDraft, saveStoryPlan } from "@/lib/api";

const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink";

const stages = [
  { id: "topics", label: "确认选题" },
  { id: "emotional", label: "情绪曲线" },
  { id: "conflict", label: "冲突阶梯" },
  { id: "information", label: "信息差" },
  { id: "characters", label: "人物卡" },
  { id: "scenes", label: "场景卡" },
  { id: "prompts", label: "场景提示词" },
  { id: "sceneDrafts", label: "分场正文" },
  { id: "reader", label: "读者评审" },
  { id: "revision", label: "修订建议" }
] as const;

type StageId = (typeof stages)[number]["id"];

function assembleDraft(sceneDrafts: StoryPlan["sceneDrafts"]) {
  return sceneDrafts.map((scene) => `【场景${scene.index}：${scene.title}】\n${scene.text}`).join("\n\n");
}

export function PlanResult({
  plan,
  mode,
  onRegenerateWithTopic
}: {
  plan: StoryPlan;
  mode?: string;
  onRegenerateWithTopic?: (topicId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [workingPlan, setWorkingPlan] = useState(plan);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedWork, setSavedWork] = useState<Work | null>(null);
  const [savedWorkspaceExport, setSavedWorkspaceExport] = useState<WorkspaceExportResult | null>(null);
  const [initialEditorMarkCount, setInitialEditorMarkCount] = useState(0);
  const [activeStage, setActiveStage] = useState<StageId>("topics");
  const [confirmedStageIndex, setConfirmedStageIndex] = useState(-1);
  const [refiningTopicId, setRefiningTopicId] = useState<string | null>(null);
  const [refineMessage, setRefineMessage] = useState("");
  const [sceneFeedback, setSceneFeedback] = useState<Record<string, string>>({});
  const [sceneMessage, setSceneMessage] = useState("");
  const [revisingSceneId, setRevisingSceneId] = useState<string | null>(null);
  const nextStageAfterPlanRefresh = useRef<StageId | null>(null);
  const stepMode = mode === "步步确认";
  const currentStageIndex = stages.findIndex((stage) => stage.id === activeStage);
  const highestUnlockedStageIndex = stepMode ? Math.min(stages.length - 1, confirmedStageIndex + 1) : stages.length - 1;
  const canSave = !stepMode || confirmedStageIndex >= stages.length - 1;

  const shouldShow = (stage: StageId) => !stepMode || activeStage === stage;

  useEffect(() => {
    const nextStage = nextStageAfterPlanRefresh.current ?? "topics";
    const nextStageIndex = stages.findIndex((stage) => stage.id === nextStage);

    setWorkingPlan(plan);
    setSavedWork(null);
    setSavedWorkspaceExport(null);
    setInitialEditorMarkCount(0);
    setSaveMessage("");
    setSceneMessage("");
    setSceneFeedback({});
    setActiveStage(nextStage);
    setConfirmedStageIndex(nextStageIndex > 0 ? nextStageIndex - 1 : -1);
    nextStageAfterPlanRefresh.current = null;
  }, [plan]);

  async function handleSave(options: { confirmAll?: boolean; openEditor?: boolean } = {}) {
    if (options.openEditor && savedWork) {
      router.push(`/editor?workId=${encodeURIComponent(savedWork.id)}`);
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      if (options.confirmAll) {
        setConfirmedStageIndex(stages.length - 1);
        setActiveStage("revision");
      }

      const result = await saveStoryPlan(workingPlan);
      setSavedWork(result.work);
      setSavedWorkspaceExport(result.workspaceExport ?? null);
      setInitialEditorMarkCount(result.initialEditorMarks?.length ?? 0);
      setSaveMessage(result.message);

      if (options.openEditor) {
        router.push(`/editor?workId=${encodeURIComponent(result.work.id)}`);
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "保存失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerateWithTopic(topicId: string) {
    if (!onRegenerateWithTopic) {
      return;
    }

    setRefiningTopicId(topicId);
    setRefineMessage("");
    nextStageAfterPlanRefresh.current = "emotional";

    try {
      await onRegenerateWithTopic(topicId);
      setRefineMessage("已按你选中的选题重新生成后续结构。");
    } catch (error) {
      nextStageAfterPlanRefresh.current = null;
      setRefineMessage(error instanceof Error ? error.message : "按选题重生成失败，请稍后再试。");
    } finally {
      setRefiningTopicId(null);
    }
  }

  async function handleReviseScene(scene: StoryPlan["sceneDrafts"][number]) {
    const scenePrompt = workingPlan.scenePrompts.find((prompt) => prompt.sceneId === scene.sceneId);

    setRevisingSceneId(scene.id);
    setSceneMessage("");

    try {
      const revised = await reviseSceneDraft({
        sceneDraft: scene,
        scenePrompt,
        feedback: sceneFeedback[scene.id]
      });

      setWorkingPlan((current) => {
        const sceneDrafts = current.sceneDrafts.map((item) => (item.id === scene.id ? revised : item));
        const readerReport = {
          ...current.readerReport,
          suggestions: [`场景 ${revised.index} 已按反馈重写，下一步重点：${revised.revisionFocus}`, ...current.readerReport.suggestions].slice(0, 8)
        };

        return {
          ...current,
          sceneDrafts,
          draft: assembleDraft(sceneDrafts),
          readerReport,
          qualityReport: createStoryQualityReport({
            ...current,
            sceneDrafts,
            readerReport
          }),
          originalityReport: createStoryOriginalityReport({
            ...current,
            readerReport
          }),
          continuityMemory: createStoryContinuityMemory({
            ...current,
            sceneDrafts
          })
        };
      });
      setSceneMessage(`场景 ${revised.index} 已重写。${revised.providerNotice ?? ""}`);
    } catch (error) {
      setSceneMessage(error instanceof Error ? error.message : "单场重写失败，请稍后再试。");
    } finally {
      setRevisingSceneId(null);
    }
  }

  function goPreviousStage() {
    setActiveStage(stages[Math.max(0, currentStageIndex - 1)].id);
  }

  function goNextStage() {
    const nextConfirmedStageIndex = Math.max(confirmedStageIndex, currentStageIndex);

    setConfirmedStageIndex(nextConfirmedStageIndex);
    setActiveStage(stages[Math.min(stages.length - 1, currentStageIndex + 1)].id);
  }

  function activateStage(stage: StageId, index: number) {
    if (index > highestUnlockedStageIndex) {
      return;
    }

    setActiveStage(stage);
  }

  function actionLabel() {
    if (currentStageIndex !== stages.length - 1) {
      return "确认并继续";
    }

    return "确认修订建议";
  }

  const viewPlan = workingPlan;
  const workflowAudit = buildWorkflowAudit(viewPlan);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title={viewPlan.title}
          eyebrow="生成结果"
          action={
            <div className="flex flex-wrap gap-2">
              {savedWork ? (
                <>
                  <Link className={linkButtonClass} href={`/works/${encodeURIComponent(savedWork.id)}`}>
                    <BookOpen size={16} />
                    作品详情
                  </Link>
                  <Link className={linkButtonClass} href={`/editor?workId=${encodeURIComponent(savedWork.id)}`}>
                    <PenLine size={16} />
                    打开编辑器
                  </Link>
                </>
              ) : null}
              {stepMode && !canSave ? <Badge>待确认 {Math.max(0, confirmedStageIndex + 1)}/{stages.length}</Badge> : null}
              <Button onClick={() => handleSave()} disabled={isSaving || !canSave}>
                <Save size={16} />
                {stepMode && !canSave ? "完成确认后保存" : isSaving ? "保存中..." : savedWork ? "重新保存" : "保存为作品"}
              </Button>
            </div>
          }
        />
        <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm leading-7 text-muted">{viewPlan.topicJudgement}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {viewPlan.providerMode ? (
                <Badge className={viewPlan.providerMode === "openai" ? "border-ink text-ink" : undefined}>
                  {viewPlan.providerMode === "openai" ? "真实 AI" : viewPlan.providerMode === "fallback" ? "已回退" : "模拟内核"}
                </Badge>
              ) : null}
              {viewPlan.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
            {viewPlan.providerNotice ? <p className="mt-3 text-xs leading-5 text-muted">{viewPlan.providerNotice}</p> : null}
            <div className="mt-3">
              <AgentTracePanel plan={viewPlan} compact />
            </div>
            {viewPlan.learningBasis ? <LearningBasisCard basis={viewPlan.learningBasis} /> : null}
            {viewPlan.memoryUsed?.length ? (
              <div className="mt-3 rounded-md border border-line bg-paper p-3">
                <p className="text-xs font-medium text-ink">本次参考的写作记忆 / 个人策略</p>
                <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                  {viewPlan.memoryUsed.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {saveMessage ? (
              <div className="mt-3 rounded-md border border-line bg-paper p-3 text-sm text-muted">
                <p>{saveMessage}</p>
                {savedWork ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link className="inline-flex items-center gap-1 font-medium text-ink hover:underline" href={`/editor?workId=${encodeURIComponent(savedWork.id)}`}>
                      <PenLine size={15} />
                      继续改正文
                    </Link>
                    <Link className="inline-flex items-center gap-1 font-medium text-ink hover:underline" href={`/memory`}>
                      <Brain size={15} />
                      查看写作记忆库
                    </Link>
                  </div>
                ) : null}
                {initialEditorMarkCount ? (
                  <p className="mt-2 text-xs leading-5 text-muted">
                    编辑器已预置 {initialEditorMarkCount} 个待改标记，打开后可直接生成局部改稿。
                  </p>
                ) : null}
                {savedWorkspaceExport ? (
                  <div className="mt-3 rounded-md border border-line bg-white p-3">
                    <p className="text-xs font-medium text-ink">本地工程包已同步</p>
                    <p className="mt-1 break-all text-xs leading-5 text-muted">{savedWorkspaceExport.path}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">先打开“先看我.md”，里面会按顺序带你看正文、大纲、场景卡、提示词、测试读者报告和修订建议。</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="text-sm font-medium text-ink">可发布简介</p>
            <p className="mt-2 text-sm leading-7 text-muted">{viewPlan.synopsis}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Agent 工作流校验"
          eyebrow="核心写作链路"
          action={
            <Badge className={workflowAudit.ok ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]" : "border-[#f0c7a8] bg-[#fff7ed] text-[#9a4d13]"}>
              {workflowAudit.ok ? "可以进入编辑" : "需要处理"}
            </Badge>
          }
        />
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workflowAudit.items.map((item) => (
              <WorkflowAuditItem key={item.label} item={item} />
            ))}
          </div>
          {workflowAudit.problems.length ? (
            <div className="rounded-md border border-line bg-paper p-4">
              <p className="text-sm font-medium text-ink">需要处理</p>
              <ul className="mt-2 grid gap-1 text-sm leading-6 text-muted">
                {workflowAudit.problems.map((problem) => (
                  <li key={problem}>- {problem}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-md border border-line bg-paper p-4 text-sm leading-6 text-muted">
              主控 Agent 已按顺序调度；选题、结构、人物、场景、提示词、分场正文、测试读者和修订建议都已生成。整篇正文可以追溯到分场正文。
            </p>
          )}
          {workflowAudit.ok ? (
            <div className="flex flex-wrap justify-end gap-2">
              <GhostButton onClick={() => handleSave({ confirmAll: true })} disabled={isSaving}>
                <CheckCircle2 size={16} />
                {isSaving ? "保存中..." : savedWork ? "重新保存" : "确认全部并保存"}
              </GhostButton>
              <Button onClick={() => handleSave({ confirmAll: true, openEditor: true })} disabled={isSaving}>
                <PenLine size={16} />
                {savedWork ? "打开编辑器" : isSaving ? "保存中..." : "保存并打开编辑器"}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {stepMode ? (
        <Card>
          <CardHeader title="步步确认" eyebrow="阶段工作流" action={<Badge>已确认 {Math.max(0, confirmedStageIndex + 1)}/{stages.length}</Badge>} />
          <div className="grid gap-4 p-5">
            <div className="grid gap-2 md:grid-cols-5 xl:grid-cols-10">
              {stages.map((stage, index) => {
                const confirmed = index <= confirmedStageIndex;
                const unlocked = index <= highestUnlockedStageIndex;

                return (
                <button
                  key={stage.id}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    activeStage === stage.id ? "border-ink bg-ink text-white" : confirmed ? "border-line bg-paper text-ink" : "border-line bg-white text-muted"
                  }`}
                  onClick={() => activateStage(stage.id, index)}
                  disabled={!unlocked}
                >
                  {confirmed ? <CheckCircle2 size={15} /> : unlocked ? null : <Lock size={15} />}
                  {stage.label}
                </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <GhostButton onClick={goPreviousStage} disabled={currentStageIndex === 0}>
                <ArrowLeft size={16} />
                上一步
              </GhostButton>
              <GhostButton onClick={goNextStage} disabled={currentStageIndex === stages.length - 1 && confirmedStageIndex >= stages.length - 1}>
                {actionLabel()}
                <ArrowRight size={16} />
              </GhostButton>
            </div>
          </div>
        </Card>
      ) : null}

      {shouldShow("topics") ? (
        <div className="grid gap-5 xl:grid-cols-3">
          {viewPlan.topicCards.map((topic) => {
            const selected = topic.id === viewPlan.selectedTopic.id;

            return (
          <Card key={topic.id} className={`p-5 ${selected ? "border-ink" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold">{topic.title}</h3>
              <Badge>{selected ? "当前采用" : topic.recommendationScore}</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">{topic.hook}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <p>
                <span className="text-muted">核心冲突：</span>
                {topic.conflict}
              </p>
              <p>
                <span className="text-muted">反转点：</span>
                {topic.reversal}
              </p>
              <p>
                <span className="text-muted">同质化风险：</span>
                {topic.samenessRisk}
              </p>
            </div>
            {onRegenerateWithTopic && !selected ? (
              <Button className="mt-4 w-full" onClick={() => handleRegenerateWithTopic(topic.id)} disabled={Boolean(refiningTopicId)}>
                {refiningTopicId === topic.id ? "正在重生成..." : "用这个选题生成后续"}
              </Button>
            ) : null}
          </Card>
            );
          })}
          {refineMessage ? <p className="xl:col-span-3 rounded-md border border-line bg-paper p-3 text-sm text-muted">{refineMessage}</p> : null}
        </div>
      ) : null}

      {shouldShow("emotional") ? (
        <Card>
          <CardHeader title="情绪曲线" />
          <div className="grid gap-3 p-5">
            {viewPlan.emotionalCurve.map((beat) => (
              <div key={beat.stage} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{beat.stage}</span>
                  <Badge>{beat.emotion}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{beat.releasePoint}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {shouldShow("conflict") ? (
        <Card>
          <CardHeader title="冲突阶梯" />
          <div className="grid gap-3 p-5">
            {viewPlan.conflictLadder.map((step) => (
              <div key={step.level} className="rounded-md border border-line bg-white p-4 text-sm leading-7">
                <p className="font-medium">第 {step.level} 级：{step.event}</p>
                <p className="text-muted">代价：{step.cost}</p>
                <p className="text-muted">作用：{step.purpose}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {shouldShow("information") ? (
        <Card>
          <CardHeader title="信息差设计" />
          <div className="grid gap-3 p-5 text-sm leading-7">
            {[
              ["读者知道", viewPlan.informationGap.readerKnows],
              ["主角知道", viewPlan.informationGap.protagonistKnows],
              ["反派不知道", viewPlan.informationGap.antagonistMisses],
              ["揭示时机", viewPlan.informationGap.revealTiming],
              ["爽点回收", viewPlan.informationGap.payoff]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-line bg-white p-4">
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-2 text-ink">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {shouldShow("characters") ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader title="人物卡" eyebrow={`${viewPlan.characters.length} 个关键人物`} />
            <div className="grid gap-3 p-5">
              {viewPlan.characters.map((character) => (
                <div key={character.id} className="rounded-md border border-line bg-white p-4 text-sm leading-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{character.name}</h3>
                    <Badge>{character.role}</Badge>
                  </div>
                  <p className="mt-3 text-muted">性格：{character.personality}</p>
                  <p className="text-muted">背景：{character.background}</p>
                  <p className="text-muted">欲望：{character.desire}</p>
                  <p className="text-muted">恐惧：{character.fear}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="人物关系" eyebrow="结构 Agent" />
            <div className="grid gap-3 p-5 text-sm leading-7">
              {viewPlan.characters.map((character) => (
                <div key={`${character.id}-relation`} className="rounded-md border border-line bg-paper p-4">
                  <p className="font-medium text-ink">{character.name}</p>
                  <p className="mt-2 text-muted">{character.relationNotes}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {shouldShow("scenes") ? (
        <Card>
          <CardHeader title="场景卡" eyebrow="默认 6 张" />
          <div className="grid gap-3 p-5">
            {viewPlan.sceneCards.map((scene) => (
              <div key={scene.id} className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-[120px_1fr]">
                <div>
                  <p className="text-xs text-muted">场景 {scene.index}</p>
                  <h3 className="mt-1 font-semibold">{scene.title}</h3>
                </div>
                <div className="text-sm leading-7 text-muted">
                  <p>{scene.goal}</p>
                  <p>主角想要：{scene.protagonistWant}</p>
                  <p>阻碍：{scene.obstacle}</p>
                  <p>钩子：{scene.hook}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {shouldShow("prompts") ? (
        <Card>
        <CardHeader title="场景写作提示词" eyebrow="提示词 Agent" />
        <div className="grid gap-3 p-5">
          {viewPlan.scenePrompts.map((prompt) => (
            <details key={prompt.id} className="rounded-md border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                场景 {prompt.index}：{prompt.title}
              </summary>
              <div className="mt-3 grid gap-3 text-sm leading-7 text-muted">
                <p>{prompt.objective}</p>
                <p>{prompt.context}</p>
                <div className="rounded-md border border-line bg-paper p-3 text-ink">{prompt.writingPrompt}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-medium text-ink">必须包含</p>
                    <ul className="mt-2 grid gap-1">
                      {prompt.mustInclude.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-ink">避免</p>
                    <ul className="mt-2 grid gap-1">
                      {prompt.avoid.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>
      ) : null}

      {shouldShow("sceneDrafts") ? (
        <div className="grid gap-5">
          <Card>
            <CardHeader title="分场正文" eyebrow="正文 Agent 按场景逐段生成" />
            <div className="p-5">
              <div className="max-h-[520px] overflow-auto rounded-md border border-line bg-white p-5 text-sm leading-8 text-ink whitespace-pre-wrap">{viewPlan.draft}</div>
            </div>
          </Card>
          <Card>
            <CardHeader title="分场正文与小评审" eyebrow="正文 Agent 逐场生成" />
            <div className="grid gap-3 p-5">
              {sceneMessage ? <p className="rounded-md border border-line bg-paper p-3 text-sm text-muted">{sceneMessage}</p> : null}
              {viewPlan.sceneDrafts.map((scene) => (
                <details key={scene.id} className="rounded-md border border-line bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    场景 {scene.index}：{scene.title} · {scene.qualityScore} 分
                  </summary>
                  <div className="mt-3 grid gap-3 text-sm leading-7 text-muted lg:grid-cols-[1fr_280px]">
                    <div className="whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-ink">{scene.text}</div>
                    <div className="grid content-start gap-3">
                      <div className="rounded-md border border-line bg-paper p-3">
                        <p className="text-xs text-muted">目标字数</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{scene.wordTarget}</p>
                      </div>
                      <div className="rounded-md border border-line bg-paper p-3">
                        <p className="text-xs text-muted">本场评分</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{scene.qualityScore}</p>
                      </div>
                      <div>
                        <p className="font-medium text-ink">读者提醒</p>
                        <ul className="mt-2 grid gap-1">
                          {scene.readerNotes.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-ink">下一轮修改</p>
                        <p className="mt-2">{scene.revisionFocus}</p>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-ink" htmlFor={`scene-feedback-${scene.id}`}>
                          重写这一场
                        </label>
                        <textarea
                          id={`scene-feedback-${scene.id}`}
                          className="min-h-24 resize-y rounded-md border border-line bg-white p-3 text-sm leading-6 text-ink outline-none focus:border-ink"
                          placeholder="例如：让母亲的压迫更真实，少一点解释，多一点动作"
                          value={sceneFeedback[scene.id] ?? ""}
                          onChange={(event) => setSceneFeedback((current) => ({ ...current, [scene.id]: event.target.value }))}
                        />
                        <GhostButton className="w-full" onClick={() => handleReviseScene(scene)} disabled={revisingSceneId === scene.id}>
                          <RefreshCw size={16} />
                          {revisingSceneId === scene.id ? "正在重写..." : "只重写本场"}
                        </GhostButton>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {shouldShow("reader") ? (
        <div className="grid gap-5">
          <Card>
            <CardHeader title="测试读者报告" />
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  ["开头", viewPlan.readerReport.openingScore],
                  ["代入", viewPlan.readerReport.empathyScore],
                  ["情绪", viewPlan.readerReport.emotionScore],
                  ["反转", viewPlan.readerReport.reversalScore],
                  ["闭环", viewPlan.readerReport.closureScore],
                  ["平台适配", viewPlan.readerReport.platformFitScore]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-line bg-paper p-4">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 text-sm leading-7">
                <div>
                  <p className="font-medium">主要问题</p>
                  <ul className="mt-2 grid gap-1 text-muted">
                    {viewPlan.readerReport.problems.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">同质化风险</p>
                  <p className="mt-2 text-muted">{viewPlan.readerReport.samenessRisk}</p>
                </div>
              </div>
            </div>
          </Card>
          <QualityReportPanel plan={viewPlan} />
          <OriginalityReportPanel plan={viewPlan} />
        </div>
      ) : null}

      {shouldShow("revision") ? (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader title="修订建议" eyebrow="编辑改稿 Agent" />
            <div className="grid gap-3 p-5 text-sm leading-7">
              {viewPlan.readerReport.suggestions.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-md border border-line bg-white p-4">
                  <p className="text-xs text-muted">优先级 {index + 1}</p>
                  <p className="mt-2 text-ink">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="分场修改清单"
              eyebrow={`${viewPlan.sceneDrafts.length} 场`}
              action={
                <GhostButton onClick={() => setActiveStage("sceneDrafts")}>
                  <PenLine size={16} />
                  回到正文
                </GhostButton>
              }
            />
            <div className="grid gap-3 p-5 text-sm leading-7">
              {viewPlan.sceneDrafts.map((scene) => (
                <div key={scene.id} className="rounded-md border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">场景 {scene.index}</p>
                      <p className="mt-1 font-medium text-ink">{scene.title}</p>
                    </div>
                    <Badge>{scene.qualityScore} 分</Badge>
                  </div>
                  <p className="mt-3 text-muted">{scene.revisionFocus}</p>
                </div>
              ))}
            </div>
          </Card>
          <div className="lg:col-span-2">
            <ContinuityMemoryPanel plan={viewPlan} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LearningBasisCard({ basis }: { basis: NonNullable<StoryPlan["learningBasis"]> }) {
  const authorizedDataCount = basis.evidenceCards.filter((card) => card.sourceType === "user_authorized_data").length;
  const evidenceCards = prioritizeLearningEvidence(basis.evidenceCards);

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-line bg-paper p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink">本次创作依据</p>
          <p className="mt-1 text-xs leading-5 text-muted">{basis.sourceSummary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {authorizedDataCount ? <Badge>{authorizedDataCount} 条授权数据</Badge> : null}
          <Badge>{basis.evidenceCards.length} 条依据</Badge>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {evidenceCards.map((card) => (
          <div key={card.id} className="min-w-0 rounded-md border border-line bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words text-xs font-medium text-ink">{card.title}</p>
              <div className="flex flex-wrap gap-2">
                {card.weightLabel ? <Badge>{card.weightLabel}</Badge> : null}
                {card.qualityLabel ? <Badge>{card.qualityLabel}</Badge> : null}
                {typeof card.weight === "number" ? <Badge>权重 {card.weight}</Badge> : null}
                <Badge>{learningSourceLabel(card.sourceType)}</Badge>
              </div>
            </div>
            <p className="mt-2 break-words text-xs leading-5 text-muted">{card.detail}</p>
            {card.sourceLabel || card.qualityNotes?.length ? (
              <div className="mt-2 grid gap-1 border-t border-line pt-2 text-xs leading-5 text-muted">
                {card.sourceLabel ? <p>来源：{card.sourceLabel}</p> : null}
                {card.qualityNotes?.slice(0, 3).map((note) => (
                  <p key={note}>- {note}</p>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <LearningStageInfluence basis={basis} />
      <div className="grid gap-3 md:grid-cols-3">
        <BasisList title="必须执行" items={basis.mustApply} />
        <BasisList title="结构建议" items={basis.structureSuggestion} />
        <BasisList title="避免" items={basis.avoid} />
      </div>
      <p className="rounded-md border border-line bg-white p-3 text-xs leading-5 text-muted">{basis.generationReason}</p>
    </div>
  );
}

function LearningStageInfluence({ basis }: { basis: NonNullable<StoryPlan["learningBasis"]> }) {
  const evidenceById = new Map(basis.evidenceCards.map((card) => [card.id, card]));
  const stageInfluences = basis.stageInfluences?.length ? basis.stageInfluences : fallbackStageInfluences(basis);

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-3">
      <p className="text-xs font-medium text-ink">10 步阶段依据</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {stageInfluences.map((stage) => {
          const matchedEvidence = stage.evidenceIds.map((id) => evidenceById.get(id)).filter((card): card is LearningEvidence => Boolean(card));

          return (
            <div key={stage.stage} className="min-w-0 rounded-md border border-line bg-paper p-2">
              <p className="text-xs font-medium text-ink">{stage.stage}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {stage.sourceTypes.length ? stage.sourceTypes.map((source) => <Badge key={source}>{learningSourceLabel(source)}</Badge>) : <Badge>参数</Badge>}
              </div>
              <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-muted">{stage.summary}</p>
              {matchedEvidence.length ? (
                <p className="mt-1 break-words text-xs leading-5 text-muted">引用：{matchedEvidence.map((card) => card.title).join(" / ")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BasisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-ink">{title}</p>
      <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted">
        {items.slice(0, 4).map((item) => (
          <li key={item} className="break-words">
            - {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

type LearningSourceType = NonNullable<StoryPlan["learningBasis"]>["evidenceCards"][number]["sourceType"];
type LearningEvidence = NonNullable<StoryPlan["learningBasis"]>["evidenceCards"][number];
type LearningStageInfluenceItem = NonNullable<NonNullable<StoryPlan["learningBasis"]>["stageInfluences"]>[number];

function prioritizeLearningEvidence(cards: LearningEvidence[]) {
  const sourcePriority: Record<LearningSourceType, number> = {
    user_authorized_data: 0,
    review_memory: 1,
    review_strategy: 2,
    user_requirement: 3,
    platform_trend: 4,
    writing_memory: 5,
    personal_strategy: 6
  };

  return [...cards].sort((a, b) => sourcePriority[a.sourceType] - sourcePriority[b.sourceType] || (b.weight ?? 0) - (a.weight ?? 0));
}

function learningSourceLabel(sourceType: LearningSourceType) {
  const labels: Record<LearningSourceType, string> = {
    user_requirement: "参数",
    platform_trend: "趋势",
    user_authorized_data: "授权数据",
    review_memory: "复盘记忆",
    review_strategy: "复盘策略",
    writing_memory: "记忆",
    personal_strategy: "策略"
  };

  return labels[sourceType];
}

function fallbackStageInfluences(basis: NonNullable<StoryPlan["learningBasis"]>): LearningStageInfluenceItem[] {
  const availableSources = new Set(basis.evidenceCards.map((card) => card.sourceType));
  const stages = [
    { stage: "选题卡", sourceTypes: ["user_authorized_data", "platform_trend", "user_requirement"] },
    { stage: "情绪曲线", sourceTypes: ["review_memory", "writing_memory", "personal_strategy", "user_requirement"] },
    { stage: "冲突阶梯", sourceTypes: ["review_memory", "review_strategy", "personal_strategy", "user_authorized_data"] },
    { stage: "信息差", sourceTypes: ["user_authorized_data", "review_strategy", "personal_strategy"] },
    { stage: "人物卡", sourceTypes: ["user_requirement", "writing_memory", "review_memory"] },
    { stage: "场景卡", sourceTypes: ["user_authorized_data", "review_memory", "personal_strategy", "writing_memory"] },
    { stage: "场景提示", sourceTypes: ["writing_memory", "personal_strategy", "review_strategy"] },
    { stage: "分场正文", sourceTypes: ["writing_memory", "review_memory", "personal_strategy", "user_requirement"] },
    { stage: "测试读者", sourceTypes: ["platform_trend", "user_authorized_data", "review_strategy"] },
    { stage: "修改建议", sourceTypes: ["review_memory", "review_strategy", "personal_strategy"] }
  ] satisfies Array<{ stage: string; sourceTypes: LearningSourceType[] }>;

  return stages.map((stage) => {
    const stageSourceTypes: LearningSourceType[] = [...stage.sourceTypes];
    const matchedEvidence = prioritizeLearningEvidence(basis.evidenceCards.filter((card) => stageSourceTypes.includes(card.sourceType))).slice(0, 3);
    const sourceTypes = Array.from(new Set(stageSourceTypes.filter((source) => availableSources.has(source))));

    return {
      stage: stage.stage,
      sourceTypes: sourceTypes.length ? sourceTypes : ["user_requirement"],
      evidenceIds: matchedEvidence.map((card) => card.id),
      summary: matchedEvidence.length ? matchedEvidence.map((card) => `${learningSourceLabel(card.sourceType)}：${card.title}`).join("；") : "根据本次参数生成。"
    };
  });
}

function buildWorkflowAudit(plan: StoryPlan) {
  const validation = validateStoryWorkflow(plan);
  const sceneCount = plan.sceneCards.length;
  const promptCount = plan.scenePrompts.length;
  const draftCount = plan.sceneDrafts.length;
  const oneToOne = sceneCount > 0 && sceneCount === promptCount && sceneCount === draftCount;
  const requiredStages = [
    plan.topicCards.length > 0,
    plan.emotionalCurve.length > 0,
    plan.conflictLadder.length > 0,
    Boolean(plan.informationGap?.payoff),
    plan.characters.length > 0,
    sceneCount > 0,
    promptCount > 0,
    draftCount > 0,
    Boolean(plan.readerReport),
    plan.readerReport.suggestions.length > 0
  ];
  const stageComplete = requiredStages.every(Boolean);
  const agentOrder = validation.stageOrder.length ? validation.stageOrder : plan.agentTrace?.map((step) => step.agent) ?? [];
  const agentOrderOk = agentOrder.length === storyWorkflowAgentOrder.length && agentOrder.join("|") === storyWorkflowAgentOrder.join("|");

  const items = [
    {
      label: "10 步结构",
      ok: stageComplete,
      detail: stageComplete ? "选题到修订建议完整。" : "还有阶段内容缺失。"
    },
    {
      label: "分场一致",
      ok: oneToOne,
      detail: `${sceneCount} 张场景卡 / ${promptCount} 条提示词 / ${draftCount} 段正文`
    },
    {
      label: "正文来源",
      ok: !validation.problems.some((problem) => problem.includes("draft")),
      detail: "整篇正文由分场正文合并。"
    },
    {
      label: "Agent 调度",
      ok: agentOrderOk,
      detail: agentOrderOk ? "主控到复盘沉淀顺序正确。" : "调度轨迹需要检查。"
    }
  ];

  const problems = [...validation.problems];

  if (!stageComplete) {
    problems.push("10 步写作结构还不完整。");
  }

  if (!oneToOne) {
    problems.push("场景卡、场景提示词和分场正文没有一一对应。");
  }

  if (!agentOrderOk) {
    problems.push("Agent 调度轨迹和约定顺序不一致。");
  }

  return {
    ok: items.every((item) => item.ok) && problems.length === 0,
    items,
    problems: [...new Set(problems)]
  };
}

function WorkflowAuditItem({ item }: { item: { label: string; ok: boolean; detail: string } }) {
  return (
    <div className="flex min-h-28 gap-3 rounded-md border border-line bg-white p-4">
      <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md ${item.ok ? "bg-[#effaf2] text-[#25633a]" : "bg-[#fff7ed] text-[#9a4d13]"}`}>
        {item.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{item.label}</p>
        <p className="mt-2 break-words text-sm leading-6 text-muted">{item.detail}</p>
      </div>
    </div>
  );
}
