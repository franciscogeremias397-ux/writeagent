"use client";

import Link from "next/link";
import { ArrowRight, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Work } from "@shenbi/shared";
import { Badge, Card, GhostButton, TextInput } from "@/components/ui";
import { deleteWork, getWorks } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function WorksShelf() {
  const [works, setWorks] = useState<Work[]>([]);
  const [message, setMessage] = useState("正在读取作品。");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getWorks()
      .then((result) => {
        const editableWorks = result.filter(isEditableWork);

        setWorks(editableWorks);
        setMessage(editableWorks.length ? "点击作品即可继续编辑。" : "还没有可编辑正文，先从首页生成一篇。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "暂时没有读到作品。");
      });
  }, []);

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return works;
    }

    return works.filter((work) =>
      [work.title, work.summary, work.platform, ...work.genreTags, ...work.styleTags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, works]);

  async function handleDeleteWork(work: Work) {
    if (!window.confirm(`确定删除《${work.title}》吗？这会移除本地作品记录。`)) {
      return;
    }

    setDeletingId(work.id);
    setMessage(`正在删除《${work.title}》。`);

    try {
      const result = await deleteWork(work.id);

      if (result.deleted) {
        setWorks((current) => current.filter((item) => item.id !== work.id));
      }

      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败，请稍后再试。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 border-b border-line bg-white px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <TextInput
            aria-label="搜索作品"
            className="w-full pl-9"
            placeholder="搜索标题、方向或关键词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80">
          <Sparkles size={16} />
          写新故事
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3 text-sm text-muted">
        <span>{message}</span>
        <span>
              {filteredWorks.length} / {works.length} 篇
        </span>
      </div>

      <div className="grid gap-3 p-5">
        {filteredWorks.map((work) => (
          <article key={work.id} className="group rounded-md border border-line bg-white transition hover:border-ink">
            <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <Link href={`/editor?workId=${encodeURIComponent(work.id)}`} className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-lg font-semibold text-ink">{work.title}</h2>
                  <Badge>{primaryDirection(work)}</Badge>
                  <Badge>{formatNumber(work.wordCount)} 字</Badge>
                  <Badge className={generationBadgeClass(work)}>{generationLabel(work)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{displaySummary(work)}</p>
                <p className="mt-3 text-xs text-muted">更新于 {formatDate(work.updatedAt)}</p>
              </Link>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`/editor?workId=${encodeURIComponent(work.id)}`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition group-hover:border-ink"
                >
                  <PenLine size={16} />
                  编辑正文
                  <ArrowRight size={15} />
                </Link>
                <GhostButton className="px-3" disabled={deletingId === work.id} onClick={() => handleDeleteWork(work)} title="删除作品">
                  <Trash2 size={16} />
                  {deletingId === work.id ? "删除中" : "删除"}
                </GhostButton>
              </div>
            </div>
          </article>
        ))}

        {filteredWorks.length === 0 ? (
          <div className="grid gap-4 rounded-md border border-line bg-paper p-6 text-center">
            <p className="text-sm text-muted">{works.length ? "没有找到匹配的作品。" : "还没有可编辑正文。"}</p>
            <Link href="/" className="mx-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80">
              <Sparkles size={16} />
              去写第一篇
            </Link>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function primaryDirection(work: Work) {
  return work.genreTags[0] || work.styleTags[0] || "短篇";
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

function isEditableWork(work: Work) {
  return work.wordCount > 0 && !isValidationWork(work);
}

function displaySummary(work: Work) {
  const summary = work.summary
    ?.replace(/市场判断[:：][\s\S]*$/u, "")
    .replace(/自检摘要[:：][\s\S]*$/u, "")
    .replace(/来自作品表现\s*CSV\s*导入[\s\S]*$/u, "")
    .trim();

  return summary || "打开后可继续编辑正文。";
}

function isValidationWork(work: Work) {
  const text = `${work.title} ${work.summary}`.toLowerCase();

  return /验证|接口自测|页面校正|截图校正|授权采集|自动工程包/u.test(text);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
