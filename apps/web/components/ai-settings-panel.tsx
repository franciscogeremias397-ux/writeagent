"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, PlugZap, Save, Sparkles, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, FieldLabel, GhostButton, SelectInput, TextInput } from "@/components/ui";
import { getSettings, saveAiSettings, testAiConnection, testAiKernel, type AiKernelTestResult, type AiSettingsStatus } from "@/lib/api";

export function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettingsStatus | null>(null);
  const [message, setMessage] = useState("正在读取本地 AI 设置。");
  const [aiProvider, setAiProvider] = useState("openai");
  const [openAiTextModel, setOpenAiTextModel] = useState("gpt-5.2");
  const [openAiEmbeddingModel, setOpenAiEmbeddingModel] = useState("text-embedding-3-small");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
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
        setAiProvider(result.aiStatus.provider);
        setOpenAiTextModel(result.aiStatus.model);
        setOpenAiEmbeddingModel(result.aiStatus.embeddingModel);
        setMessage(result.aiStatus.message);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "读取设置失败。");
      });
  }, []);

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
    setMessage("正在试跑写作内核，不会保存作品。");

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
        openAiTextModel,
        openAiEmbeddingModel,
        openAiApiKey: openAiApiKey.trim() || undefined
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
      setOpenAiApiKey("");
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
        openAiTextModel,
        openAiEmbeddingModel,
        clearOpenAiApiKey: true
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
      setOpenAiApiKey("");
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
            <span className="font-medium">{settings?.aiStatus.mode === "openai" ? "真实 AI 模式" : "模拟内核模式"}</span>
          </div>
          <p className="text-sm leading-6 text-muted">{message}</p>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-4">
          <Info label="Provider" value={settings?.aiStatus.provider ?? "openai"} />
          <Info label="写作模型" value={settings?.aiStatus.model ?? "gpt-5.2"} />
          <Info label="Embedding 模型" value={settings?.aiStatus.embeddingModel ?? "text-embedding-3-small"} />
          <Info label="API Key" value={settings?.hasApiKey ? "已配置" : "未配置"} />
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>供应商</FieldLabel>
            <SelectInput value={aiProvider} onChange={(event) => setAiProvider(event.target.value)}>
              <option value="openai">OpenAI</option>
            </SelectInput>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>写作模型</FieldLabel>
            <TextInput value={openAiTextModel} onChange={(event) => setOpenAiTextModel(event.target.value)} placeholder="gpt-5.2" />
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>Embedding 模型</FieldLabel>
            <TextInput
              value={openAiEmbeddingModel}
              onChange={(event) => setOpenAiEmbeddingModel(event.target.value)}
              placeholder="text-embedding-3-small"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <FieldLabel>API Key</FieldLabel>
            <div className="grid gap-2">
              <TextInput
                value={openAiApiKey}
                onChange={(event) => setOpenAiApiKey(event.target.value)}
                placeholder={settings?.hasApiKey ? "已配置；留空则不改" : "粘贴你的 OpenAI API Key"}
                type="password"
                autoComplete="off"
              />
              <p className="text-xs leading-5 text-muted">保存后只写入本机配置文件，备份文件不会包含 Key 原文。</p>
            </div>
          </div>
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
            {isTestingKernel ? "试跑中..." : "测试写作内核"}
          </Button>
          <GhostButton onClick={handleClearKey} disabled={isClearingKey}>
            {confirmClearKey ? <Trash2 size={16} /> : <KeyRound size={16} />}
            {isClearingKey ? "清除中..." : confirmClearKey ? "确认清除 Key" : "清除 Key"}
          </GhostButton>
        </div>
        {kernelResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-paper p-4 text-sm leading-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">写作内核测试结果</p>
              <span className="rounded-md border border-line bg-white px-2 py-1 text-xs text-muted">{providerModeLabel(kernelResult.providerMode)}</span>
            </div>
            <p className="text-muted">{kernelResult.detail}</p>
            <div className="grid gap-2 md:grid-cols-4">
              <Info label="测试标题" value={kernelResult.title} />
              <Info label="选题卡" value={`${kernelResult.counts.topicCards} 张`} />
              <Info label="场景卡" value={`${kernelResult.counts.sceneCards} 张`} />
              <Info label="分场正文" value={`${kernelResult.counts.sceneDrafts} 段`} />
            </div>
            {kernelResult.sampleClues.length ? <p className="text-xs text-muted">样例线索：{kernelResult.sampleClues.join("、")}</p> : null}
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
  if (mode === "openai") {
    return "真实 AI";
  }

  if (mode === "fallback") {
    return "自动兜底";
  }

  return "本地模拟";
}
