"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Download, ListChecks, PenLine, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import type { Work } from "@shenbi/shared";
import { Badge, Button, Card, FieldLabel, GhostButton, SelectInput, TextInput } from "@/components/ui";
import { createWork, deleteWork, exportWorkWorkspace, getWorks, updateWork } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";

const linkButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-2 py-2 text-sm font-medium text-ink transition hover:border-ink";

type StatusFilter = "all" | Work["status"];

const statusOptions: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部作品" },
  { id: "draft", label: "草稿" },
  { id: "published", label: "已发布" },
  { id: "serializing", label: "连载中" },
  { id: "finished", label: "已完结" }
];

type WorkFormState = {
  title: string;
  platform: string;
  status: Work["status"];
  genreTags: string;
  styleTags: string;
  summary: string;
  fullText: string;
  readCount: string;
  subscriptionCount: string;
  revenue: string;
  completionRate: string;
  commentFeedback: string;
  commentKeywords: string;
};

const emptyForm: WorkFormState = {
  title: "",
  platform: "本地创作",
  status: "draft",
  genreTags: "现实女性",
  styleTags: "",
  summary: "",
  fullText: "",
  readCount: "",
  subscriptionCount: "",
  revenue: "",
  completionRate: "",
  commentFeedback: "",
  commentKeywords: ""
};

