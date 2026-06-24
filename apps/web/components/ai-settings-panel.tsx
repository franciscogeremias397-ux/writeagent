"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, PlugZap, Save, Sparkles, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, FieldLabel, GhostButton, SelectInput, TextInput } from "@/components/ui";
import { getSettings, saveAiSettings, testAiConnection, testAiKernel, type AiKernelTestResult, type AiSettingsStatus } from "@/lib/api";

const fallbackProviders: AiSettingsStatus["availableAiProviders"] = [
  {
    id: "kimi",
    label: "Kimi",
    defaultTextModel: "kimi-k2.6",
    defaultOutlineModel: "moonshot-v1-8k",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    textModelEnv: "KIMI_TEXT_MODEL",
    outlineModelEnv: "KIMI_OUTLINE_MODEL",
    baseUrlEnv: "KIMI_BASE_URL",
    supportsVision: true
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultTextModel: "deepseek-v4-flash",
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    textModelEnv: "DEEPSEEK_TEXT_MODEL",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    supportsVision: false
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultTextModel: "gpt-5.2",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    textModelEnv: "OPENAI_TEXT_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL",
    supportsVision: true
  }
];

export function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettingsStatus | null>(null);
  const [message, setMessage] = useState("正在读取本地 AI 设置。");
  const [aiProvider, setAiProvider] = useState<"openai" | "kimi" | "deepseek">("kimi");
  const [textModel, setTextModel] = useState("kimi-k2.6");
  const [outlineModel, setOutlineModel] = useState("moonshot-v1-8k");
  const [baseUrl, setBaseUrl] = useState("https://api.moonshot.ai/v1");
  const [openAiEmbeddingModel, setOpenAiEmbeddingModel] = useState("text-embedding-3-small");
  const [apiKey, setApiKey] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingKernel, setIsTestingKernel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingKey, setIsClearingKey] = useState(false);
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [kernelResult, setKernelResult] = useState<AiKernelTestResult | null>(null);

  useEffect(() => {
    getSettings()
      .then((result) => {
        setSettings(result);
        const provider = normalizeProviderId(result.aiStatus.provider);
        setAiProvider(provider);
        setTextModel(result.aiStatus.model);
        setOutlineModel(result.aiStatus.outlineModel ?? result.aiStatus.model);
        setBaseUrl(result.aiStatus.baseUrl);
        setOpenAiEmbeddingModel(result.aiStatus.embeddingModel);
        setMessage(result.aiStatus.message);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "读取设置失败。");
      });
  }, []);

  const providerOptions = settings?.availableAiProviders?.length ? settings.availableAiProviders : fallbackProviders;
  const selectedProvider = providerOptions.find((provider) => provider.id === aiProvider) ?? providerOptions[0];
  const realMode = settings?.aiStatus.mode && settings.aiStatus.mode !== "mock";
  const writingRoute =
    settings?.aiStatus.provider === "kimi" && settings.hasApiKey
      ? "写作路由：Kimi 负责正式正文；DeepSeek 只做市场蓝图和连续性检查。"
      : "推荐路由：Kimi 负责正式正文；DeepSeek 只做市场蓝图和连续性检查。";

  function handleProviderChange(value: string) {
    const nextProvider = normalizeProviderId(value);
    const meta = providerOptions.find((provider) => provider.id === nextProvider) ?? fallbackProviders.find((provider) => provider.id === nextProvider) ?? fallbackProviders[0];

    setAiProvider(nextProvider);
    setTextModel(meta.defaultTextModel);
    setOutlineModel(meta.defaultOutlineModel ?? meta.defaultTextModel);
    setBaseUrl(meta.defaultBaseUrl);
    setApiKey("");
    setConfirmClearKey(false);
    setMessage(`已切换到 ${meta.label}，保存后生效。`);
  }

  async function handleTest() {
    setIsTesting(true);
    setMessage("正在测试 AI 连接。");

    try {
      const result = await testAiConnection();
      setMessage(result.ok ? "连接测试通过。" : result.error ?? result.message ?? "还没有配置 API Key，当前会使用模拟内核。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleTestKernel() {
    setIsTestingKernel(true);
    setKernelResult(null);
    setMessage("正在试跑全文生成，不会保存作品。");

    try {
      const result = await testAiKernel();
      setKernelResult(result);
      setMessage(result.detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "写作内核测试失败。");
    } finally {
      setIsTestingKernel(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setConfirmClearKey(false);
    setMessage("正在保存 AI 设置。");

    try {
      const result = await saveAiSettings({
        aiProvider,
        textModel,
        outlineModel: aiProvider === "kimi" ? outlineModel : undefined,
        baseUrl,
        openAiEmbeddingModel,
        apiKey: apiKey.trim() || undefined
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              aiProvider: result.aiStatus.provider,
              hasApiKey: result.hasApiKey,
              aiStatus: result.aiStatus
            }
          : current
      );
      setTextModel(result.aiStatus.model);
      setOutlineModel(result.aiStatus.outlineModel ?? result.aiStatus.model);
      setBaseUrl(result.aiStatus.baseUrl);
      setApiKey("");
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存 AI 设置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearKey() {
    if (!confirmClearKey) {
      setConfirmClearKey(true);
      setMessage("会从当前运行状态和本机配置文件里清除 API Key。再点一次确认清除。");
      return;
    }

    setIsClearingKey(true);
    setMessage("正在清除本机 API Key。");

    try {
      const result = await saveAiSettings({
        aiProvider,
        textModel,
        outlineModel: aiProvider === "kimi" ? outlineModel : undefined,
        baseUrl,
        openAiEmbeddingModel,
        clearApiKey: true
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              aiProvider: result.aiStatus.provider,
              hasApiKey: result.hasApiKey,
              aiStatus: result.aiStatus
            }
          : current
      );
      setApiKey("");
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清除 API Key 失败。");
    } finally {
      setIsClearingKey(false);
      setConfirmClearKey(false);
    }
  }

  return (
    <Card>
      <CardHeader title="AI 设置" />
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 rounded-md border border-line bg-white p-4">
          <div className="flex items-center gap-3">
            <PlugZap size={18} />
            <span className="font-medium">{realMode ? `${settings?.aiStatus.providerLabel ?? selectedProvider.label} 真实模式` : "本地模拟模式"}</span>
          </div>
          <p className="text-sm leading-6 text-muted">{message}</p>
          <p className="text-xs leading-5 text-muted">{writingRoute}</p>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-4">
          <Info label="供应商" value={settings?.aiStatus.providerLabel ?? selectedProvider.label} />
          <Info label={aiProvider === "kimi" ? "正文模型" : "写作模型"} value={settings?.aiStatus.model ?? selectedProvider.defaultTextModel} />
          {aiProvider === "kimi" ? <Info label="方案模型" value={settings?.aiStatus.outlineModel ?? outlineModel} /> : null}
          <Info label="Key 名称" value={settings?.aiStatus.apiKeyEnv ?? selectedProvider.apiKeyEnv} />
          <Info label="API Key" value={settings?.hasApiKey ? "已配置" : "未配置"} />
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>供应商</FieldLabel>
            <SelectInput value={aiProvider} onChange={(event) => handleProviderChange(event.target.value)}>
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}{provider.id === "kimi" ? "（推荐写正文）" : provider.id === "deepseek" ? "（推荐做规划）" : ""}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>{aiProvider === "kimi" ? "正文模型" : "写作模型"}</FieldLabel>
            <TextInput value={textModel} onChange={(event) => setTextModel(event.target.value)} placeholder={selectedProvider.defaultTextModel} />
          </div>
          {aiProvider === "kimi" ? (
            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <FieldLabel>方案模型</FieldLabel>
              <div className="grid gap-2">
                <TextInput value={outlineModel} onChange={(event) => setOutlineModel(event.target.value)} placeholder={selectedProvider.defaultOutlineModel ?? "moonshot-v1-8k"} />
                <p className="text-xs leading-5 text-muted">用于生成标题和 500 字以内故事方案；正文仍由写作模型负责。</p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>API Key</FieldLabel>
            <div className="grid gap-2">
              <TextInput
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings?.hasApiKey && settings.aiStatus.provider === aiProvider ? "已配置；留空则不改" : `粘贴你的 ${selectedProvider.apiKeyEnv}`}
                type="password"
                autoComplete="off"
              />
              <p className="text-xs leading-5 text-muted">保存后只写入本机配置文件；不会提交到 Git，也不会出现在备份里。</p>
            </div>
          </div>
          <details className="rounded-md border border-line bg-paper p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">高级连接设置</summary>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2 md:grid-cols-[160px_1fr]">
                <FieldLabel>Base URL</FieldLabel>
                <TextInput value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={selectedProvider.defaultBaseUrl} />
              </div>
              {aiProvider === "openai" ? (
                <div className="grid gap-2 md:grid-cols-[160px_1fr]">
                  <FieldLabel>Embedding 模型</FieldLabel>
                  <TextInput
                    value={openAiEmbeddingModel}
                    onChange={(event) => setOpenAiEmbeddingModel(event.target.value)}
                    placeholder="text-embedding-3-small"
                  />
                </div>
              ) : null}
            </div>
          </details>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={isSaving}>
            <Save size={16} />
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
          <Button onClick={handleTest} disabled={isTesting}>
            <CheckCircle2 size={16} />
            {isTesting ? "测试中..." : "测试连接"}
          </Button>
          <Button onClick={handleTestKernel} disabled={isTestingKernel}>
            <Sparkles size={16} />
            {isTestingKernel ? "试跑中..." : "测试全文生成"}
          </Button>
          <GhostButton onClick={handleClearKey} disabled={isClearingKey}>
            {confirmClearKey ? <Trash2 size={16} /> : <KeyRound size={16} />}
            {isClearingKey ? "清除中..." : confirmClearKey ? "确认清除 Key" : "清除 Key"}
          </GhostButton>
        </div>
        {kernelResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-paper p-4 text-sm leading-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">全文生成测试结果</p>
              <span className="rounded-md border border-line bg-white px-2 py-1 text-xs text-muted">{providerModeLabel(kernelResult.providerMode)}</span>
            </div>
            <p className="text-muted">{kernelResult.detail}</p>
            <div className="grid gap-2 md:grid-cols-4">
              <Info label="测试标题" value={kernelResult.title} />
              <Info label="字数" value={`${kernelResult.draft.wordCount.toLocaleString("zh-CN")} 字`} />
              <Info label="方向" value={kernelResult.draft.genre} />
              <Info label="标签" value={kernelResult.draft.tags.join("、") || "无"} />
            </div>
            {kernelResult.draft.marketSummary ? <p className="text-xs leading-5 text-muted">市场判断：{kernelResult.draft.marketSummary}</p> : null}
            {kernelResult.draft.qualitySummary ? <p className="text-xs leading-5 text-muted">自检摘要：{kernelResult.draft.qualitySummary}</p> : null}
            {kernelResult.providerNotice ? <p className="text-xs text-muted">{kernelResult.providerNotice}</p> : null}
            {kernelResult.nextStep ? <p className="text-xs text-muted">下一步：{kernelResult.nextStep}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function providerModeLabel(mode: AiKernelTestResult["providerMode"]) {
  if (mode === "kimi") {
    return "Kimi";
  }

  if (mode === "deepseek") {
    return "DeepSeek";
  }

  if (mode === "openai") {
    return "OpenAI";
  }

  if (mode === "fallback") {
    return "自动兜底";
  }

  return "本地模拟";
}

function normalizeProviderId(value: string): "openai" | "kimi" | "deepseek" {
  if (value === "kimi" || value === "deepseek" || value === "openai") {
    return value;
  }

  return "kimi";
}
