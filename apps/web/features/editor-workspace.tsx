"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, Loader2, Save } from "lucide-react";
import type { Work } from "@shenbi/shared";
import { Badge, Button, Card, SelectInput } from "@/components/ui";
import { getWork, getWorks, updateWork } from "@/lib/api";
import { copyPlainText } from "@/lib/clipboard";

function countText(value: string) {
  return value.replace(/\s+/g, "").length;
}

export function EditorWorkspace() {
  const searchParams = useSearchParams();
  const queryWorkId = searchParams.get("workId") ?? "";
  const [works, setWorks] = useState<Work[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState(queryWorkId);
  const [title, setTitle] = useState("未命名短篇");
  const [fullText, setFullText] = useState("");
  const [message, setMessage] = useState("正在读取正文。");
  const [saveStatus, setSaveStatus] = useState("自动保存准备中。");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const loadingWorkRef = useRef(false);
  const lastSavedRef = useRef("");

  useEffect(() => {
    getWorks()
      .then((items) => {
        const editableWorks = items.filter(isEditableWork);
        const nextWorkId = queryWorkId || editableWorks[0]?.id || "";

        setWorks(editableWorks);

        if (nextWorkId) {
          setSelectedWorkId(nextWorkId);
          void loadWork(nextWorkId);
        } else {
          setIsLoading(false);
          setMessage("还没有可编辑正文。先回首页生成一篇短篇。");
          setSaveStatus("没有可保存的作品。");
        }
      })
      .catch((error: unknown) => {
        setIsLoading(false);
        setMessage(error instanceof Error ? error.message : "暂时没有读到作品列表。");
        setSaveStatus("请回首页生成一篇正文。");
      });
  }, [queryWorkId]);

  useEffect(() => {
    if (loadingWorkRef.current || !selectedWorkId || isLoading) {
      return undefined;
    }

    if (lastSavedRef.current === snapshotValue(title, fullText)) {
      return undefined;
    }

    setSaveStatus("正在等待自动保存。");
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveDraft("auto");
    }, 1200);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [fullText, isLoading, selectedWorkId, title]);

  const wordCount = useMemo(() => countText(fullText), [fullText]);

  async function loadWork(workId: string) {
    loadingWorkRef.current = true;
    setIsLoading(true);
    setMessage("正在打开作品。");

    try {
      const work = await getWork(workId);
      const nextFullText = work.fullText?.trim() || work.summary || "";

      setTitle(work.title);
      setFullText(nextFullText);
      setCurrentWork(work);
      setSelectedWorkId(work.id);
      setMessage(`正在编辑《${work.title}》。`);
      setSaveStatus("自动保存已准备好。");
      lastSavedRef.current = snapshotValue(work.title, nextFullText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品读取失败。");
      setSaveStatus("请回作品列表重新打开。");
    } finally {
      loadingWorkRef.current = false;
      setIsLoading(false);
    }
  }

  async function saveDraft(mode: "auto" | "manual") {
    if (!selectedWorkId || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveStatus(mode === "auto" ? "正在自动保存。" : "正在保存。");

    try {
      const result = await updateWork(selectedWorkId, {
        title: title.trim() || "未命名短篇",
        fullText,
        wordCount
      });

      setTitle(result.work.title);
      setCurrentWork(result.work);
      setWorks((current) => [result.work, ...current.filter((work) => work.id !== result.work.id)].filter(isEditableWork));
      lastSavedRef.current = snapshotValue(result.work.title, fullText);
      setSaveStatus(result.persisted ? "已保存到本地数据库。" : "已保存到本地文件。");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "保存失败，请稍后再试。");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyDraft() {
    await copyPlainText(fullText);
    setSaveStatus(`正文已复制，约 ${wordCount.toLocaleString("zh-CN")} 字。`);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 py-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">正文编辑器</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">修改这篇短篇。</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{wordCount.toLocaleString("zh-CN")} 字</Badge>
          {currentWork ? <Badge className={generationBadgeClass(currentWork)}>{generationLabel(currentWork)}</Badge> : null}
          <Badge>{saveStatus}</Badge>
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-line p-5 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-ink">作品</span>
            <SelectInput
              value={selectedWorkId}
              onChange={(event) => {
                const workId = event.target.value;
                setSelectedWorkId(workId);
                void loadWork(workId);
              }}
              disabled={!works.length || isLoading}
            >
              {works.length ? (
                works.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title}
                  </option>
                ))
              ) : (
                <option value="">暂无作品</option>
              )}
            </SelectInput>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-ink">标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm font-medium outline-none focus:border-ink"
              disabled={isLoading}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveDraft("manual")} disabled={isSaving || isLoading || !selectedWorkId}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              保存
            </Button>
            <button
              type="button"
              onClick={copyDraft}
              disabled={isLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy size={16} />
              复制正文
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Check size={16} className="text-ink" />
            <span>{message}</span>
          </div>
          <textarea
            value={fullText}
            onChange={(event) => setFullText(event.target.value)}
            disabled={isLoading}
            className="min-h-[calc(100vh-330px)] resize-y rounded-md border border-line bg-white px-5 py-4 text-base leading-8 outline-none focus:border-ink"
          />
        </div>
      </Card>
    </main>
  );
}

function snapshotValue(title: string, fullText: string) {
  return `${title.trim()}\n---\n${fullText}`;
}

function isEditableWork(work: Work) {
  return work.wordCount > 0 && !isValidationWork(work);
}

function isValidationWork(work: Work) {
  const text = `${work.title} ${work.summary}`.toLowerCase();

  return /验证|接口自测|页面校正|截图校正|授权采集|自动工程包/u.test(text);
}

function generationLabel(work: Work) {
  const generation = work.generation;

  if (generation?.route === "kimi_full_text") {
    return generation.proseModel ? `Kimi ${generation.proseModel}` : "Kimi 正文";
  }

  if (generation?.route === "legacy_deepseek" || work.styleTags.some((tag) => tag.toLowerCase() === "deepseek")) {
    return "旧 DeepSeek";
  }

  return "来源未标注";
}

function generationBadgeClass(work: Work) {
  const generation = work.generation;

  if (generation?.route === "kimi_full_text") {
    return "border-ink bg-white text-ink";
  }

  if (generation?.route === "legacy_deepseek" || work.styleTags.some((tag) => tag.toLowerCase() === "deepseek")) {
    return "border-line bg-paper text-muted";
  }

  return "border-line bg-white text-muted";
}
