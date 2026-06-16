"use client";

import Image from "next/image";
import Link from "next/link";
import { Background, Controls, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { ArrowLeft, ArrowRight, Copy, Download, FileText, History, MessageSquareWarning, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStoryContinuityMemory,
  createStoryOriginalityReport,
  createStoryQualityReport,
  createSceneDrafts,
  createScenePrompts,
  generateStoryPlan,
  type CharacterCard,
  type EditorMarkRecord,
  type EditorVersionRecord,
  type MarkType,
  type PersonalStrategy,
  type ReviewReportResult,
  type StoryPlan,
  type Work,
  type WritingMemory
} from "@shenbi/shared";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { Badge, Card, CardHeader, GhostButton, Progress } from "@/components/ui";
import { ContinuityMemoryPanel } from "@/components/continuity-memory-panel";
import { OriginalityReportPanel } from "@/components/originality-report-panel";
import { QualityReportPanel } from "@/components/quality-report-panel";
import {
  exportWorkWorkspace,
  getEditorMarks,
  getEditorVersions,
  getPersonalStrategies,
  getReviewReport,
  getWork,
  getWritingMemories,
  reviseSceneDraft,
  saveWorkFullText
} from "@/lib/api";
import { copyPlainText } from "@/lib/clipboard";
import { formatMoney, formatNumber } from "@/lib/format";

type DetailTab =
  | "overview"
  | "performance"
  | "synopsis"
  | "structure"
  | "characters"
  | "scenes"
  | "prompts"
  | "reader"
  | "revision"
  | "review"
  | "memory"
  | "draft";

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "总览" },
  { id: "performance", label: "数据表现" },
  { id: "synopsis", label: "故事梗概" },
  { id: "structure", label: "结构线" },
  { id: "characters", label: "人物关系" },
  { id: "scenes", label: "场景卡" },
  { id: "prompts", label: "提示词" },
  { id: "reader", label: "读者报告" },
  { id: "revision", label: "修订建议" },
  { id: "review", label: "复盘报告" },
  { id: "memory", label: "记忆策略" },
  { id: "draft", label: "正文" }
];

const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink";

const markTypeLabels: Record<MarkType, string> = {
  delete: "删除",
  optimize: "优化",
  rewrite: "重写",
  logic: "逻辑问题",
  emotion: "情绪问题",
  rhythm: "节奏问题",
  character: "人物问题",
  information_gap: "信息差问题",
  scene_goal: "场景目标问题"
};

