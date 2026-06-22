"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { trends as fallbackTrends, type AutoWritingPreset, type PersonalStrategy, type StoryPlan, type Trend, type WritingMemory } from "@shenbi/shared";
import { PlanResult } from "@/components/plan-result";
import { Badge, Button, Card, CardHeader, ComplianceNotice, FieldLabel, GhostButton, SelectInput } from "@/components/ui";
import { createStoryFromAuto, deleteWritingAsset, getPersonalStrategies, getTrends, getWritingAssets, getWritingMemories, saveAutoPreset } from "@/lib/api";

const fieldOptions = {
  platform: ["番茄短故事", "番茄小说", "其他平台"],
  genre: ["女性成长", "现言甜宠", "悬疑惊悚", "宫斗宅斗", "古言甜宠", "男频脑洞", "都市逆袭", "现实情感"],
  length: ["3000 字", "8000 字", "1.5 万字", "3 万字"],
  emotion: ["爽", "虐", "甜", "燃", "反转", "后劲大"],
  protagonist: ["真千金", "小人物逆袭", "重生女主", "县城女性", "赘婿", "落魄贵女", "普通打工人"],
  ending: ["大团圆", "反杀", "开放式", "意难平", "逆袭成功"],
  style: ["口语化", "电影感", "强情绪", "短剧感", "文艺克制", "现实质感"],
  mode: ["步步确认", "快速生成"]
};

