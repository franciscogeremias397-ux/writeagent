"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Feather, Loader2, PenLine, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { FullDraftJobSnapshot, FullDraftMode, StoryOutlineResult } from "@shenbi/shared";
import { Badge, Button, Progress, SelectInput } from "@/components/ui";
import { createStoryOutline, getFullDraftJob, resumeFullDraftJob, startFullDraftJob } from "@/lib/api";

const directionOptions = ["自动判断", "悬疑反转", "现实情感", "强冲突短剧感", "女性成长", "男频逆袭"];

const lengthOptions = [
  { value: "auto", label: "自动（约 2 万字）" },
  { value: "8000", label: "8000 字" },
  { value: "15000", label: "1.5 万字" },
  { value: "20000", label: "2 万字" }
];

type OutlineDraft = {
  title: string;
  direction: string;
  outline: string;
  highlights: string;
  marketReason: string;
};

const emptyOutlineDraft: OutlineDraft = {
  title: "",
  direction: "",
  outline: "",
  highlights: "",
  marketReason: ""
};

export function HomePage() {
  const [mode, setMode] = useState<FullDraftMode>("autopilot");
  const [inspiration, setInspiration] = useState("");
  const [optionalDirection, setOptionalDirection] = useState("");
  const [targetLength, setTargetLength] = useState("auto");
  const [avoid, setAvoid] = useState("");
  const [outline, setOutline] = useState<StoryOutlineResult | null>(null);
  const [outlineDraft, setOutlineDraft] = useState<OutlineDraft>(emptyOutlineDraft);
  const [previousOutlines, setPreviousOutlines] = useState<StoryOutlineResult[]>([]);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [job, setJob] = useState<FullDraftJobSnapshot | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notice, setNotice] = useState("准备开始");
  const [error, setError] = useState("");

  const busy = isGeneratingOutline || isGeneratingDraft;

  useEffect(() => {
    if (!busy) {
      setElapsedSeconds(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [busy]);

  const avoidList = useMemo(
    () =>
      avoid
        .split(/[、,\n]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    [avoid]
  );

  function baseInput() {
    return {
      mode,
      inspiration: inspiration.trim(),
      targetPlatform: "fanqie",
      targetLength,
      optionalDirection: optionalDirection === "自动判断" ? "" : optionalDirection,
      avoid: avoidList
    };
  }

  function validateInput() {
    if (mode === "inspiration" && !inspiration.trim()) {
      setError("输入一句灵感，或切到全自动。");
      return false;
    }

    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!outline) {
      await generateOutline();
      return;
    }

    await generateFullDraft();
  }

  async function generateOutline() {
    if (!validateInput()) {
      return;
    }

    const currentOutline = outline ? outlineDraftToResult(outlineDraft, outline) : null;
    const nextPreviousOutlines = [...previousOutlines, currentOutline].filter((item): item is StoryOutlineResult => Boolean(item)).slice(-4);

    setError("");
    setJob(null);
    setIsGeneratingOutline(true);
    setNotice(currentOutline ? "正在重新生成故事方案" : "正在生成故事方案");

    try {
      const result = await createStoryOutline({
        ...baseInput(),
        previousOutlines: nextPreviousOutlines
      });

      setOutline(result);
      setOutlineDraft(resultToDraft(result));
      setPreviousOutlines(nextPreviousOutlines);
      setNotice(result.providerNotice ?? "故事方案已生成。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事方案生成失败，请稍后再试。");
      setNotice("故事方案没有完成。");
    } finally {
      setIsGeneratingOutline(false);
    }
  }

  async function generateFullDraft() {
    if (!validateInput()) {
      return;
    }

    const approvedOutline = outlineDraftToResult(outlineDraft, outline);

    if (!approvedOutline.outline.trim()) {
      setError("先保留或编辑一个故事大纲，再生成全文。");
      return;
    }

    setError("");
    setIsGeneratingDraft(true);
    setJob(null);
    setNotice("正在开始生成全文");

    try {
      const startedJob = await startFullDraftJob({
        ...baseInput(),
        approvedOutline
      });

      setOutline(approvedOutline);
      setJob(startedJob);
      const completedJob = await waitForCompletion(startedJob, setJob);
      const result = completedJob.result;

      if (!result) {
        throw new Error(completedJob.error || "生成任务没有返回作品。");
      }

      setNotice(
        result.persisted
          ? "作品已保存，正在进入编辑器。"
          : "作品已保存到本地文件，正在进入编辑器。"
      );
      window.setTimeout(() => {
        window.location.assign(result.editorUrl);
      }, 400);
    } catch (caught) {
      setIsGeneratingDraft(false);
      setNotice("全文生成没有完成。");
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后再试。");
    }
  }

  async function resumeDraft() {
    if (!job?.jobId || !job.checkpoint?.canResume) {
      return;
    }

    setError("");
    setIsGeneratingDraft(true);
    setNotice("正在继续生成全文");

    try {
      const resumedJob = await resumeFullDraftJob(job.jobId);
      setJob(resumedJob);
      const completedJob = await waitForCompletion(resumedJob, setJob);
      const result = completedJob.result;

      if (!result) {
        throw new Error(completedJob.error || "继续生成没有返回作品。");
      }

      setNotice(result.persisted ? "作品已保存，正在进入编辑器。" : "作品已保存到本地文件，正在进入编辑器。");
      window.setTimeout(() => {
        window.location.assign(result.editorUrl);
      }, 400);
    } catch (caught) {
      setIsGeneratingDraft(false);
      setNotice("继续生成没有完成。");
      setError(caught instanceof Error ? caught.message : "继续生成失败，请稍后再试。");
    }
  }

  const progressValue = job?.progress ?? (isGeneratingOutline ? 28 : isGeneratingDraft ? 6 : 0);
  const activeProgress = job?.progressLabel ?? notice;
  const activeDetail = job?.detail ?? (isGeneratingOutline ? "正在生成可确认的标题和大纲。" : isGeneratingDraft ? "请保持页面打开。" : "先生成故事方案，满意后再写全文。");
  const checkpointText = job?.checkpoint
    ? `已写 ${job.checkpoint.completedSections}/${job.checkpoint.totalSections} 段 · 约 ${job.checkpoint.wordCount.toLocaleString("zh-CN")} 字`
    : "";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-116px)] max-w-5xl items-center py-8">
      <form onSubmit={submit} className="grid w-full gap-8">
        <section>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge className="border-ink bg-white text-ink">V2</Badge>
            <span className="text-sm text-muted">先定方案 · 再写全文 · 自动保存</span>
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-5xl">先确认故事方向，再生成完整短篇。</h1>
        </section>

        <section className="grid gap-5">
          <div className="inline-grid w-full grid-cols-2 rounded-lg border border-line bg-white p-1 sm:w-[420px]">
            <ModeButton active={mode === "inspiration"} icon={<PenLine size={16} />} label="有灵感" onClick={() => setMode("inspiration")} />
            <ModeButton active={mode === "autopilot"} icon={<Feather size={16} />} label="全自动" onClick={() => setMode("autopilot")} />
          </div>

          {mode === "inspiration" ? (
            <label className="grid gap-3">
              <span className="text-sm font-medium text-ink">灵感</span>
              <textarea
                value={inspiration}
                onChange={(event) => {
                  setInspiration(event.target.value);
                  resetOutline();
                }}
                placeholder="例如：女主发现丈夫把她的病历卖给了保险公司"
                className="min-h-[160px] resize-none rounded-lg border border-line bg-white px-5 py-4 text-base leading-8 outline-none transition focus:border-ink"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-line bg-white px-5 py-8">
              <p className="text-base font-medium text-ink">全自动</p>
              <p className="mt-2 text-sm leading-6 text-muted">不填写也可以开始。Agent 会自动选择更适合当前市场的方向，并生成完整短篇。</p>
            </div>
          )}

          <details className="rounded-lg border border-line bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink">
              <SlidersHorizontal size={16} />
              可选偏好
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
              <label htmlFor="optionalDirection" className="grid gap-2">
                <span className="text-sm font-medium text-ink">创作方向</span>
                <SelectInput
                  id="optionalDirection"
                  value={optionalDirection || "自动判断"}
                  onChange={(event) => {
                    setOptionalDirection(event.target.value);
                    resetOutline();
                  }}
                >
                  {directionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label htmlFor="targetLength" className="grid gap-2">
                <span className="text-sm font-medium text-ink">字数</span>
                <SelectInput
                  id="targetLength"
                  value={targetLength}
                  onChange={(event) => {
                    setTargetLength(event.target.value);
                    resetOutline();
                  }}
                >
                  {lengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label htmlFor="avoid" className="grid gap-2 md:col-span-2">
                <span className="text-sm font-medium text-ink">禁写方向</span>
                <input
                  id="avoid"
                  value={avoid}
                  onChange={(event) => {
                    setAvoid(event.target.value);
                    resetOutline();
                  }}
                  placeholder="例如：不要校园、不要古代、不要恐怖"
                  className="h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
                />
              </label>
            </div>
          </details>

          {outline ? (
            <section className="grid gap-4 rounded-lg border border-ink bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted">故事方案</p>
                  <p className="mt-1 text-sm text-ink">可以直接修改，确认后会按这版方案写全文。</p>
                </div>
                <Badge className="border-line bg-paper text-muted">{outlineDraft.outline.length} / 500 字</Badge>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">标题</span>
                <input
                  value={outlineDraft.title}
                  onChange={(event) => setOutlineDraft((current) => ({ ...current, title: event.target.value }))}
                  className="h-12 rounded-md border border-line bg-white px-3 text-base font-medium outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">方向赛道</span>
                <input
                  value={outlineDraft.direction}
                  onChange={(event) => setOutlineDraft((current) => ({ ...current, direction: event.target.value }))}
                  className="h-11 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">故事大纲</span>
                <textarea
                  value={outlineDraft.outline}
                  onChange={(event) => setOutlineDraft((current) => ({ ...current, outline: event.target.value }))}
                  className="min-h-[190px] resize-y rounded-md border border-line bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-ink"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">创作亮点</span>
                <textarea
                  value={outlineDraft.highlights}
                  onChange={(event) => setOutlineDraft((current) => ({ ...current, highlights: event.target.value }))}
                  className="min-h-[96px] resize-y rounded-md border border-line bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-ink"
                />
              </label>
              {outlineDraft.marketReason ? <p className="text-xs leading-5 text-muted">市场判断：{outlineDraft.marketReason}</p> : null}
            </section>
          ) : null}

          {error ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-ink">{error}</p> : null}

          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              {!outline ? (
                <Button type="submit" disabled={busy} className="min-h-12 w-full px-6 text-base sm:w-fit">
                  {isGeneratingOutline ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  {isGeneratingOutline ? "生成中" : "生成故事方案"}
                </Button>
              ) : (
                <>
                  <Button type="button" onClick={generateFullDraft} disabled={busy} className="min-h-12 w-full px-6 text-base sm:w-fit">
                    {isGeneratingDraft ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {isGeneratingDraft ? "生成全文中" : "确认生成全文"}
                  </Button>
                  <button
                    type="button"
                    onClick={generateOutline}
                    disabled={busy}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line bg-white px-5 text-sm font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGeneratingOutline ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                    重新生成方案
                  </button>
                  {job?.status === "failed" && job.checkpoint?.canResume ? (
                    <button
                      type="button"
                      onClick={resumeDraft}
                      disabled={busy}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-ink bg-white px-5 text-sm font-medium text-ink transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGeneratingDraft ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                      继续生成全文
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <div className="rounded-lg border border-line bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{activeProgress}</p>
                <span className="text-xs text-muted">
                  {busy ? `${progressValue}% · ${formatElapsed(elapsedSeconds)}` : outline ? "等待确认" : mode === "autopilot" ? "全自动" : "有灵感"}
                </span>
              </div>
              <Progress value={progressValue} />
              <p className="mt-3 text-sm leading-6 text-muted">{activeDetail}</p>
              {checkpointText ? <p className="mt-2 text-xs text-muted">{checkpointText}</p> : null}
            </div>
          </div>
        </section>
      </form>
    </main>
  );

  function resetOutline() {
    if (!outline || busy) {
      return;
    }

    setOutline(null);
    setOutlineDraft(emptyOutlineDraft);
    setPreviousOutlines([]);
    setNotice("偏好已变化，请重新生成故事方案。");
  }
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition ${
        active ? "bg-ink text-white" : "text-muted hover:bg-paper hover:text-ink"
      }`}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

function resultToDraft(result: StoryOutlineResult): OutlineDraft {
  return {
    title: result.title,
    direction: result.direction,
    outline: result.outline,
    highlights: result.highlights.join("\n"),
    marketReason: result.marketReason
  };
}

function outlineDraftToResult(draft: OutlineDraft, fallback: StoryOutlineResult | null): StoryOutlineResult {
  return {
    title: draft.title.trim() || fallback?.title || "未命名短篇",
    direction: draft.direction.trim() || fallback?.direction || "市场导向短篇",
    outline: draft.outline.trim() || fallback?.outline || "",
    highlights: draft.highlights
      .split(/\n|、|,/u)
      .map((item) => item.trim())
      .filter(Boolean),
    marketReason: draft.marketReason.trim() || fallback?.marketReason || "",
    providerMode: fallback?.providerMode,
    providerNotice: fallback?.providerNotice,
    modelName: fallback?.modelName
  };
}

async function waitForCompletion(startedJob: FullDraftJobSnapshot, onUpdate: (job: FullDraftJobSnapshot) => void) {
  let current = startedJob;

  while (current.status === "queued" || current.status === "running") {
    await sleep(1600);
    current = await getFullDraftJob(current.jobId);
    onUpdate(current);
  }

  if (current.status === "failed") {
    if (current.checkpoint?.canResume) {
      throw new Error(
        `已写 ${current.checkpoint.completedSections}/${current.checkpoint.totalSections} 段，约 ${current.checkpoint.wordCount.toLocaleString("zh-CN")} 字。可以继续生成。`
      );
    }

    throw new Error("生成没有完成，请稍后重试。");
  }

  return current;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes <= 0) {
    return `${rest} 秒`;
  }

  return `${minutes} 分 ${rest.toString().padStart(2, "0")} 秒`;
}