export function WorkDetailWorkspace({ workId }: { workId: string }) {
  const [work, setWork] = useState<Work | null>(null);
  const [message, setMessage] = useState("正在读取作品详情。");
  const [reviewReport, setReviewReport] = useState<ReviewReportResult | null>(null);
  const [reviewMessage, setReviewMessage] = useState("正在读取复盘报告。");
  const [memories, setMemories] = useState<WritingMemory[]>([]);
  const [memoryMessage, setMemoryMessage] = useState("正在读取写作记忆。");
  const [strategies, setStrategies] = useState<PersonalStrategy[]>([]);
  const [strategyMessage, setStrategyMessage] = useState("正在读取个人策略。");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getWork(workId)
      .then((result) => {
        setWork(result);
        setMessage(result.storyPlan ? "已读取这部作品保存时的原始写作方案。" : "这部作品没有保存原始方案，页面会根据简介生成一份结构参考。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "作品详情读取失败。");
      });
  }, [workId]);

  const plan = useMemo(() => (work ? planForWork(work) : null), [work]);
  const relatedMemories = useMemo(() => (work && plan ? memoriesForWork(work, plan, memories) : []), [memories, plan, work]);
  const relatedStrategies = useMemo(() => (work && plan ? strategiesForWork(work, plan, strategies) : []), [plan, strategies, work]);

  useEffect(() => {
    if (!work) {
      return;
    }

    let alive = true;

    getReviewReport(work.id)
      .then((result) => {
        if (!alive) {
          return;
        }

        setReviewReport(result);
        setReviewMessage(result.persisted ? "已读取保存过的复盘报告。" : "还没有保存过的复盘报告，正在展示预览判断。");
      })
      .catch((error: unknown) => {
        if (!alive) {
          return;
        }

        setReviewMessage(error instanceof Error ? error.message : "复盘报告读取失败。");
      });

    getWritingMemories()
      .then((result) => {
        if (!alive) {
          return;
        }

        setMemories(result);
        setMemoryMessage("已读取写作记忆库，并筛选和本作品相关的记忆。");
      })
      .catch((error: unknown) => {
        if (!alive) {
          return;
        }

        setMemoryMessage(error instanceof Error ? error.message : "写作记忆读取失败。");
      });

    getPersonalStrategies()
      .then((result) => {
        if (!alive) {
          return;
        }

        setStrategies(result);
        setStrategyMessage("已读取个人策略库，并筛选和本作品相关的策略。");
      })
      .catch((error: unknown) => {
        if (!alive) {
          return;
        }

        setStrategyMessage(error instanceof Error ? error.message : "个人策略读取失败。");
      });

    return () => {
      alive = false;
    };
  }, [work]);

  async function handleExport() {
    if (!work) {
      return;
    }

    setExporting(true);
    setMessage(`正在整理《${work.title}》的作品工程目录。`);

    try {
      const result = await exportWorkWorkspace(work.id);
      setMessage(`${result.message} 文件夹：${result.path}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败，请稍后再试。");
    } finally {
      setExporting(false);
    }
  }

  function handleWorkUpdated(nextWork: Work) {
    setWork(nextWork);
    setMessage(`《${nextWork.title}》已保存最新正文。`);
  }

  if (!work || !plan) {
    return (
      <div className="mx-auto grid max-w-7xl gap-5">
        <Link className="inline-flex w-fit items-center gap-2 text-sm text-muted hover:text-ink" href="/works">
          <ArrowLeft size={16} />
          返回作品专栏
        </Link>
        <Card className="p-6 text-sm text-muted">{message}</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink" href="/works">
          <ArrowLeft size={16} />
          返回作品专栏
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link className={linkButtonClass} href={`/editor?workId=${encodeURIComponent(work.id)}`}>
            <PenLine size={16} />
            打开编辑器
          </Link>
          <GhostButton disabled={exporting} onClick={handleExport}>
            <Download size={16} />
            {exporting ? "导出中" : "导出工程"}
          </GhostButton>
        </div>
      </div>

      <Card>
        <div className="grid gap-5 p-5 lg:grid-cols-[112px_1fr_360px]">
          <Image src={work.cover} alt={work.title} width={112} height={162} className="h-[162px] rounded object-cover" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold">{work.title}</h1>
              <Badge>{work.platform}</Badge>
              <Badge>{work.status === "draft" ? "草稿" : work.status}</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">{work.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...work.genreTags, ...work.styleTags].map((tag, index) => (
                <Badge key={`${tag}-${index}`}>{tag}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="字数" value={formatNumber(work.wordCount)} />
            <Metric label="阅读" value={formatNumber(work.readCount)} />
            <Metric label="收益" value={formatMoney(work.revenue)} />
            <Metric label="完读率" value={`${work.completionRate}%`} />
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-sm text-muted">{message}</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`rounded-md border px-3 py-2 text-sm transition ${activeTab === tab.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? <OverviewTab work={work} plan={plan} /> : null}
      {activeTab === "performance" ? <PerformanceTab work={work} /> : null}
      {activeTab === "synopsis" ? <SynopsisTab work={work} plan={plan} /> : null}
      {activeTab === "structure" ? <StructureTab plan={plan} /> : null}
      {activeTab === "characters" ? <CharactersTab characters={plan.characters} /> : null}
      {activeTab === "scenes" ? <ScenesTab plan={plan} /> : null}
      {activeTab === "prompts" ? <PromptsTab plan={plan} /> : null}
      {activeTab === "reader" ? <ReaderTab plan={plan} /> : null}
      {activeTab === "revision" ? <RevisionTab plan={plan} /> : null}
      {activeTab === "review" ? <ReviewTab report={reviewReport} message={reviewMessage} work={work} /> : null}
      {activeTab === "memory" ? (
        <MemoryTab plan={plan} memories={relatedMemories} memoryMessage={memoryMessage} strategies={relatedStrategies} strategyMessage={strategyMessage} />
      ) : null}
      {activeTab === "draft" ? <DraftTab work={work} plan={plan} onWorkUpdated={handleWorkUpdated} /> : null}
    </div>
  );
}

function assembleDraft(sceneDrafts: StoryPlan["sceneDrafts"]) {
  return sceneDrafts.map((scene) => `【场景${scene.index}：${scene.title}】\n${scene.text}`).join("\n\n");
}

function countText(value: string) {
  return value.replace(/\s+/g, "").length;
}

function planForWork(work: Work): StoryPlan {
  const basePlan = work.storyPlan ?? generateStoryPlan({ inspiration: work.summary, platform: work.platform, genre: work.genreTags[0] });
  const storedPrompts = (basePlan as StoryPlan & { scenePrompts?: StoryPlan["scenePrompts"] }).scenePrompts;
  const storedSceneDrafts = (basePlan as StoryPlan & { sceneDrafts?: StoryPlan["sceneDrafts"] }).sceneDrafts;
  const scenePrompts =
    storedPrompts?.length > 0
      ? storedPrompts
      : createScenePrompts(basePlan.sceneCards, {
          platform: work.platform || basePlan.platform,
          genre: work.genreTags[0] || basePlan.genre,
          style: work.styleTags[0] || basePlan.tags[3],
          selectedTopic: basePlan.selectedTopic,
          characters: basePlan.characters,
          informationGap: basePlan.informationGap
        });
  const sceneDrafts =
    storedSceneDrafts?.length > 0
      ? storedSceneDrafts
      : createSceneDrafts(basePlan.sceneCards, work.styleTags[0] || basePlan.tags[3] || "现实质感", basePlan.memoryUsed?.[0] ?? "");

  return {
    ...basePlan,
    title: work.title,
    platform: work.platform,
    genre: work.genreTags[0] || basePlan.genre,
    synopsis: work.summary,
    draft: work.fullText?.trim() || basePlan.draft,
    scenePrompts,
    sceneDrafts,
    qualityReport:
      basePlan.qualityReport ??
      createStoryQualityReport({
        ...basePlan,
        sceneDrafts
      }),
    originalityReport:
      basePlan.originalityReport ??
      createStoryOriginalityReport({
        ...basePlan,
        scenePrompts
      }),
    continuityMemory:
      basePlan.continuityMemory ??
      createStoryContinuityMemory({
        ...basePlan,
        sceneDrafts
      })
  };
}

function OverviewTab({ work, plan }: { work: Work; plan: StoryPlan }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="作品结构总览" />
        <div className="grid gap-4 p-5 text-sm leading-7 text-muted">
          <p>{plan.topicJudgement}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBlock label="选题卡" value={`${plan.topicCards.length} 个`} />
            <InfoBlock label="场景卡" value={`${plan.sceneCards.length} 张`} />
            <InfoBlock label="场景提示词" value={`${plan.scenePrompts.length} 条`} />
            <InfoBlock label="分场正文" value={`${plan.sceneDrafts.length} 段`} />
          </div>
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="font-medium text-ink">可发布简介</p>
            <p className="mt-2">{plan.synopsis}</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="当前状态" />
        <div className="grid gap-3 p-5">
          <InfoBlock label="最后更新" value={work.updatedAt} />
          <InfoBlock label="创建时间" value={work.createdAt} />
          <InfoBlock label="方案来源" value={work.storyPlan ? "保存时的原始方案" : "根据简介生成的结构参考"} />
          <InfoBlock label="评论关键词" value={work.commentKeywords?.length ? work.commentKeywords.slice(0, 4).join("、") : "暂无导入"} />
          <InfoBlock label="数据来源" value={sourceText(work) || "暂无导入来源"} />
        </div>
      </Card>
      {work.commentFeedback ? (
        <Card className="lg:col-span-2">
          <CardHeader title="平台评论反馈" eyebrow={sourceText(work) || "来自 CSV、截图校正或手动粘贴导入"} />
          <div className="grid gap-3 p-5 text-sm leading-7 text-muted">
            <p>{work.commentFeedback}</p>
            {work.commentKeywords?.length ? (
              <div className="flex flex-wrap gap-2">
                {work.commentKeywords.map((keyword, index) => (
                  <Badge key={`${keyword}-${index}`}>{keyword}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
      <div className="lg:col-span-2">
        <AgentTracePanel plan={plan} />
      </div>
    </div>
  );
}

function sourceText(work: Work) {
  return [work.sourceLabel, work.sourceDetail, work.importedAt ? `导入于 ${work.importedAt}` : ""].filter(Boolean).join(" · ");
}

function PerformanceTab({ work }: { work: Work }) {
  const revenuePerRead = work.readCount > 0 ? work.revenue / work.readCount : 0;
  const subscriptionRate = work.readCount > 0 ? (work.subscriptionCount / work.readCount) * 100 : 0;
  const completionRisk =
    work.completionRate === 0
      ? "还没有导入完读率，发布后建议补充后台数据。"
      : work.completionRate < 60
        ? "完读率偏低，优先检查开头钩子、中段重复和结尾情绪释放。"
        : work.completionRate < 72
          ? "完读率有提升空间，可以重点复盘中段节奏和高潮兑现。"
          : "完读率表现稳定，可以继续复用当前结构里的有效元素。";

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="平台表现数据" eyebrow="发布后回收的作品表现" />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="阅读量" value={formatNumber(work.readCount)} />
          <Metric label="收藏/订阅" value={formatNumber(work.subscriptionCount)} />
          <Metric label="收益" value={formatMoney(work.revenue)} />
          <Metric label="完读率" value={`${work.completionRate}%`} />
        </div>
        <div className="grid gap-4 border-t border-line p-5 md:grid-cols-3">
          <InfoBlock label="千次阅读收益" value={formatMoney(revenuePerRead * 1000)} />
          <InfoBlock label="收藏转化率" value={`${subscriptionRate.toFixed(2)}%`} />
          <InfoBlock label="复盘优先级" value={work.readCount > 0 || work.revenue > 0 ? "可复盘" : "待导入数据"} />
        </div>
      </Card>
      <Card>
        <CardHeader title="表现判断" />
        <div className="grid gap-4 p-5 text-sm leading-7 text-muted">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span>完读率</span>
              <span>{work.completionRate}%</span>
            </div>
            <Progress value={work.completionRate} />
          </div>
          <p>{completionRisk}</p>
          {work.commentFeedback ? (
            <div className="rounded-md border border-line bg-paper p-4">
              <p className="font-medium text-ink">评论反馈</p>
              <p className="mt-2">{work.commentFeedback}</p>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-paper p-4">导入评论反馈后，复盘会更接近真实读者反应。</div>
          )}
          {work.commentKeywords?.length ? (
            <div className="flex flex-wrap gap-2">
              {work.commentKeywords.map((keyword, index) => (
                <Badge key={`${keyword}-${index}`}>{keyword}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function SynopsisTab({ work, plan }: { work: Work; plan: StoryPlan }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="故事梗概" eyebrow="给发布和复盘看的故事底稿" />
        <div className="grid gap-4 p-5 text-sm leading-7 text-muted">
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="font-medium text-ink">作品简介</p>
            <p className="mt-2">{work.summary}</p>
          </div>
          <div className="rounded-md border border-line bg-white p-4">
            <p className="font-medium text-ink">可发布简介</p>
            <p className="mt-2">{plan.synopsis}</p>
          </div>
          <div className="rounded-md border border-line bg-white p-4">
            <p className="font-medium text-ink">选题判断</p>
            <p className="mt-2">{plan.topicJudgement}</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="选题卡" eyebrow={plan.selectedTopic.platform} />
        <div className="grid gap-3 p-5 text-sm leading-7 text-muted">
          <h3 className="text-lg font-semibold text-ink">{plan.selectedTopic.title}</h3>
          <p>{plan.selectedTopic.hook}</p>
          <InfoBlock label="目标读者" value={plan.selectedTopic.reader} />
          <InfoBlock label="主角设定" value={plan.selectedTopic.protagonist} />
          <InfoBlock label="核心冲突" value={plan.selectedTopic.conflict} />
          <InfoBlock label="反转点" value={plan.selectedTopic.reversal} />
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="平台适配" value={`${plan.selectedTopic.fitScore}`} />
            <Metric label="推荐指数" value={`${plan.selectedTopic.recommendationScore}`} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function StructureTab({ plan }: { plan: StoryPlan }) {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="情绪曲线" eyebrow="读者情绪推进顺序" />
        <div className="grid gap-3 p-5">
          {plan.emotionalCurve.map((beat, index) => (
            <div key={`${beat.stage}-${index}`} className="grid gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[160px_1fr]">
              <div>
                <p className="text-xs text-muted">阶段 {index + 1}</p>
                <h3 className="mt-1 font-semibold">{beat.stage}</h3>
                <Badge>{beat.emotion}</Badge>
              </div>
              <div className="grid gap-2 text-sm leading-7 text-muted">
                <p>对应场景：{beat.scene}</p>
                <p>读者预期：{beat.readerExpectation}</p>
                <p>释放点：{beat.releasePoint}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="冲突阶梯" eyebrow="一层一层把压力推上去" />
          <div className="grid gap-3 p-5">
            {plan.conflictLadder.map((step) => (
              <div key={`${step.level}-${step.event}`} className="rounded-md border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>第 {step.level} 级</Badge>
                  <h3 className="font-semibold">{step.event}</h3>
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-7 text-muted">
                  <p>冲突双方：{step.parties}</p>
                  <p>代价：{step.cost}</p>
                  <p>剧情作用：{step.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="信息差设计" eyebrow="短篇反转发动机" />
          <div className="grid gap-3 p-5">
            <InfoBlock label="读者知道什么" value={plan.informationGap.readerKnows} />
            <InfoBlock label="主角知道什么" value={plan.informationGap.protagonistKnows} />
            <InfoBlock label="反派不知道什么" value={plan.informationGap.antagonistMisses} />
            <InfoBlock label="揭示时机" value={plan.informationGap.revealTiming} />
            <InfoBlock label="爽点/反转" value={plan.informationGap.payoff} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function CharactersTab({ characters }: { characters: CharacterCard[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader title="人物关系图谱" />
        <div className="h-[420px] border-t border-line">
          <CharacterFlow characters={characters} />
        </div>
      </Card>
      <div className="grid gap-3">
        {characters.map((character) => (
          <Card key={character.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{character.name}</h3>
              <Badge>{character.role}</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-muted">
              <p>{character.personality}</p>
              <p>欲望：{character.desire}</p>
              <p>恐惧：{character.fear}</p>
              <p>关系：{character.relationNotes}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CharacterFlow({ characters }: { characters: CharacterCard[] }) {
  const nodes = useMemo<Node[]>(
    () =>
      characters.map((character, index) => ({
        id: character.id,
        position: nodePosition(index, characters.length),
        data: {
          label: (
            <div className="min-w-36 rounded-md border border-line bg-white px-3 py-2 text-left shadow-soft">
              <p className="text-sm font-semibold text-ink">{character.name}</p>
              <p className="text-xs text-muted">{character.role}</p>
            </div>
          )
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      })),
    [characters]
  );
  const edges = useMemo<Edge[]>(
    () =>
      characters.slice(1).map((character) => ({
        id: `edge-${characters[0]?.id}-${character.id}`,
        source: characters[0]?.id ?? character.id,
        target: character.id,
        label: character.role,
        animated: true,
        style: { stroke: "#111827" }
      })),
    [characters]
  );

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} proOptions={{ hideAttribution: true }}>
      <Background color="#d7d7d7" gap={18} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function nodePosition(index: number, total: number) {
  if (index === 0) {
    return { x: 160, y: 160 };
  }

  const angle = ((index - 1) / Math.max(1, total - 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: 160 + Math.cos(angle) * 250,
    y: 160 + Math.sin(angle) * 140
  };
}

function ScenesTab({ plan }: { plan: StoryPlan }) {
  return (
    <Card>
      <CardHeader title="场景卡" eyebrow="短篇结构块" />
      <div className="grid gap-3 p-5">
        {plan.sceneCards.map((scene) => (
          <div key={scene.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[160px_1fr]">
            <div>
              <p className="text-xs text-muted">场景 {scene.index}</p>
              <h3 className="mt-1 font-semibold">{scene.title}</h3>
              <p className="mt-2 text-xs text-muted">{scene.estimatedWords} 字左右</p>
            </div>
            <div className="grid gap-2 text-sm leading-7 text-muted">
              <p>目标：{scene.goal}</p>
              <p>主角想要：{scene.protagonistWant}</p>
              <p>阻碍：{scene.obstacle}</p>
              <p>冲突升级：{scene.conflictUpgrade}</p>
              <p>结尾钩子：{scene.hook}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PromptsTab({ plan }: { plan: StoryPlan }) {
  return (
    <Card>
      <CardHeader title="场景写作提示词" eyebrow="提示词 Agent" />
      <div className="grid gap-3 p-5">
        {plan.scenePrompts.map((prompt) => (
          <details key={prompt.id} className="rounded-md border border-line bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              场景 {prompt.index}：{prompt.title}
            </summary>
            <div className="mt-3 grid gap-3 text-sm leading-7 text-muted">
              <p>{prompt.objective}</p>
              <p>{prompt.context}</p>
              <div className="rounded-md border border-line bg-paper p-3 text-ink">{prompt.writingPrompt}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <PromptList title="必须包含" items={prompt.mustInclude} />
                <PromptList title="避免" items={prompt.avoid} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}

function ReaderTab({ plan }: { plan: StoryPlan }) {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="测试读者报告" />
        <div className="grid gap-5 p-5 lg:grid-cols-[360px_1fr]">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["开头", plan.readerReport.openingScore],
              ["代入", plan.readerReport.empathyScore],
              ["情绪", plan.readerReport.emotionScore],
              ["反转", plan.readerReport.reversalScore],
              ["闭环", plan.readerReport.closureScore],
              ["平台适配", plan.readerReport.platformFitScore]
            ].map(([label, value]) => (
              <Metric key={label} label={String(label)} value={String(value)} />
            ))}
          </div>
          <div className="grid gap-4 text-sm leading-7">
            <PromptList title="主要问题" items={plan.readerReport.problems} />
            <InfoBlock label="同质化风险" value={plan.readerReport.samenessRisk} />
          </div>
        </div>
      </Card>
      <QualityReportPanel plan={plan} />
      <OriginalityReportPanel plan={plan} />
    </div>
  );
}

function RevisionTab({ plan }: { plan: StoryPlan }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader title="修订建议" eyebrow="编辑改稿 Agent" />
        <div className="grid gap-3 p-5 text-sm leading-7">
          {plan.readerReport.suggestions.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-md border border-line bg-white p-4">
              <p className="text-xs text-muted">优先级 {index + 1}</p>
              <p className="mt-2 text-ink">{item}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="分场修改清单" eyebrow={`${plan.sceneDrafts.length} 场`} />
        <div className="grid gap-3 p-5 text-sm leading-7">
          {plan.sceneDrafts.map((scene) => (
            <div key={scene.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
    </div>
  );
}

function DraftTab({ work, plan, onWorkUpdated }: { work: Work; plan: StoryPlan; onWorkUpdated: (work: Work) => void }) {
  const [sceneFeedback, setSceneFeedback] = useState<Record<string, string>>({});
  const [revisingSceneId, setRevisingSceneId] = useState<string | null>(null);
  const [editorMarks, setEditorMarks] = useState<EditorMarkRecord[]>([]);
  const [editorVersions, setEditorVersions] = useState<EditorVersionRecord[]>([]);
  const [message, setMessage] = useState("");
  const [editorMessage, setEditorMessage] = useState("正在读取正文标记和版本历史。");
  const publishDraft = work.fullText?.trim() || plan.draft;
  const draftRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    setEditorMessage("正在读取正文标记和版本历史。");
    Promise.all([getEditorMarks(work.id), getEditorVersions(work.id)])
      .then(([marks, versions]) => {
        if (!alive) {
          return;
        }

        setEditorMarks(marks);
        setEditorVersions(versions);
        setEditorMessage(marks.length || versions.length ? "已读取这部作品保存过的标记和改写版本。" : "这部作品还没有保存过正文标记或局部改写版本。");
      })
      .catch((error: unknown) => {
        if (!alive) {
          return;
        }

        setEditorMessage(error instanceof Error ? error.message : "标记和版本历史读取失败。");
      });

    return () => {
      alive = false;
    };
  }, [work.id]);

  async function handleReviseSavedScene(scene: StoryPlan["sceneDrafts"][number]) {
    const scenePrompt = plan.scenePrompts.find((prompt) => prompt.sceneId === scene.sceneId);

    setRevisingSceneId(scene.id);
    setMessage("");

    try {
      const revised = await reviseSceneDraft({
        sceneDraft: scene,
        scenePrompt,
        feedback: sceneFeedback[scene.id]
      });
      const sceneDrafts = plan.sceneDrafts.map((item) => (item.id === scene.id ? revised : item));
      const fullText = assembleDraft(sceneDrafts);
      const readerReport = {
        ...plan.readerReport,
        suggestions: [`场景 ${revised.index} 已在作品详情中重写，下一步重点：${revised.revisionFocus}`, ...plan.readerReport.suggestions].slice(0, 8)
      };
      const nextPlan: StoryPlan = {
        ...plan,
        sceneDrafts,
        draft: fullText,
        readerReport,
        qualityReport: createStoryQualityReport({
          ...plan,
          sceneDrafts,
          readerReport
        }),
        originalityReport: createStoryOriginalityReport({
          ...plan,
          readerReport
        }),
        continuityMemory: createStoryContinuityMemory({
          ...plan,
          sceneDrafts
        })
      };
      const result = await saveWorkFullText(work.id, fullText, nextPlan);
      const updatedWork: Work = {
        ...result.work,
        fullText,
        storyPlan: nextPlan,
        wordCount: countText(fullText)
      };

      onWorkUpdated(updatedWork);
      setMessage(`${result.message} 场景 ${revised.index} 已重写并保存。${revised.providerNotice ?? ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "单场重写保存失败，请稍后再试。");
    } finally {
      setRevisingSceneId(null);
    }
  }

  async function handleCopyDraft() {
    if (!publishDraft.trim()) {
      setMessage("正文还是空的，暂时没有可复制内容。");
      return;
    }

    try {
      await copyPlainText(publishDraft);
      setMessage(`正文已复制，约 ${countText(publishDraft).toLocaleString("zh-CN")} 字，可以去平台后台粘贴。`);
    } catch {
      if (selectDraftText(draftRef.current)) {
        setMessage("浏览器没有允许自动复制，已帮你选中正文，请按 Command+C 复制。");
      } else {
        setMessage("浏览器没有允许自动复制，可以打开编辑器后全选正文手动复制。");
      }
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            title="正文草稿"
            eyebrow={`${plan.sceneDrafts.length} 场合并成文 · 约 ${countText(plan.draft).toLocaleString("zh-CN")} 字`}
            action={
              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={handleCopyDraft}>
                  <Copy size={16} />
                  复制正文
                </GhostButton>
                <Link className={linkButtonClass} href={`/editor?workId=${encodeURIComponent(work.id)}`}>
                  <FileText size={16} />
                  去编辑正文
                </Link>
              </div>
            }
          />
          <div ref={draftRef} className="max-h-[520px] overflow-auto whitespace-pre-wrap p-5 text-sm leading-8 text-muted">{publishDraft}</div>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="改稿状态" eyebrow="标记改写看板" action={<Badge>{editorMarks.length ? `${editorMarks.length} 条待处理` : "无待处理"}</Badge>} />
            <div className="grid gap-4 p-5 text-sm leading-7 text-muted">
              <div className="grid grid-cols-2 gap-3">
                <InfoBlock label="待处理标记" value={`${editorMarks.length} 条`} />
                <InfoBlock label="已应用版本" value={`${editorVersions.length} 次`} />
              </div>
              <p>{editorMessage}</p>
              <Link className={linkButtonClass} href={`/editor?workId=${encodeURIComponent(work.id)}`}>
                <PenLine size={16} />
                处理标记改写
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="待处理标记" action={<MessageSquareWarning size={18} className="text-muted" />} />
            <div className="grid gap-3 p-5">
              {editorMarks.length ? (
                editorMarks.slice(0, 4).map((mark) => (
                  <div key={mark.id} className="rounded-md border border-line bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{mark.label}</Badge>
                      <Badge>{markTypeLabels[mark.type]}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 leading-6 text-muted">{mark.selectedText}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">暂无待处理标记。需要局部改稿时，进入编辑器选中文字即可添加。</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="最近改写版本" action={<History size={18} className="text-muted" />} />
            <div className="grid gap-3 p-5">
              {editorVersions.length ? (
                editorVersions.slice(0, 3).map((version) => (
                  <div key={version.id} className="rounded-md border border-line bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge>{version.markLabel}</Badge>
                      <span className="text-xs text-muted">{formatDateTime(version.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-muted">{version.reason}</p>
                    <div className="mt-3 grid gap-2">
                      <CompactVersionText label="原文" text={version.originalText} />
                      <CompactVersionText label="新文" text={version.newText} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">应用局部改稿后，这里会保留原文、新文和修改原因。</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="分场正文与小评审" eyebrow="正文 Agent 按场景生成" />
        <div className="grid gap-3 p-5">
          {message ? <p className="rounded-md border border-line bg-paper p-3 text-sm text-muted">{message}</p> : null}
          {plan.sceneDrafts.map((scene) => (
            <details key={scene.id} className="rounded-md border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                场景 {scene.index}：{scene.title} · {scene.qualityScore} 分
              </summary>
              <div className="mt-3 grid gap-3 text-sm leading-7 text-muted lg:grid-cols-[1fr_280px]">
                <div className="whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-ink">{scene.text}</div>
                <div className="grid content-start gap-3">
                  <Metric label="目标字数" value={`${scene.wordTarget}`} />
                  <Metric label="本场评分" value={`${scene.qualityScore}`} />
                  <PromptList title="读者提醒" items={scene.readerNotes} />
                  <div>
                    <p className="font-medium text-ink">下一轮修改</p>
                    <p className="mt-2 text-muted">{scene.revisionFocus}</p>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-ink" htmlFor={`saved-scene-feedback-${scene.id}`}>
                      重写这一场并保存
                    </label>
                    <textarea
                      id={`saved-scene-feedback-${scene.id}`}
                      className="min-h-24 resize-y rounded-md border border-line bg-white p-3 text-sm leading-6 text-ink outline-none focus:border-ink"
                      placeholder="例如：让这一场更紧张，减少解释，多用动作推进"
                      value={sceneFeedback[scene.id] ?? ""}
                      onChange={(event) => setSceneFeedback((current) => ({ ...current, [scene.id]: event.target.value }))}
                    />
                    <GhostButton className="w-full" onClick={() => handleReviseSavedScene(scene)} disabled={revisingSceneId === scene.id}>
                      <RefreshCw size={16} />
                      {revisingSceneId === scene.id ? "正在重写..." : "重写并保存本场"}
                    </GhostButton>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

function selectDraftText(node: HTMLElement | null) {
  if (!node) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function CompactVersionText({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <p className="text-xs font-medium text-ink">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{text}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN");
}

function ReviewTab({ report, message, work }: { report: ReviewReportResult | null; message: string; work: Work }) {
  const reviewLink = `/review?workId=${encodeURIComponent(work.id)}`;
  const nextStoryHref = report ? nextStoryLink(work, report) : "";

  if (!report) {
    return (
      <Card>
        <CardHeader
          title="发布后复盘"
          action={
            <Link className={linkButtonClass} href={reviewLink}>
              <Sparkles size={16} />
              生成复盘
            </Link>
          }
        />
        <p className="p-5 text-sm text-muted">{message}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader
          title="发布后复盘"
          action={
            <div className="flex flex-wrap gap-2">
              <Badge>{report.persisted ? "已保存" : "预览"}</Badge>
              <Link className={linkButtonClass} href={reviewLink}>
                <Sparkles size={16} />
                {report.persisted ? "更新复盘" : "生成复盘"}
              </Link>
              <Link className={linkButtonClass} href={nextStoryHref}>
                用复盘写下一篇
                <ArrowRight size={16} />
              </Link>
            </div>
          }
        />
        <div className="grid gap-4 p-5 text-sm leading-7 text-muted">
          <p>{report.performanceSummary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <PromptList title="做得好的地方" items={report.strengths} />
            <PromptList title="需要注意的地方" items={report.weaknesses} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="下一篇怎么写" />
        <div className="grid gap-4 p-5 text-sm leading-7">
          <PromptList title="创作建议" items={report.nextWritingAdvice} />
          <PromptList title="沉淀策略" items={report.strategyLessons} />
        </div>
      </Card>
    </div>
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

function MemoryTab({
  plan,
  memories,
  memoryMessage,
  strategies,
  strategyMessage
}: {
  plan: StoryPlan;
  memories: WritingMemory[];
  memoryMessage: string;
  strategies: PersonalStrategy[];
  strategyMessage: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <ContinuityMemoryPanel plan={plan} />
      </div>
      <Card>
        <CardHeader
          title="相关写作记忆"
          eyebrow="下一次写作会优先读取启用记忆"
          action={
            <Link className={linkButtonClass} href="/memory">
              管理记忆
            </Link>
          }
        />
        <p className="border-b border-line px-5 py-3 text-sm text-muted">{memoryMessage}</p>
        <div className="grid gap-3 p-5">
          {memories.length ? (
            memories.map((memory) => (
              <div key={memory.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_150px]">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{memory.genre}</Badge>
                    <Badge>{sourceTypeLabel(memory.sourceType)}</Badge>
                    <Badge>{memory.enabled ? "启用" : "停用"}</Badge>
                  </div>
                  <p className="mt-3 font-medium">{memory.rule}</p>
                  <p className="mt-2 text-sm text-muted">正向例子：{memory.positiveExample || "暂无"}</p>
                  <p className="mt-1 text-sm text-muted">反向例子：{memory.negativeExample || "暂无"}</p>
                </div>
                <ConfidenceBlock value={memory.confidence} />
              </div>
            ))
          ) : (
            <div className="rounded-md border border-line bg-paper p-5 text-sm text-muted">暂时没有匹配到这部作品的写作记忆。</div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="相关个人策略"
          eyebrow="复盘沉淀出的下一篇行动规则"
          action={
            <Link className={linkButtonClass} href="/memory">
              管理策略
            </Link>
          }
        />
        <p className="border-b border-line px-5 py-3 text-sm text-muted">{strategyMessage}</p>
        <div className="grid gap-3 p-5">
          {strategies.length ? (
            strategies.map((strategy) => (
              <div key={strategy.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_150px]">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{strategy.genre}</Badge>
                    <Badge>{strategySourceLabel(strategy.sourceType)}</Badge>
                    <Badge>{strategy.enabled ? "启用" : "停用"}</Badge>
                  </div>
                  <p className="mt-3 font-medium">{strategy.rule}</p>
                  <p className="mt-2 text-sm text-muted">依据：{strategy.evidence || "暂无"}</p>
                  <p className="mt-1 text-sm text-muted">下一步：{strategy.action || "写作前先检查这条策略是否适用。"}</p>
                </div>
                <ConfidenceBlock value={strategy.confidence} />
              </div>
            ))
          ) : (
            <div className="rounded-md border border-line bg-paper p-5 text-sm text-muted">暂时没有匹配到这部作品的个人策略。生成复盘后，系统会自动沉淀。</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ConfidenceBlock({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted">置信度</span>
        <span>{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function PromptList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-ink">{title}</p>
      <ul className="mt-2 grid gap-1 text-muted">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function memoriesForWork(work: Work, plan: StoryPlan, memories: WritingMemory[]) {
  const genres = new Set([...work.genreTags, plan.genre, "通用"].filter(Boolean));

  return memories
    .filter((memory) => memory.relatedWorkIds.includes(work.id) || genres.has(memory.genre))
    .sort((left, right) => Number(right.enabled) - Number(left.enabled) || right.confidence - left.confidence)
    .slice(0, 8);
}

function strategiesForWork(work: Work, plan: StoryPlan, strategies: PersonalStrategy[]) {
  const genres = new Set([...work.genreTags, plan.genre, "通用"].filter(Boolean));

  return strategies
    .filter((strategy) => strategy.relatedWorkIds.includes(work.id) || genres.has(strategy.genre))
    .sort(
      (left, right) =>
        Number(right.relatedWorkIds.includes(work.id)) - Number(left.relatedWorkIds.includes(work.id)) ||
        Number(right.enabled) - Number(left.enabled) ||
        right.confidence - left.confidence
    )
    .slice(0, 8);
}

function sourceTypeLabel(value: WritingMemory["sourceType"]) {
  const labels: Record<WritingMemory["sourceType"], string> = {
    user_feedback: "改稿反馈",
    review: "复盘经验",
    platform_result: "平台表现",
    manual_rule: "手动规则",
    reader_report: "读者评审"
  };

  return labels[value];
}

function strategySourceLabel(value: PersonalStrategy["sourceType"]) {
  const labels: Record<PersonalStrategy["sourceType"], string> = {
    review: "复盘策略",
    platform_result: "平台表现",
    manual_rule: "手动策略",
    editor_feedback: "改稿沉淀"
  };

  return labels[value];
}
