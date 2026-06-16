"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { todayIdea, trends as fallbackTrends, type SavedInspiration, type StoryPlan, type Trend } from "@shenbi/shared";
import { PlanResult } from "@/components/plan-result";
import { Badge, Button, Card, CardHeader, ComplianceNotice, FieldLabel, GhostButton, SelectInput } from "@/components/ui";
import { createStoryFromInspiration, deleteWritingAsset, getTrends, getWritingAssets, saveInspirationAsset } from "@/lib/api";

const steps = ["选题卡", "情绪曲线", "冲突阶梯", "信息差", "人物卡", "场景卡", "场景提示词", "分场正文", "测试读者报告", "修订建议"];
const platformOptions = ["番茄短故事", "番茄小说", "其他平台"];
const genreOptions = ["女性成长", "现言甜宠", "悬疑惊悚", "宫斗宅斗", "现实情感"];
const emotionOptions = ["爽", "虐", "甜", "燃", "反转", "后劲大"];
const lengthOptions = ["3000 字", "8000 字", "1.5 万字", "3 万字"];
const endingOptions = ["大团圆", "反杀", "开放式", "意难平", "逆袭成功"];
const modeOptions = ["步步确认", "快速生成"];

export function InspirationWorkspace({ initialIdea }: { initialIdea?: string } = {}) {
  const cleanInitialIdea = initialIdea?.trim();
  const [inspiration, setInspiration] = useState(() => cleanInitialIdea || todayIdea);
  const [platform, setPlatform] = useState("番茄短故事");
  const [genre, setGenre] = useState("女性成长");
  const [emotion, setEmotion] = useState("爽");
  const [length, setLength] = useState("8000 字");
  const [ending, setEnding] = useState("逆袭成功");
  const [mode, setMode] = useState("步步确认");
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [savedInspirations, setSavedInspirations] = useState<SavedInspiration[]>([]);
  const [assetMessage, setAssetMessage] = useState("正在读取保存过的灵感。");
  const [isSavingInspiration, setIsSavingInspiration] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [trendList, setTrendList] = useState<Trend[]>(fallbackTrends);
  const [trendMessage, setTrendMessage] = useState("正在读取后端风向。");
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);

  const count = useMemo(() => inspiration.trim().length, [inspiration]);

  useEffect(() => {
    refreshAssets();
  }, []);

  useEffect(() => {
    refreshTrends(true);
  }, []);

  useEffect(() => {
    if (cleanInitialIdea) {
      setInspiration(cleanInitialIdea);
    }
  }, [cleanInitialIdea]);

  async function refreshTrends(silent = false) {
    if (!silent) {
      setIsRefreshingTrends(true);
      setTrendMessage("正在刷新后端风向。");
    }

    try {
      const result = await getTrends();
      setTrendList(result);
      setTrendMessage(result.length ? "已读取后端趋势，可直接套用到当前灵感。" : "后端暂时没有趋势数据，正在展示示例风向。");
    } catch (caught) {
      setTrendList(fallbackTrends);
      setTrendMessage(caught instanceof Error ? `${caught.message}；正在展示示例风向。` : "趋势服务暂时不可用，正在展示示例风向。");
    } finally {
      if (!silent) {
        setIsRefreshingTrends(false);
      }
    }
  }

  async function refreshAssets() {
    try {
      const assets = await getWritingAssets();
      setSavedInspirations(assets.inspirations);
      setAssetMessage(assets.inspirations.length ? "已读取保存过的灵感。" : "还没有保存过灵感。");
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "暂时无法读取保存过的灵感。");
    }
  }

  function applyTrend(trend: Trend) {
    const nextGenre = cleanTrendGenre(trend.genre);
    const trendNote = `风向参考：${trend.reason}。标签：${trend.tags.join("、") || "暂无"}。同质化风险 ${trend.saturationScore}，只学习趋势和结构，不复制热门作品桥段。`;

    setPlatform(trend.platform);
    setGenre(nextGenre);
    setInspiration((current) => {
      const trimmed = current.trim();

      return trimmed ? `${trimmed}\n\n${trendNote}` : `围绕${nextGenre}写一个短篇。${trendNote}`;
    });
    setTrendMessage(`已套用「${nextGenre}」风向到当前灵感。`);
  }

  function buildInput(overrides: Partial<{ selectedTopicId: string }> = {}) {
    return { inspiration, platform, genre, emotion, length, ending, mode, ...overrides };
  }

  async function handleGenerate(overrides: Partial<{ selectedTopicId: string }> = {}) {
    setIsGenerating(true);
    setError("");

    try {
      const result = await createStoryFromInspiration(buildInput(overrides));
      setPlan(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后再试。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveInspiration() {
    setIsSavingInspiration(true);
    setAssetMessage("正在保存当前灵感。");

    try {
      const result = await saveInspirationAsset({ text: inspiration, platform, genre, emotion, length, ending, mode });
      setSavedInspirations((current) => [result.inspiration, ...current.filter((item) => item.id !== result.inspiration.id)]);
      setAssetMessage(result.message);
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "保存灵感失败。");
    } finally {
      setIsSavingInspiration(false);
    }
  }

  function applySavedInspiration(item: SavedInspiration) {
    setInspiration(item.text);
    setPlatform(item.platform);
    setGenre(item.genre);
    setEmotion(item.emotion);
    setLength(item.length);
    setEnding(item.ending);
    setMode(item.mode);
    setAssetMessage(`已载入保存的灵感：${item.text.slice(0, 18)}。`);
  }

  async function handleDeleteAsset(id: string) {
    setDeletingAssetId(id);

    try {
      const result = await deleteWritingAsset(id);
      setSavedInspirations((current) => current.filter((item) => item.id !== id));
      setAssetMessage(result.message);
    } catch (caught) {
      setAssetMessage(caught instanceof Error ? caught.message : "删除失败。");
    } finally {
      setDeletingAssetId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">灵感写作</p>
        <h1 className="text-3xl font-semibold">把一个点子扩成完整短篇方案</h1>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="输入灵感" eyebrow="从人设、冲突、画面或反转开始" />
          <div className="grid gap-5 p-5">
            <textarea
              value={inspiration}
              onChange={(event) => setInspiration(event.target.value)}
              className="min-h-44 resize-none rounded-md border border-line bg-white p-4 text-sm leading-7 outline-none focus:border-ink"
              placeholder="写下你的灵感，比如一个人设、一个冲突、一个画面、一个反转。"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted">{count}/2000</span>
              <div className="flex flex-wrap gap-2">
                <GhostButton type="button" onClick={() => setInspiration("")}>
                  <RotateCcw size={16} />
                  清空
                </GhostButton>
                <GhostButton type="button" onClick={handleSaveInspiration} disabled={isSavingInspiration || !inspiration.trim()}>
                  <Save size={16} />
                  {isSavingInspiration ? "保存中" : "保存为灵感"}
                </GhostButton>
                <Button type="button" onClick={() => handleGenerate()} disabled={!inspiration.trim() || isGenerating}>
                  {isGenerating ? "生成中..." : "一键生成"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
            {error ? <p className="rounded-md border border-line bg-white p-3 text-sm text-muted">{error}</p> : null}

            <div className="grid gap-4 rounded-lg border border-line bg-paper p-4 md:grid-cols-3">
              <Option label="平台" value={platform} setValue={setPlatform} options={withCurrentOption(platformOptions, platform)} />
              <Option label="目标赛道" value={genre} setValue={setGenre} options={withCurrentOption(genreOptions, genre)} />
              <Option label="情绪方向" value={emotion} setValue={setEmotion} options={withCurrentOption(emotionOptions, emotion)} />
              <Option label="篇幅" value={length} setValue={setLength} options={withCurrentOption(lengthOptions, length)} />
              <Option label="结局偏好" value={ending} setValue={setEnding} options={withCurrentOption(endingOptions, ending)} />
              <Option label="写作模式" value={mode} setValue={setMode} options={withCurrentOption(modeOptions, mode)} />
            </div>
            <ComplianceNotice />
          </div>
        </Card>

        <aside className="grid gap-5">
          <Card>
            <CardHeader title="Agent 流程状态" />
            <div className="grid gap-3 p-5">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <CheckCircle2 size={17} className={plan ? "text-ink" : index === 0 ? "text-ink" : "text-muted"} />
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="风向参考"
              action={
                <GhostButton type="button" onClick={() => refreshTrends()} disabled={isRefreshingTrends}>
                  <RefreshCw size={16} />
                  {isRefreshingTrends ? "刷新中" : "刷新"}
                </GhostButton>
              }
            />
            <div className="grid gap-3 p-5">
              <p className="text-sm leading-6 text-muted">{trendMessage}</p>
              {trendList.slice(0, 3).map((trend) => (
                <div key={trend.id} className="rounded-md border border-line bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cleanTrendGenre(trend.genre)}</span>
                    <Badge>{trend.heat}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{trend.reason}</p>
                  <GhostButton type="button" className="mt-3 w-full" onClick={() => applyTrend(trend)}>
                    套用风向
                    <ArrowRight size={16} />
                  </GhostButton>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="保存的灵感" action={<Badge>{savedInspirations.length}</Badge>} />
            <div className="grid gap-3 p-5">
              <p className="text-sm leading-6 text-muted">{assetMessage}</p>
              {savedInspirations.slice(0, 5).map((item) => (
                <div key={item.id} className="grid gap-3 rounded-md border border-line bg-white p-4">
                  <button className="text-left text-sm leading-6 text-ink" onClick={() => applySavedInspiration(item)}>
                    {item.text}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{item.genre}</Badge>
                      <Badge>{item.length}</Badge>
                    </div>
                    <GhostButton className="px-2" onClick={() => handleDeleteAsset(item.id)} disabled={deletingAssetId === item.id}>
                      <Trash2 size={14} />
                    </GhostButton>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>

      {plan ? <PlanResult plan={plan} mode={mode} onRegenerateWithTopic={(selectedTopicId) => handleGenerate({ selectedTopicId })} /> : null}
    </div>
  );
}

function Option({
  label,
  value,
  setValue,
  options
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <SelectInput value={value} onChange={(event) => setValue(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

function cleanTrendGenre(genre: string) {
  const fieldLabelIndex = genre.search(/\s*(评论反馈|评论关键词|阅读量|收益|完读率|作品名|平台)[:：]/u);
  const withoutImportedFields = fieldLabelIndex > 0 ? genre.slice(0, fieldLabelIndex) : genre;

  return withoutImportedFields.replace(/(赛道|风向|趋势)$/u, "").trim() || genre;
}

function withCurrentOption(options: string[], value: string) {
  return value && !options.includes(value) ? [value, ...options] : options;
}
