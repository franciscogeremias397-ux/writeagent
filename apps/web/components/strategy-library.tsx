"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Edit3, Save, Search, Trash2, X } from "lucide-react";
import type { PersonalStrategy } from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, GhostButton, Progress, TextInput } from "@/components/ui";
import { createPersonalStrategy, deletePersonalStrategy, getPersonalStrategies, updatePersonalStrategy } from "@/lib/api";

type StrategyFormState = {
  genre: string;
  rule: string;
  evidence: string;
  action: string;
  confidence: string;
};

const emptyForm: StrategyFormState = {
  genre: "女性成长",
  rule: "",
  evidence: "",
  action: "",
  confidence: "80"
};

type StrategyFilter = "all" | PersonalStrategy["sourceType"] | "disabled";

const strategyFilters: Array<{ value: StrategyFilter; label: string }> = [
  { value: "all", label: "全部策略" },
  { value: "review", label: "复盘策略" },
  { value: "platform_result", label: "平台表现" },
  { value: "manual_rule", label: "手动策略" },
  { value: "editor_feedback", label: "改稿沉淀" },
  { value: "disabled", label: "已停用" }
];

const linkButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink";

export function StrategyLibrary() {
  const [strategies, setStrategies] = useState<PersonalStrategy[]>([]);
  const [form, setForm] = useState<StrategyFormState>(emptyForm);
  const [message, setMessage] = useState("正在读取个人策略库。");
  const [activeFilter, setActiveFilter] = useState<StrategyFilter>("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StrategyFormState>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    getPersonalStrategies()
      .then((result) => {
        setStrategies(result);
        setMessage(result.length ? "已读取个人策略库；复盘生成后会自动沉淀新策略。" : "还没有个人策略，生成复盘后会自动沉淀。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "个人策略库暂时不可用。");
      });
  }

  async function handleCreate() {
    if (!form.rule.trim()) {
      setMessage("请先写下这条策略的核心规则。");
      return;
    }

    setSaving(true);
    setMessage("正在保存个人策略。");

    try {
      const strategy = await createPersonalStrategy({
        sourceType: "manual_rule",
        genre: form.genre.trim() || "通用",
        rule: form.rule.trim(),
        evidence: form.evidence.trim(),
        action: form.action.trim(),
        confidence: toConfidence(form.confidence),
        enabled: true
      });
      setStrategies((current) => [strategy, ...current]);
      setForm(emptyForm);
      setMessage(strategy.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存个人策略失败。");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStrategy(strategy: PersonalStrategy) {
    const nextEnabled = !strategy.enabled;
    setStrategies((current) => current.map((item) => (item.id === strategy.id ? { ...item, enabled: nextEnabled } : item)));

    try {
      const result = await updatePersonalStrategy(strategy.id, { enabled: nextEnabled });
      setMessage(result.message);
    } catch (error) {
      setStrategies((current) => current.map((item) => (item.id === strategy.id ? strategy : item)));
      setMessage(error instanceof Error ? error.message : "更新个人策略失败。");
    }
  }

  function startEdit(strategy: PersonalStrategy) {
    setEditingId(strategy.id);
    setEditForm({
      genre: strategy.genre,
      rule: strategy.rule,
      evidence: strategy.evidence,
      action: strategy.action,
      confidence: String(strategy.confidence)
    });
  }

  async function saveEdit(strategy: PersonalStrategy) {
    if (!editForm.rule.trim()) {
      setMessage("策略规则不能为空。");
      return;
    }

    const patch = {
      genre: editForm.genre.trim() || "通用",
      rule: editForm.rule.trim(),
      evidence: editForm.evidence.trim(),
      action: editForm.action.trim(),
      confidence: toConfidence(editForm.confidence)
    };

    setSavingId(strategy.id);
    setMessage("正在保存这条个人策略。");
    setStrategies((current) => current.map((item) => (item.id === strategy.id ? { ...item, ...patch } : item)));

    try {
      const result = await updatePersonalStrategy(strategy.id, patch);
      setMessage(result.message);
      setEditingId(null);
    } catch (error) {
      setStrategies((current) => current.map((item) => (item.id === strategy.id ? strategy : item)));
      setMessage(error instanceof Error ? error.message : "保存个人策略失败。");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteStrategy(strategy: PersonalStrategy) {
    if (!window.confirm("确定删除这条个人策略吗？删除后它不会再反哺下一篇写作。")) {
      return;
    }

    setDeletingId(strategy.id);
    setMessage("正在删除个人策略。");
    setStrategies((current) => current.filter((item) => item.id !== strategy.id));

    try {
      const result = await deletePersonalStrategy(strategy.id);
      setMessage(result.message);
      if (editingId === strategy.id) {
        setEditingId(null);
      }
    } catch (error) {
      setStrategies((current) => [strategy, ...current]);
      setMessage(error instanceof Error ? error.message : "删除个人策略失败。");
    } finally {
      setDeletingId(null);
    }
  }

  const filterCounts = useMemo(() => {
    const counts = new Map<StrategyFilter, number>([["all", strategies.length]]);

    strategyFilters
      .filter((filter) => filter.value !== "all")
      .forEach((filter) => {
        counts.set(
          filter.value,
          strategies.filter((strategy) => (filter.value === "disabled" ? !strategy.enabled : strategy.sourceType === filter.value)).length
        );
      });

    return counts;
  }, [strategies]);

  const filteredStrategies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return strategies.filter((strategy) => {
      const matchesFilter =
        activeFilter === "all" ? true : activeFilter === "disabled" ? !strategy.enabled : strategy.sourceType === activeFilter;
      const searchableText = [
        strategy.genre,
        sourceTypeLabel(strategy.sourceType),
        strategy.rule,
        strategy.evidence,
        strategy.action,
        strategy.enabled ? "启用" : "停用"
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, query, strategies]);

  return (
    <Card id="personal-strategy-library" className="scroll-mt-6">
      <CardHeader title="个人策略库" action={<Badge>会反哺下一篇写作</Badge>} />
      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
        {strategyFilters.map((filter) => (
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
      <div className="grid gap-3 border-b border-line bg-paper px-5 py-4 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <TextInput
            aria-label="搜索个人策略"
            className="w-full pl-9"
            placeholder="搜索题材、策略、证据、下次动作"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex items-center text-sm text-muted">
          当前显示 {filteredStrategies.length} / {strategies.length} 条
        </div>
      </div>
      <p className="border-b border-line px-5 py-3 text-sm text-muted">{message}</p>

      <div className="border-b border-line bg-paper px-5 py-4">
        <div className="grid gap-3 lg:grid-cols-[160px_1fr_120px]">
          <label className="grid gap-2 text-xs font-medium text-muted">
            适用题材
            <TextInput value={form.genre} onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))} />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            核心策略
            <TextInput
              placeholder="例如：女性成长题材继续保留现实细节 + 克制反击"
              value={form.rule}
              onChange={(event) => setForm((current) => ({ ...current, rule: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            置信度
            <TextInput
              type="number"
              min={1}
              max={100}
              value={form.confidence}
              onChange={(event) => setForm((current) => ({ ...current, confidence: event.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-2 text-xs font-medium text-muted">
            证据
            <textarea
              className="min-h-20 rounded-md border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-ink"
              placeholder="这条策略来自哪次复盘、哪部作品、什么表现"
              value={form.evidence}
              onChange={(event) => setForm((current) => ({ ...current, evidence: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-xs font-medium text-muted">
            下次执行动作
            <textarea
              className="min-h-20 rounded-md border border-line bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-ink"
              placeholder="下次写作时具体怎么用它"
              value={form.action}
              onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={handleCreate} disabled={saving}>
            <Save size={16} />
            {saving ? "保存中..." : "保存策略"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        {filteredStrategies.map((strategy) => (
          <div key={strategy.id} className="grid gap-4 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_180px]">
            {editingId === strategy.id ? (
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-[160px_1fr_120px]">
                  <TextInput value={editForm.genre} onChange={(event) => setEditForm((current) => ({ ...current, genre: event.target.value }))} />
                  <TextInput value={editForm.rule} onChange={(event) => setEditForm((current) => ({ ...current, rule: event.target.value }))} />
                  <TextInput
                    type="number"
                    min={1}
                    max={100}
                    value={editForm.confidence}
                    onChange={(event) => setEditForm((current) => ({ ...current, confidence: event.target.value }))}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <textarea
                    className="min-h-20 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                    value={editForm.evidence}
                    onChange={(event) => setEditForm((current) => ({ ...current, evidence: event.target.value }))}
                  />
                  <textarea
                    className="min-h-20 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                    value={editForm.action}
                    onChange={(event) => setEditForm((current) => ({ ...current, action: event.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{strategy.genre}</Badge>
                  <Badge>{sourceTypeLabel(strategy.sourceType)}</Badge>
                  <Badge>{strategy.enabled ? "启用" : "停用"}</Badge>
                </div>
                <p className="mt-3 font-medium">{strategy.rule}</p>
                <p className="mt-2 text-sm leading-6 text-muted">证据：{strategy.evidence || "暂无"}</p>
                <p className="mt-1 text-sm leading-6 text-muted">下次动作：{strategy.action}</p>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted">置信度</span>
                <span>{strategy.confidence}%</span>
              </div>
              <Progress value={strategy.confidence} />
              {editingId === strategy.id ? (
                <div className="mt-4 grid gap-2">
                  <Button className="w-full" disabled={savingId === strategy.id} onClick={() => saveEdit(strategy)}>
                    <Save size={16} />
                    {savingId === strategy.id ? "保存中" : "保存"}
                  </Button>
                  <GhostButton className="w-full" onClick={() => setEditingId(null)}>
                    <X size={16} />
                    取消
                  </GhostButton>
                </div>
              ) : (
                <div className="mt-4 grid gap-2">
                  <Link className={linkButtonClass} href={nextStoryLink(strategy)}>
                    用它写下一篇
                    <ArrowRight size={16} />
                  </Link>
                  <GhostButton className="w-full" onClick={() => startEdit(strategy)}>
                    <Edit3 size={16} />
                    编辑
                  </GhostButton>
                  <GhostButton className="w-full" onClick={() => toggleStrategy(strategy)}>
                    {strategy.enabled ? "停用" : "启用"}
                  </GhostButton>
                  <GhostButton className="w-full" disabled={deletingId === strategy.id} onClick={() => deleteStrategy(strategy)}>
                    <Trash2 size={16} />
                    {deletingId === strategy.id ? "删除中" : "删除"}
                  </GhostButton>
                </div>
              )}
            </div>
          </div>
        ))}
        {strategies.length === 0 ? (
          <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">暂无策略。你可以手动保存一条，或先去复盘分析里生成复盘。</p>
        ) : null}
        {strategies.length > 0 && filteredStrategies.length === 0 ? (
          <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">没有找到匹配的个人策略，可以换一个关键词或切回全部策略。</p>
        ) : null}
      </div>
    </Card>
  );
}

function toConfidence(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 75;
  }

  return Math.min(100, Math.max(1, parsed));
}

function sourceTypeLabel(value: PersonalStrategy["sourceType"]) {
  const labels: Record<PersonalStrategy["sourceType"], string> = {
    review: "复盘策略",
    platform_result: "平台表现",
    manual_rule: "手动策略",
    editor_feedback: "改稿沉淀"
  };

  return labels[value];
}

function nextStoryLink(strategy: PersonalStrategy) {
  const params = new URLSearchParams({
    platform: "番茄短故事",
    genre: strategy.genre,
    note: nextStoryNote(strategy)
  });

  return `/auto?${params.toString()}`;
}

function nextStoryNote(strategy: PersonalStrategy) {
  return `基于个人策略生成下一篇。策略：${strategy.rule}。依据：${strategy.evidence || "暂无"}。下次动作：${strategy.action || "写作前先检查这条策略是否适用。"}。请按这条策略执行，同时更换具体人物关系、场景物件和反转桥段，避免复刻已有作品。`;
}