export function AutoWorkspace({
  initialGenre = "女性成长",
  initialPlatform = "番茄短故事",
  initialNote = "亲情冲突里要有人味细节，结尾不要过度狗血。"
}: {
  initialGenre?: string;
  initialPlatform?: string;
  initialNote?: string;
}) {
  const [form, setForm] = useState({
    platform: initialPlatform,
    genre: initialGenre,
    length: "8000 字",
    emotion: "爽",
    protagonist: "县城女性",
    ending: "逆袭成功",
    style: "现实质感",
    mode: "快速生成",
    note: initialNote
  });
  const [trends, setTrends] = useState<Trend[]>(fallbackTrends);
  const [trendMessage, setTrendMessage] = useState("正在读取风向标建议。");
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [savedPresets, setSavedPresets] = useState<AutoWritingPreset[]>([]);
  const [assetMessage, setAssetMessage] = useState("正在读取参数模板。");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
  const [memories, setMemories] = useState<WritingMemory[]>([]);
  const [strategies, setStrategies] = useState<PersonalStrategy[]>([]);
  const [learningMessage, setLearningMessage] = useState("正在读取写作记忆和个人策略。");

  useEffect(() => {
    getTrends()
      .then((result) => {
        setTrends(result);
        setTrendMessage("已读取后端趋势建议。");
      })
      .catch((caught: unknown) => {
        setTrends(fallbackTrends);
        setTrendMessage(caught instanceof Error ? caught.message : "趋势服务暂时不可用，正在展示示例建议。");
      });
  }, []);

  useEffect(() => {
    refreshAssets();
  }, []);

  useEffect(() => {
    refreshLearningContext();
  }, []);

  async function refreshAssets() {
    try {
      const assets = await getWritingAssets();
      setSavedPresets(assets.presets);
      setAssetMessage(assets.presets.length ? "已读取保存过的参数模板。" : "还没有保存过参数模板。");
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "暂时无法读取参数模板。");
    }
  }

  async function refreshLearningContext() {
    try {
      const [memoryResult, strategyResult] = await Promise.all([getWritingMemories(), getPersonalStrategies()]);
      setMemories(memoryResult);
      setStrategies(strategyResult);
      setLearningMessage(`已读取 ${memoryResult.length} 条写作记忆、${strategyResult.length} 条个人策略。`);
    } catch (caught) {
      setLearningMessage(caught instanceof Error ? caught.message : "暂时无法读取写作记忆和个人策略。");
    }
  }

  const recommendedTrend = useMemo(() => trends[0] ?? fallbackTrends[0], [trends]);
  const recommendedGenre = useMemo(() => cleanTrendGenre(recommendedTrend.genre), [recommendedTrend.genre]);
  const writingRadar = useMemo(
    () =>
      buildWritingRadar({
        form,
        trend: { ...recommendedTrend, genre: recommendedGenre },
        memories,
        strategies
      }),
    [form, memories, recommendedGenre, recommendedTrend, strategies]
  );

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildInput(overrides: Partial<{ selectedTopicId: string }> = {}) {
    return {
      platform: form.platform,
      genre: form.genre,
      length: form.length,
      emotion: form.emotion,
      protagonist: form.protagonist,
      ending: form.ending,
      style: form.style,
      mode: form.mode,
      inspiration: form.note,
      ...overrides
    };
  }

  async function handleGenerate(overrides: Partial<{ selectedTopicId: string }> = {}) {
    setIsGenerating(true);
    setError("");

    try {
      const result = await createStoryFromAuto(buildInput(overrides));
      setPlan(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后再试。");
    } finally {
      setIsGenerating(false);
    }
  }

  function applyRecommendedTrend() {
    updateField("platform", recommendedTrend.platform);
    updateField("genre", recommendedGenre);
    updateField(
      "note",
      `来自风向标：${recommendedTrend.reason}。标签：${recommendedTrend.tags.join("、") || "暂无"}。同质化风险 ${recommendedTrend.saturationScore}，请保留方向优势但不要复制热门作品桥段。`
    );
  }

  async function handleSavePreset() {
    setIsSavingPreset(true);
    setAssetMessage("正在保存当前参数。");

    try {
      const result = await saveAutoPreset({
        name: `${form.genre} · ${form.style} · ${form.length}`,
        platform: form.platform,
        genre: form.genre,
        length: form.length,
        emotion: form.emotion,
        protagonist: form.protagonist,
        ending: form.ending,
        style: form.style,
        mode: form.mode,
        note: form.note
      });
      setSavedPresets((current) => [result.preset, ...current.filter((item) => item.id !== result.preset.id)]);
      setAssetMessage(result.message);
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "保存参数失败。");
    } finally {
      setIsSavingPreset(false);
    }
  }

  function applyPreset(preset: AutoWritingPreset) {
    setForm({
      platform: preset.platform,
      genre: preset.genre,
      length: preset.length,
      emotion: preset.emotion,
      protagonist: preset.protagonist,
      ending: preset.ending,
      style: preset.style,
      mode: preset.mode,
      note: preset.note
    });
    setAssetMessage(`已套用参数模板：${preset.name}。`);
  }

  async function handleDeletePreset(id: string) {
    setDeletingPresetId(id);

    try {
      const result = await deleteWritingAsset(id);
      setSavedPresets((current) => current.filter((item) => item.id !== id));
      setAssetMessage(result.message);
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "删除模板失败。");
    } finally {
      setDeletingPresetId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">自动写作</p>
        <h1 className="text-3xl font-semibold">一句话方向，自动跑完十步</h1>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="开始一篇短篇" eyebrow="默认全自动生成；需要人工把关时再切到步步确认" action={<Badge>{form.mode}</Badge>} />
          <div className="grid gap-5 p-5">
            <div className="grid gap-2">
              <FieldLabel>创作方向</FieldLabel>
              <textarea
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="例如：都市悬疑，女主发现自己的记忆被人付费修改过，结尾要有反杀和后劲。"
                className="min-h-36 resize-none rounded-md border border-line bg-white p-4 text-sm leading-7 outline-none focus:border-ink"
              />
            </div>
            <div className="grid gap-3 rounded-md border border-line bg-paper p-4 text-sm md:grid-cols-4">
              <QuickSpec label="平台" value={form.platform} />
              <QuickSpec label="赛道" value={form.genre} />
              <QuickSpec label="篇幅" value={form.length} />
              <QuickSpec label="文风" value={form.style} />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <GhostButton onClick={applyRecommendedTrend}>套用今日风向</GhostButton>
              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={handleSavePreset} disabled={isSavingPreset}>
                  <Save size={16} />
                  {isSavingPreset ? "保存中" : "保存模板"}
                </GhostButton>
                <Button onClick={() => handleGenerate()} disabled={isGenerating}>
                  {isGenerating ? "生成中..." : form.mode === "步步确认" ? "生成并逐步确认" : "一键生成初稿"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
            <details className="rounded-md border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">高级参数</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AutoField
                  label="平台"
                  value={form.platform}
                  options={withCurrentOption(fieldOptions.platform, form.platform)}
                  onChange={(value) => updateField("platform", value)}
                />
                <AutoField label="赛道" value={form.genre} options={withCurrentOption(fieldOptions.genre, form.genre)} onChange={(value) => updateField("genre", value)} />
                <AutoField label="篇幅" value={form.length} options={fieldOptions.length} onChange={(value) => updateField("length", value)} />
                <AutoField label="情绪方向" value={form.emotion} options={fieldOptions.emotion} onChange={(value) => updateField("emotion", value)} />
                <AutoField
                  label="主角类型"
                  value={form.protagonist}
                  options={fieldOptions.protagonist}
                  onChange={(value) => updateField("protagonist", value)}
                />
                <AutoField label="结局类型" value={form.ending} options={fieldOptions.ending} onChange={(value) => updateField("ending", value)} />
                <AutoField label="文风" value={form.style} options={fieldOptions.style} onChange={(value) => updateField("style", value)} />
                <AutoField label="生成模式" value={form.mode} options={fieldOptions.mode} onChange={(value) => updateField("mode", value)} />
              </div>
            </details>
            {error ? <p className="rounded-md border border-line bg-white p-3 text-sm text-muted">{error}</p> : null}
            <ComplianceNotice />
          </div>
        </Card>

        <aside className="grid gap-5">
          <Card>
            <CardHeader title="风向标建议" />
            <div className="grid gap-4 p-5">
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-sm text-muted">今日 TOP 赛道</p>
                <p className="mt-2 break-words text-2xl font-semibold">{recommendedGenre}</p>
              </div>
              <div className="grid gap-3 text-sm leading-7 text-muted">
                <p>推荐理由：{recommendedTrend.reason}</p>
                <p>适合篇幅：{writingRadar.lengthAdvice}</p>
                <p>同质化提醒：当前风险 {recommendedTrend.saturationScore}，需要换场景、换物件、换人物关系。</p>
                <p>参考结构：{writingRadar.structure.join("、")}。</p>
              </div>
              <GhostButton onClick={applyRecommendedTrend}>套用这个建议</GhostButton>
              <p className="text-xs leading-5 text-muted">{trendMessage}</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="个人写作雷达"
              action={
                <div className="flex flex-wrap gap-2">
                  {writingRadar.reviewCount ? <Badge>{writingRadar.reviewCount} 条复盘优先</Badge> : null}
                  <Badge>{writingRadar.learningCount} 条</Badge>
                </div>
              }
            />
            <div className="grid gap-4 p-5">
              {writingRadar.reviewCount ? (
                <p className="rounded-md border border-line bg-paper p-3 text-sm leading-6 text-muted">
                  本次会优先参考同赛道复盘结论，并把它们转成下一篇的执行约束。
                </p>
              ) : null}
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">适合人群</p>
                <p className="text-sm leading-6 text-ink">{writingRadar.audience}</p>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">下一篇优先执行</p>
                {writingRadar.actions.map((item) => (
                  <p key={item} className="rounded-md border border-line bg-paper p-3 text-sm leading-6 text-muted">
                    {item}
                  </p>
                ))}
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">近期不建议重复写</p>
                <div className="flex flex-wrap gap-2">
                  {writingRadar.avoid.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
              <p className="text-xs leading-5 text-muted">{learningMessage}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="参数模板" action={<Badge>{savedPresets.length}</Badge>} />
            <div className="grid gap-3 p-5">
              <p className="text-sm leading-6 text-muted">{assetMessage}</p>
              {savedPresets.slice(0, 5).map((preset) => (
                <div key={preset.id} className="grid gap-3 rounded-md border border-line bg-white p-4">
                  <button className="text-left" onClick={() => applyPreset(preset)}>
                    <p className="font-medium">{preset.name}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{preset.note || `${preset.platform} · ${preset.genre} · ${preset.protagonist}`}</p>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{preset.genre}</Badge>
                      <Badge>{preset.style}</Badge>
                    </div>
                    <GhostButton className="px-2" onClick={() => handleDeletePreset(preset.id)} disabled={deletingPresetId === preset.id}>
                      <Trash2 size={14} />
                    </GhostButton>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>

      {plan ? <PlanResult plan={plan} mode={form.mode} onRegenerateWithTopic={(selectedTopicId) => handleGenerate({ selectedTopicId })} /> : null}
    </div>
  );
}

function AutoField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <SelectInput value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

function QuickSpec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words font-medium text-ink">{value}</p>
    </div>
  );
}

function withCurrentOption(options: string[], value: string) {
  return options.includes(value) ? options : [value, ...options];
}

function cleanTrendGenre(value: string) {
  return (
    value
      .split(/\s+(?:评论反馈|评论关键词|阅读量|收益|完读率|标签|原因)[:：]?/u, 1)[0]
      ?.trim()
      .slice(0, 18) || value
  );
}

type AutoFormState = {
  platform: string;
  genre: string;
  length: string;
  emotion: string;
  protagonist: string;
  ending: string;
  style: string;
  mode: string;
  note: string;
};

function buildWritingRadar({
  form,
  trend,
  memories,
  strategies
}: {
  form: AutoFormState;
  trend: Trend;
  memories: WritingMemory[];
  strategies: PersonalStrategy[];
}) {
  const relevantMemories = memories.filter((memory) => memory.enabled && isRelevantGenre(memory.genre, form.genre));
  const relevantStrategies = strategies.filter((strategy) => strategy.enabled && isRelevantGenre(strategy.genre, form.genre));
  const reviewMemories = relevantMemories.filter((memory) => memory.sourceType === "review");
  const reviewStrategies = relevantStrategies.filter((strategy) => strategy.sourceType === "review");
  const strategyActions = relevantStrategies.map((strategy) => strategy.action || strategy.rule).filter(Boolean);
  const memoryRules = relevantMemories.map((memory) => memory.rule).filter(Boolean);
  const avoidFromMemory = relevantMemories
    .flatMap((memory) => [memory.negativeExample, memory.rule])
    .filter((item) => /不要|避免|少写|降低|狗血|套路|同质|水文|解释/u.test(item));
  const avoidFromStrategy = relevantStrategies
    .flatMap((strategy) => [strategy.rule, strategy.action])
    .filter((item) => /不要|避免|少写|降低|狗血|套路|同质|水文|解释/u.test(item));
  const tags = trend.tags.length ? trend.tags : [form.genre, form.protagonist, form.emotion];

  return {
    audience: audienceFor(form, tags),
    lengthAdvice: lengthAdviceFor(form.length, trend.saturationScore),
    structure: uniqueShortList([...structureFromStrategies(strategyActions), ...fallbackStructureFor(form.genre)], 4),
    actions: uniqueShortList([
      ...reviewStrategies.map((strategy) => strategy.action || strategy.rule),
      ...reviewMemories.map((memory) => memory.rule),
      ...strategyActions,
      ...memoryRules,
      `围绕「${form.protagonist}」设计一个能主动完成反击的关键选择。`
    ], 3),
    avoid: uniqueShortList([...avoidFromMemory, ...avoidFromStrategy, ...fallbackAvoidFor(form.genre)], 5),
    learningCount: relevantMemories.length + relevantStrategies.length,
    reviewCount: reviewMemories.length + reviewStrategies.length
  };
}

function isRelevantGenre(candidate: string, target: string) {
  return candidate === target || candidate === "通用" || candidate.includes(target) || target.includes(candidate);
}

function uniqueShortList(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const normalized = item.length > 42 ? `${item.slice(0, 42)}...` : item;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function audienceFor(form: AutoFormState, tags: string[]) {
  const tagText = tags.slice(0, 3).join("、") || form.genre;

  if (form.genre.includes("悬疑")) {
    return `喜欢强悬念、连续反转和细节回收的读者；标签重点是 ${tagText}。`;
  }

  if (form.genre.includes("甜宠")) {
    return `喜欢高情绪互动、关系推进和轻爽反转的读者；标签重点是 ${tagText}。`;
  }

  if (form.genre.includes("男频") || form.protagonist.includes("赘婿")) {
    return `喜欢明确目标、升级反击和高密度爽点的读者；标签重点是 ${tagText}。`;
  }

  return `喜欢现实压迫、克制反击和结尾情绪落点的读者；标签重点是 ${tagText}。`;
}

function lengthAdviceFor(length: string, saturationScore: number) {
  if (saturationScore >= 72) {
    return `${length}，但要把开头压缩得更快，中段每 800-1200 字给一次新信息。`;
  }

  return `${length}，可以保留完整铺垫，但每场都要有目标、阻碍和信息变化。`;
}

function structureFromStrategies(actions: string[]) {
  const joined = actions.join(" ");
  const result: string[] = [];

  if (/开头|前\s*300|钩子/u.test(joined)) result.push("压迫开场");
  if (/证据|信息|伏笔|真相/u.test(joined)) result.push("证据追查");
  if (/选择|主动|行动|反击/u.test(joined)) result.push("主动选择");
  if (/结尾|落地|后劲|生活/u.test(joined)) result.push("生活落点");

  return result;
}

function fallbackStructureFor(genre: string) {
  if (genre.includes("悬疑")) {
    return ["异常开场", "线索误导", "真相翻转", "余味收束"];
  }

  if (genre.includes("甜宠")) {
    return ["关系误会", "互动升温", "选择确认", "情绪兑现"];
  }

  return ["压迫开场", "证据追查", "公开反击", "生活落点"];
}

function fallbackAvoidFor(genre: string) {
  if (genre.includes("悬疑")) {
    return ["只靠解释揭谜", "线索突然空降", "结尾强行反转"];
  }

  if (genre.includes("甜宠")) {
    return ["误会拖太久", "霸总替主角解决一切", "甜点重复不推进"];
  }

  return ["无铺垫豪门认亲", "外部强者替主角解决一切", "全员突然降智道歉"];
}
