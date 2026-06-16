"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Save, Search, Trash2, X } from "lucide-react";
import type { WritingMemory } from "@shenbi/shared";
import { Badge, Button, Card, GhostButton, Progress, SelectInput, TextInput } from "@/components/ui";
import { createWritingMemory, deleteWritingMemory, getWritingMemories, updateWritingMemory } from "@/lib/api";

type MemoryFormState = {
  sourceType: WritingMemory["sourceType"];
  genre: string;
  rule: string;
  positiveExample: string;
  negativeExample: string;
  confidence: string;
};

const sourceTypeOptions: Array<{ value: WritingMemory["sourceType"]; label: string }> = [
  { value: "manual_rule", label: "手动规则" },
  { value: "user_feedback", label: "改稿反馈" },
  { value: "review", label: "复盘经验" },
  { value: "platform_result", label: "平台表现" },
  { value: "reader_report", label: "读者评审" }
];

const emptyForm: MemoryFormState = {
  sourceType: "manual_rule",
  genre: "女性成长",
  rule: "",
  positiveExample: "",
  negativeExample: "",
  confidence: "75"
};

type MemoryFilter = "all" | WritingMemory["sourceType"] | "disabled";

const memoryFilters: Array<{ value: MemoryFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "user_feedback", label: "改稿反馈" },
  { value: "platform_result", label: "平台表现" },
  { value: "review", label: "复盘经验" },
  { value: "reader_report", label: "读者评审" },
  { value: "manual_rule", label: "手动规则" },
  { value: "disabled", label: "已停用" }
];