export function WorksShelf({ fallbackWorks }: { fallbackWorks: Work[] }) {
  const [works, setWorks] = useState<Work[]>(fallbackWorks);
  const [message, setMessage] = useState("正在读取本地作品库。");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getWorks()
      .then((result) => {
        setWorks(result);
        setMessage("已从后端读取作品；数据库未启动时会展示本地文件里的作品。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "后端暂时不可用，正在展示示例作品。");
      });
  }, []);

  const handleExport = async (work: Work) => {
    setExportingId(work.id);
    setMessage(`正在整理《${work.title}》的作品工程目录。`);

    try {
      const result = await exportWorkWorkspace(work.id);
      setMessage(`${result.message} 文件夹：${result.path}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败，请稍后再试。");
    } finally {
      setExportingId(null);
    }
  };

  const openCreateForm = () => {
    setEditingWorkId(null);
    setForm(emptyForm);
    setFormOpen(true);
    setMessage("可以手动把已有短篇建档，也可以只填标题和梗概，之后再去正文编辑器补全文。");
  };

  const openEditForm = (work: Work) => {
    setEditingWorkId(work.id);
    setForm({
      title: work.title,
      platform: work.platform,
      status: work.status,
      genreTags: work.genreTags.join("、"),
      styleTags: work.styleTags.join("、"),
      summary: work.summary,
      fullText: work.fullText ?? "",
      readCount: String(work.readCount || ""),
      subscriptionCount: String(work.subscriptionCount || ""),
      revenue: String(work.revenue || ""),
      completionRate: String(work.completionRate || ""),
      commentFeedback: work.commentFeedback ?? "",
      commentKeywords: work.commentKeywords?.join("、") ?? ""
    });
    setFormOpen(true);
    setMessage(`正在编辑《${work.title}》的作品资料。`);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingWorkId(null);
    setForm(emptyForm);
  };

  const handleSaveWork = async () => {
    if (!form.title.trim()) {
      setMessage("作品标题不能为空。");
      return;
    }

    setSaving(true);
    setMessage(editingWorkId ? "正在保存作品资料。" : "正在新建作品。");

    try {
      const payload = formToPayload(form);
      const result = editingWorkId ? await updateWork(editingWorkId, payload) : await createWork(payload);

      setWorks((current) => [result.work, ...current.filter((work) => work.id !== result.work.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setMessage(result.message);
      closeForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存作品失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWork = async (work: Work) => {
    if (!window.confirm(`确定要删除《${work.title}》吗？这会同时移除它的数据库记录和本地作品索引。`)) {
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
      if (editingWorkId === work.id) {
        closeForm();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除作品失败，请稍后再试。");
    } finally {
      setDeletingId(null);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = new Map<StatusFilter, number>([["all", works.length]]);

    statusOptions
      .filter((option) => option.id !== "all")
      .forEach((option) => {
        counts.set(
          option.id,
          works.filter((work) => work.status === option.id).length
        );
      });

    return counts;
  }, [works]);

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return works.filter((work) => {
      const matchesStatus = statusFilter === "all" || work.status === statusFilter;
      const searchableText = [
        work.title,
        work.platform,
        work.summary,
        sourceText(work),
        ...work.genreTags,
        ...work.styleTags,
        ...(work.commentKeywords ?? [])
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [query, statusFilter, works]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <button
              key={option.id}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                statusFilter === option.id ? "border-ink bg-ink text-white" : "border-line bg-paper text-muted hover:border-ink hover:text-ink"
              }`}
              onClick={() => setStatusFilter(option.id)}
            >
              {option.label} {statusCounts.get(option.id) ?? 0}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreateForm}>
            <Plus size={16} />
            手动建档
          </Button>
          <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink" href="/auto">
            <Sparkles size={16} />
            Agent 写作
          </Link>
        </div>
      </div>
      {formOpen ? (
        <div className="border-b border-line bg-paper px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <FormField label="作品标题">
              <TextInput value={form.title} onChange={(event) => setFormField(setForm, "title", event.target.value)} placeholder="例如：她把旧姓还给雨夜" />
            </FormField>
            <FormField label="平台">
              <TextInput value={form.platform} onChange={(event) => setFormField(setForm, "platform", event.target.value)} placeholder="番茄短故事 / 小红书 / 本地创作" />
            </FormField>
            <FormField label="状态">
              <SelectInput value={form.status} onChange={(event) => setFormField(setForm, "status", event.target.value as Work["status"])}>
                {statusOptions
                  .filter((option) => option.id !== "all")
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </SelectInput>
            </FormField>
            <FormField label="题材标签">
              <TextInput value={form.genreTags} onChange={(event) => setFormField(setForm, "genreTags", event.target.value)} placeholder="现实女性、亲情冲突" />
            </FormField>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <FormField label="风格标签">
              <TextInput value={form.styleTags} onChange={(event) => setFormField(setForm, "styleTags", event.target.value)} placeholder="克制反击、现实质感" />
            </FormField>
            <FormField label="阅读量">
              <TextInput value={form.readCount} onChange={(event) => setFormField(setForm, "readCount", event.target.value)} inputMode="numeric" />
            </FormField>
            <FormField label="收益">
              <TextInput value={form.revenue} onChange={(event) => setFormField(setForm, "revenue", event.target.value)} inputMode="decimal" />
            </FormField>
            <FormField label="完读率">
              <TextInput value={form.completionRate} onChange={(event) => setFormField(setForm, "completionRate", event.target.value)} inputMode="decimal" placeholder="0-100" />
            </FormField>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <FormField label="作品梗概">
              <textarea
                className="min-h-28 rounded-md border border-line bg-white px-3 py-3 text-sm outline-none focus:border-ink"
                value={form.summary}
                onChange={(event) => setFormField(setForm, "summary", event.target.value)}
                placeholder="写清主角、冲突、反转或结尾方向"
              />
            </FormField>
            <FormField label="正文全文">
              <textarea
                className="min-h-28 rounded-md border border-line bg-white px-3 py-3 text-sm outline-none focus:border-ink"
                value={form.fullText}
                onChange={(event) => setFormField(setForm, "fullText", event.target.value)}
                placeholder="可先留空，之后去正文编辑器继续补"
              />
            </FormField>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <FormField label="评论反馈">
              <TextInput value={form.commentFeedback} onChange={(event) => setFormField(setForm, "commentFeedback", event.target.value)} placeholder="读者说开头抓人，但中段略慢" />
            </FormField>
            <FormField label="评论关键词">
              <TextInput value={form.commentKeywords} onChange={(event) => setFormField(setForm, "commentKeywords", event.target.value)} placeholder="克制反击、节奏慢、结尾后劲" />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={saving} onClick={handleSaveWork}>
              <Save size={16} />
              {saving ? "保存中" : editingWorkId ? "保存资料" : "创建作品"}
            </Button>
            <GhostButton onClick={closeForm}>
              <X size={16} />
              取消
            </GhostButton>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 border-b border-line bg-paper px-5 py-4 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <TextInput
            aria-label="搜索作品"
            className="w-full pl-9"
            placeholder="搜索作品名、赛道、标签、平台"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex items-center text-sm text-muted">
          当前显示 {filteredWorks.length} / {works.length} 部
        </div>
      </div>
      <p className="border-b border-line px-5 py-3 text-sm text-muted">{message}</p>
      <div className="grid gap-4 p-5">
        {filteredWorks.map((work) => (
          <div key={work.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[84px_1fr_620px]">
            <Image src={work.cover} alt={work.title} width={84} height={122} className="h-[122px] rounded object-cover" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{work.title}</h2>
                <Badge>{work.platform}</Badge>
                <Badge>{statusLabel(work.status)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{work.summary}</p>
              {work.sourceLabel ? <p className="mt-2 text-xs leading-5 text-muted">数据来源：{sourceText(work)}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {[...work.genreTags, ...work.styleTags].map((tag, index) => (
                  <Badge key={`${tag}-${index}`}>{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-9">
              <Metric label="字数" value={formatNumber(work.wordCount)} />
              <Metric label="阅读" value={formatNumber(work.readCount)} />
              <Metric label="收益" value={formatMoney(work.revenue)} />
              <Metric label="完读率" value={`${work.completionRate}%`} />
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">作品详情</p>
                <Link className={`${linkButtonClass} mt-2`} href={`/works/${encodeURIComponent(work.id)}`}>
                  <BookOpen size={16} />
                  详情
                </Link>
              </div>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">正文编辑</p>
                <Link className={`${linkButtonClass} mt-2`} href={`/editor?workId=${encodeURIComponent(work.id)}`}>
                  <PenLine size={16} />
                  编辑
                </Link>
              </div>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">工程目录</p>
                <GhostButton className="mt-2 w-full px-2" disabled={exportingId === work.id} onClick={() => handleExport(work)}>
                  <Download size={16} />
                  {exportingId === work.id ? "导出中" : "导出工程"}
                </GhostButton>
              </div>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">资料 / 复盘</p>
                <Link className={`${linkButtonClass} mt-2`} href={`/review?workId=${encodeURIComponent(work.id)}`}>
                  <ListChecks size={16} />
                  复盘
                </Link>
                <GhostButton className="mt-2 w-full px-2" onClick={() => openEditForm(work)}>
                  <PenLine size={16} />
                  资料
                </GhostButton>
              </div>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-xs text-muted">删除作品</p>
                <GhostButton className="mt-2 w-full px-2" disabled={deletingId === work.id} onClick={() => handleDeleteWork(work)}>
                  <Trash2 size={16} />
                  {deletingId === work.id ? "删除中" : "删除"}
                </GhostButton>
              </div>
            </div>
          </div>
        ))}
        {filteredWorks.length === 0 ? (
          <div className="rounded-md border border-line bg-paper p-5 text-sm text-muted">没有找到匹配的作品，可以换一个关键词或切回全部作品。</div>
        ) : null}
      </div>
    </Card>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

function setFormField<K extends keyof WorkFormState>(
  setForm: Dispatch<SetStateAction<WorkFormState>>,
  key: K,
  value: WorkFormState[K]
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function formToPayload(form: WorkFormState) {
  return {
    title: form.title,
    platform: form.platform,
    status: form.status,
    genreTags: form.genreTags,
    styleTags: form.styleTags,
    summary: form.summary,
    fullText: form.fullText,
    readCount: optionalNumber(form.readCount),
    subscriptionCount: optionalNumber(form.subscriptionCount),
    revenue: optionalNumber(form.revenue),
    completionRate: optionalNumber(form.completionRate),
    commentFeedback: form.commentFeedback,
    commentKeywords: form.commentKeywords
  };
}

function optionalNumber(value: string) {
  const normalized = Number(value);
  return value.trim() && Number.isFinite(normalized) ? normalized : undefined;
}

function sourceText(work: Work) {
  return [work.sourceLabel, work.sourceDetail, work.importedAt ? `导入于 ${work.importedAt}` : ""].filter(Boolean).join(" · ");
}

function statusLabel(status: Work["status"]) {
  const labels: Record<Work["status"], string> = {
    draft: "草稿",
    published: "已发布",
    serializing: "连载中",
    finished: "已完结"
  };

  return labels[status] ?? status;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