export function MemoryLibrary({ fallbackMemories }: { fallbackMemories: WritingMemory[] }) {
  const [memories, setMemories] = useState<WritingMemory[]>(fallbackMemories);
  const [message, setMessage] = useState("正在读取后端写作记忆。");
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState<MemoryFormState>(emptyForm);
  const [activeFilter, setActiveFilter] = useState<MemoryFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MemoryFormState>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    getWritingMemories()
      .then((result) => {
        setMemories(result);
        setMessage("已从后端读取写作记忆；数据库启动后会优先展示本地数据库内容。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "后端暂时不可用，正在展示示例记忆。");
      });
  }

  async function handleCreate() {
    if (!createForm.rule.trim()) {
      setMessage("请先写下这条记忆的核心规则。");
      return;
    }

    setIsCreating(true);
    setMessage("正在新增这条写作记忆。");

    try {
      const memory = await createWritingMemory({
        sourceType: createForm.sourceType,
        genre: createForm.genre.trim() || "通用",
        rule: createForm.rule.trim(),
        positiveExample: createForm.positiveExample.trim(),
        negativeExample: createForm.negativeExample.trim(),
        confidence: toConfidence(createForm.confidence),
        relatedWorkIds: [],
        enabled: true
      });
      setMemories((current) => [memory, ...current]);
      setMessage(memory.message);
      setCreateForm(emptyForm);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增记忆失败。");
    } finally {
      setIsCreating(false);
    }
  }

  async function toggleMemory(memory: WritingMemory) {
    const nextEnabled = !memory.enabled;
    setMemories((current) => current.map((item) => (item.id === memory.id ? { ...item, enabled: nextEnabled } : item)));

    try {
      const result = await updateWritingMemory(memory.id, { enabled: nextEnabled });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新记忆失败。");
      setMemories((current) => current.map((item) => (item.id === memory.id ? { ...item, enabled: memory.enabled } : item)));
    }
  }

  function startEdit(memory: WritingMemory) {
    setEditingId(memory.id);
    setEditForm({
      sourceType: memory.sourceType,
      genre: memory.genre,
      rule: memory.rule,
      positiveExample: memory.positiveExample,
      negativeExample: memory.negativeExample,
      confidence: String(memory.confidence)
    });
  }

  async function saveEdit(memory: WritingMemory) {
    if (!editForm.rule.trim()) {
      setMessage("记忆规则不能为空。");
      return;
    }

    setSavingId(memory.id);
    setMessage("正在保存这条写作记忆。");

    const patch = {
      genre: editForm.genre.trim() || "通用",
      rule: editForm.rule.trim(),
      positiveExample: editForm.positiveExample.trim(),
      negativeExample: editForm.negativeExample.trim(),
      confidence: toConfidence(editForm.confidence)
    };

    setMemories((current) => current.map((item) => (item.id === memory.id ? { ...item, ...patch } : item)));

    try {
      const result = await updateWritingMemory(memory.id, patch);
      setMessage(result.message);
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存记忆失败。");
      setMemories((current) => current.map((item) => (item.id === memory.id ? memory : item)));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteMemory(memory: WritingMemory) {
    if (!window.confirm("确定删除这条写作记忆吗？删除后它不会再参与下一次写作。")) {
      return;
    }

    setDeletingId(memory.id);
    setMessage("正在删除这条写作记忆。");
    setMemories((current) => current.filter((item) => item.id !== memory.id));

    try {
      const result = await deleteWritingMemory(memory.id);
      setMessage(result.message);
      if (editingId === memory.id) {
        setEditingId(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除记忆失败。");
      setMemories((current) => [memory, ...current]);
    } finally {
      setDeletingId(null);
    }
  }

  const filterCounts = useMemo(() => {
    const counts = new Map<MemoryFilter, number>([["all", memories.length]]);

    memoryFilters
      .filter((filter) => filter.value !== "all")
      .forEach((filter) => {
        counts.set(
          filter.value,
          memories.filter((memory) => (filter.value === "disabled" ? !memory.enabled : memory.sourceType === filter.value)).length
        );
      });

    return counts;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return memories.filter((memory) => {
      const matchesFilter =
        activeFilter === "all" ? true : activeFilter === "disabled" ? !memory.enabled : memory.sourceType === activeFilter;
      const searchableText = [
        memory.genre,
        sourceTypeLabel(memory.sourceType),
        memory.rule,
        memory.positiveExample,
        memory.negativeExample,
        memory.enabled ? "启用" : "停用"
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, memories, query]);

  return (
    <Card id="writing-memory-library" className="scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {memoryFilters.map((filter) => (
            <button
              key={filter.value}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                activeFilter === filter.value ? "border-ink bg-ink text-white" : "border-line bg-paper text-muted hover:border-ink hover:text-ink"
              }`}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label} {filterCounts.get(filter.value) ?? 0}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 border-b border-line bg-paper px-5 py-4 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <TextInput
            aria-label="搜索写作记忆"
            className="w-full pl-9"
            placeholder="搜索题材、规则、正向例子、反向例子"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex items-center text-sm text-muted">
          当前显示 {filteredMemories.length} / {memories.length} 条
        </div>
      </div>
      <p className="border-b border-line px-5 py-3 text-sm text-muted">{message}</p>
      <div className="border-b border-line bg-paper px-5 py-4">
        <div className="grid gap-3 lg:grid-cols-[160px_160px_1fr_120px]">
          <label className="grid gap-2 text-xs font-medium text-muted">
            来源类型
            <SelectInput
              value={createForm.sourceType}
              onChange={(event) => setCreateForm((current) => ({ ...current, sourceType: event.target.value as WritingMemory["sourceType"] }))}
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            适用题材
            <TextInput value={createForm.genre} onChange={(event) => setCreateForm((current) => ({ ...current, genre: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            核心规则
            <TextInput
              placeholder="例如：主角反击必须靠自己完成，不要突然空降外援"
              value={createForm.rule}
              onChange={(event) => setCreateForm((current) => ({ ...current, rule: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            置信度
            <TextInput
              type="number"
              min={1}
              max={100}
              value={createForm.confidence}
              onChange={(event) => setCreateForm((current) => ({ ...current, confidence: event.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-2 text-xs font-medium text-muted">
            正向例子
            <textarea
              className="min-h-20 rounded-md border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-ink"
              placeholder="写出你希望它学习的好写法"
              value={createForm.positiveExample}
              onChange={(event) => setCreateForm((current) => ({ ...current, positiveExample: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            反向例子
            <textarea
              className="min-h-20 rounded-md border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-ink"
              placeholder="写出你希望它避免的套路"
              value={createForm.negativeExample}
              onChange={(event) => setCreateForm((current) => ({ ...current, negativeExample: event.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={handleCreate} disabled={isCreating}>
            <Save size={16} />
            {isCreating ? "新增中..." : "保存新记忆"}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        {filteredMemories.map((memory) => (
          <div key={memory.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_180px]">
            {editingId === memory.id ? (
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-[160px_1fr_120px]">
                  <SelectInput
                    value={editForm.sourceType}
                    disabled
                    onChange={(event) => setEditForm((current) => ({ ...current, sourceType: event.target.value as WritingMemory["sourceType"] }))}
                  >
                    {sourceTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                  <TextInput value={editForm.genre} onChange={(event) => setEditForm((current) => ({ ...current, genre: event.target.value }))} />
                  <TextInput
                    type="number"
                    min={1}
                    max={100}
                    value={editForm.confidence}
                    onChange={(event) => setEditForm((current) => ({ ...current, confidence: event.target.value }))}
                  />
                </div>
                <TextInput value={editForm.rule} onChange={(event) => setEditForm((current) => ({ ...current, rule: event.target.value }))} />
                <div className="grid gap-3 md:grid-cols-2">
                  <textarea
                    className="min-h-20 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                    value={editForm.positiveExample}
                    onChange={(event) => setEditForm((current) => ({ ...current, positiveExample: event.target.value }))}
                  />
                  <textarea
                    className="min-h-20 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                    value={editForm.negativeExample}
                    onChange={(event) => setEditForm((current) => ({ ...current, negativeExample: event.target.value }))}
                  />
                </div>
              </div>
            ) : (
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
            )}
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted">置信度</span>
                <span>{memory.confidence}%</span>
              </div>
              <Progress value={memory.confidence} />
              {editingId === memory.id ? (
                <div className="mt-4 grid gap-2">
                  <Button className="w-full" disabled={savingId === memory.id} onClick={() => saveEdit(memory)}>
                    <Save size={16} />
                    {savingId === memory.id ? "保存中" : "保存"}
                  </Button>
                  <GhostButton className="w-full" onClick={() => setEditingId(null)}>
                    <X size={16} />
                    取消
                  </GhostButton>
                </div>
              ) : (
                <div className="mt-4 grid gap-2">
                  <GhostButton className="w-full" onClick={() => startEdit(memory)}>
                    <Edit3 size={16} />
                    编辑
                  </GhostButton>
                  <GhostButton className="w-full" onClick={() => toggleMemory(memory)}>
                    {memory.enabled ? "停用" : "启用"}
                  </GhostButton>
                  <GhostButton className="w-full" disabled={deletingId === memory.id} onClick={() => deleteMemory(memory)}>
                    <Trash2 size={16} />
                    {deletingId === memory.id ? "删除中" : "删除"}
                  </GhostButton>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredMemories.length === 0 ? (
          <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">没有找到匹配的写作记忆，可以换一个关键词或切回全部类型。</p>
        ) : null}
      </div>
    </Card>
  );
}

function toConfidence(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 70;
  }

  return Math.min(100, Math.max(1, parsed));
}

function sourceTypeLabel(value: WritingMemory["sourceType"]) {
  return sourceTypeOptions.find((option) => option.value === value)?.label ?? value;
}
