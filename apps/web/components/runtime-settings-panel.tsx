"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, Brain, CheckCircle2, Database, FileText, FolderOpen, HardDrive, Power, Server } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { getSettings, testWritingWorkflow, type AiSettingsStatus, type WorkflowSmokeResult } from "@/lib/api";

export function RuntimeSettingsPanel() {
  const [settings, setSettings] = useState<AiSettingsStatus | null>(null);
  const [message, setMessage] = useState("正在读取本地运行设置。");
  const [workflowResult, setWorkflowResult] = useState<WorkflowSmokeResult | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState("还没有检查写作主流程。");
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const runtimeHealth = settings?.runtimeHealth ?? fallbackRuntimeHealth;
  const launchStatus = settings?.launchEntries ?? fallbackLaunchEntries;
  const persistence = settings?.persistence ?? fallbackPersistenceStatus(runtimeHealth);
  const availability = buildAvailabilityStatus(settings, runtimeHealth);

  useEffect(() => {
    getSettings()
      .then((result) => {
        setSettings(result);
        setMessage("已完成本地运行体检。");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "读取本地运行设置失败。");
      });
  }, []);

  async function handleWorkflowCheck() {
    setWorkflowLoading(true);
    setWorkflowMessage("正在检查全文生成、保存作品和编辑器读取。");

    try {
      const result = await testWritingWorkflow();
      setWorkflowResult(result);
      setWorkflowMessage(result.summary);
    } catch (error) {
      setWorkflowResult(null);
      setWorkflowMessage(error instanceof Error ? error.message : "写作主流程检查失败。");
    } finally {
      setWorkflowLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="启动入口与当前验收" action={<Badge>{settings ? "已读取" : "读取中"}</Badge>} />
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {launchStatus.map((entry) => (
              <LaunchEntryCard key={entry.fileName} entry={entry} isLoading={!settings} />
            ))}
          </div>

          <div className="rounded-md border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">当前可用性</p>
                <p className="mt-2 text-sm leading-6 text-muted">{availability.detail}</p>
              </div>
              <Badge className={availability.ok ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]" : "border-[#f0c7a8] bg-[#fff7ed] text-[#9a4d13]"}>
                {availability.label}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {acceptanceItems(settings, runtimeHealth).map((item) => (
              <AcceptanceItem key={item.label} item={item} />
            ))}
          </div>
        </div>
      </Card>

      <PersistenceStatusCard persistence={persistence} isLoading={!settings} />

      <Card>
        <CardHeader
          title="写作主流程检查"
          eyebrow="全文生成、保存作品、编辑器读取"
          action={
            <Button onClick={handleWorkflowCheck} disabled={workflowLoading}>
              <Activity size={16} />
              {workflowLoading ? "检查中" : "检查主流程"}
            </Button>
          }
        />
        <div className="grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper p-4">
            <p className="text-sm leading-6 text-muted">{workflowMessage}</p>
            <Badge
              className={
                workflowResult
                  ? workflowResult.ok
                    ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]"
                    : "border-[#f0c7a8] bg-[#fff7ed] text-[#9a4d13]"
                  : undefined
              }
            >
              {workflowLoading ? "检查中" : workflowResult ? (workflowResult.ok ? "正常" : "需处理") : "未检查"}
            </Badge>
          </div>

          {workflowResult ? (
            <div className="grid gap-3 md:grid-cols-2">
              {workflowResult.steps.map((step) => (
                <WorkflowStepItem key={step.label} step={step} />
              ))}
            </div>
          ) : null}

          {workflowResult?.nextStep ? <p className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-ink">下一步：{workflowResult.nextStep}</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="本地运行体检" action={<Badge>{message}</Badge>} />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <HealthCard icon={<Database size={18} />} status={runtimeHealth.database} isLoading={!settings} />
          <HealthCard icon={<Server size={18} />} status={runtimeHealth.redis} isLoading={!settings} />
          <HealthCard icon={<Brain size={18} />} status={runtimeHealth.knowledge} isLoading={!settings} />
          <HealthCard
            icon={<HardDrive size={18} />}
            status={runtimeHealth.storage}
            isLoading={!settings}
            meta={`${formatBytes(runtimeHealth.storage.sizeBytes)} · ${runtimeHealth.storage.fileCount} 个文件`}
          />
          <HealthCard
            icon={<FolderOpen size={18} />}
            status={runtimeHealth.workspace}
            isLoading={!settings}
            meta={`${formatBytes(runtimeHealth.workspace.sizeBytes)} · ${runtimeHealth.workspace.fileCount} 个文件`}
          />
          <HealthCard
            icon={<Activity size={18} />}
            status={runtimeHealth.logs}
            isLoading={!settings}
            meta={`${formatBytes(runtimeHealth.logs.sizeBytes)} · ${runtimeHealth.logs.fileCount} 个文件`}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="本地存储" />
        <div className="grid gap-3 p-5">
          <SettingLine icon={<Database size={17} />} label="数据库" value={runtimeHealth.database.detail} nextStep={runtimeHealth.database.nextStep} />
          <SettingLine icon={<Server size={17} />} label="队列服务" value={runtimeHealth.redis.detail} nextStep={runtimeHealth.redis.nextStep} />
          <SettingLine icon={<Brain size={17} />} label="本地知识库" value={runtimeHealth.knowledge.detail} nextStep={runtimeHealth.knowledge.nextStep} />
          <SettingLine
            icon={<FolderOpen size={17} />}
            label="文件存储"
            value={`${runtimeHealth.storage.path}（${formatBytes(runtimeHealth.storage.sizeBytes)}）`}
            nextStep={runtimeHealth.storage.nextStep}
          />
          <SettingLine
            icon={<FolderOpen size={17} />}
            label="作品工程目录"
            value={`${runtimeHealth.workspace.path}/works（${formatBytes(runtimeHealth.workspace.sizeBytes)}）`}
            nextStep={runtimeHealth.workspace.nextStep}
          />
          <SettingLine
            icon={<FolderOpen size={17} />}
            label="日志目录"
            value={`${runtimeHealth.logs.path}（${formatBytes(runtimeHealth.logs.sizeBytes)}）`}
            nextStep={runtimeHealth.logs.nextStep}
          />
        </div>
      </Card>

    </div>
  );
}

const fallbackRuntimeHealth: AiSettingsStatus["runtimeHealth"] = {
  database: {
    ok: false,
    label: "数据库",
    detail: "正在检查数据库连接。"
  },
  redis: {
    ok: false,
    label: "队列服务",
    detail: "正在检查自动任务队列。"
  },
  knowledge: {
    ok: false,
    label: "本地知识库",
    detail: "正在检查创作资料索引。"
  },
  storage: {
    ok: false,
    label: "文件存储",
    path: "./storage",
    fileCount: 0,
    sizeBytes: 0,
    detail: "正在检查文件存储目录。"
  },
  workspace: {
    ok: false,
    label: "作品工程",
    path: "./workspace",
    fileCount: 0,
    sizeBytes: 0,
    detail: "正在检查作品工程目录。"
  },
  logs: {
    ok: false,
    label: "日志目录",
    path: "./logs",
    fileCount: 0,
    sizeBytes: 0,
    detail: "正在检查日志目录。"
  }
};

const fallbackLaunchEntries: AiSettingsStatus["launchEntries"] = [
  {
    label: "启动",
    fileName: "启动神笔马良.command",
    path: "启动神笔马良.command",
    ok: false,
    executable: false,
    detail: "双击后会准备目录、依赖和可用的本地服务，并自动打开网页。",
  },
  {
    label: "停止",
    fileName: "停止神笔马良.command",
    path: "停止神笔马良.command",
    ok: false,
    executable: false,
    detail: "停止网页服务和本地容器，不会删除作品和备份。",
  },
  {
    label: "体检",
    fileName: "体检神笔马良.command",
    path: "体检神笔马良.command",
    ok: false,
    executable: false,
    detail: "检查配置、AI Key、Docker、数据库、队列和网页是否正常。",
  }
];

function fallbackPersistenceStatus(runtimeHealth: AiSettingsStatus["runtimeHealth"]): AiSettingsStatus["persistence"] {
  const databaseReady = runtimeHealth.database.ok;

  return {
    mode: databaseReady ? "database" : "local_file",
    label: databaseReady ? "数据库持久化" : "检查保存方式",
    durable: databaseReady,
    fallbackActive: !databaseReady,
    detail: databaseReady
      ? "作品、正文、创作资料和本地配置会优先保存到 PostgreSQL。"
      : "正在确认数据库和本地文件目录；确认前，系统会保持本机保存优先。",
    scope: ["作品", "正文", "创作资料", "本地配置", "备份"],
    paths: {
      storageDir: runtimeHealth.storage.path,
      workspaceDir: runtimeHealth.workspace.path,
      logDir: runtimeHealth.logs.path
    },
    nextStep: runtimeHealth.database.nextStep
  };
}

function acceptanceItems(settings: AiSettingsStatus | null, runtimeHealth: AiSettingsStatus["runtimeHealth"]) {
  return [
    {
      label: "网页工作台",
      ok: Boolean(settings),
      detail: settings ? "前端和后端可以正常沟通。" : "正在读取设置中心。"
    },
    {
      label: "本地文件保存",
      ok: runtimeHealth.storage.ok && runtimeHealth.workspace.ok,
      detail: runtimeHealth.storage.ok && runtimeHealth.workspace.ok ? "作品、截图和导出目录可用。" : "文件目录正在检查或需要处理。"
    },
    {
      label: "数据库持久化",
      ok: runtimeHealth.database.ok,
      detail: runtimeHealth.database.ok ? "PostgreSQL 可用，结构化数据会优先写入数据库。" : "当前会先使用本地文件兜底保存。"
    },
    {
      label: "后台任务",
      ok: runtimeHealth.redis.ok,
      detail: runtimeHealth.redis.ok ? "Redis 可用，后台任务可以使用本地队列。" : "Redis 不可用时，生成任务会先使用进程内队列。"
    },
    {
      label: "知识库召回",
      ok: runtimeHealth.knowledge.ok,
      detail: runtimeHealth.knowledge.ok ? "创作资料会优先走本地向量索引。" : "当前会先用本地轻量索引兜底。"
    },
    {
      label: "真实 AI",
      ok: Boolean(settings?.hasApiKey),
      detail: settings?.hasApiKey ? "已配置 Key，会优先尝试真实 AI。" : "未配置 Key，当前使用本地模拟内核。"
    },
    {
      label: "合规边界",
      ok: true,
      detail: "只做公开/授权数据导入，不做绕登录、验证码或 AI 检测。"
    }
  ];
}

function buildAvailabilityStatus(settings: AiSettingsStatus | null, runtimeHealth: AiSettingsStatus["runtimeHealth"]) {
  const fileReady = runtimeHealth.storage.ok && runtimeHealth.workspace.ok;
  const pageReady = Boolean(settings);

  if (pageReady && fileReady) {
    const fallbackParts = [
      runtimeHealth.database.ok ? "" : "数据库用本地文件兜底",
      runtimeHealth.redis.ok ? "" : "后台任务用进程内队列",
      settings?.hasApiKey ? "" : "写作先用本地模拟内核"
    ].filter(Boolean);

    return {
      ok: true,
      label: fallbackParts.length ? "可用，本地兜底" : "全部正常",
      detail: fallbackParts.length
        ? `工作台可以正常写作和保存。${fallbackParts.join("；")}。`
        : "工作台、数据库、队列和真实 AI 配置都处于可用状态。"
    };
  }

  return {
    ok: false,
    label: "需处理",
    detail: pageReady ? "网页已打开，但文件存储或作品工程目录需要处理后再安心保存。" : "正在读取本地运行状态。"
  };
}

function AcceptanceItem({ item }: { item: { label: string; ok: boolean; detail: string } }) {
  return (
    <div className="flex min-h-24 gap-3 rounded-md border border-line bg-white p-4">
      {item.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-[#25633a]" size={17} /> : <AlertTriangle className="mt-0.5 shrink-0 text-[#9a4d13]" size={17} />}
      <div className="min-w-0">
        <p className="font-medium text-ink">{item.label}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
      </div>
    </div>
  );
}

function PersistenceStatusCard({ persistence, isLoading }: { persistence: AiSettingsStatus["persistence"]; isLoading: boolean }) {
  const badgeText = isLoading ? "读取中" : persistence.label;
  const badgeClassName = isLoading
    ? "bg-paper text-muted"
    : persistence.durable
      ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]"
      : "border-line bg-paper text-ink";

  return (
    <Card>
      <CardHeader title="保存状态" eyebrow="作品、正文、创作资料、本地配置" action={<Badge className={badgeClassName}>{badgeText}</Badge>} />
      <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-3 rounded-md border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            {persistence.mode === "database" ? <Database size={18} /> : <FolderOpen size={18} />}
            {isLoading ? "正在确认保存方式" : persistence.label}
          </div>
          <p className="text-sm leading-6 text-muted">{persistence.detail}</p>
          <p className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-ink">本地隐私模型保持不变：数据仍在这台电脑上处理和保存。</p>
          {!isLoading && persistence.nextStep ? <p className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-ink">下一步：{persistence.nextStep}</p> : null}
        </div>

        <div className="grid content-start gap-3 rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">纳入保存状态的内容</p>
          <div className="flex flex-wrap gap-2">
            {persistence.scope.map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
          <div className="grid gap-2 text-xs leading-5 text-muted">
            <p className="break-all">
              <span className="font-medium text-ink">文件存储：</span>
              {persistence.paths.storageDir}
            </p>
            <p className="break-all">
              <span className="font-medium text-ink">作品工程：</span>
              {persistence.paths.workspaceDir}
            </p>
            <p className="break-all">
              <span className="font-medium text-ink">运行日志：</span>
              {persistence.paths.logDir}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LaunchEntryCard({ entry, isLoading }: { entry: AiSettingsStatus["launchEntries"][number]; isLoading: boolean }) {
  const Icon = entry.label === "体检" ? FileText : Power;
  const badgeText = isLoading ? "读取中" : entry.ok ? "可双击" : "需处理";
  const badgeClassName = isLoading
    ? "bg-paper text-muted"
    : entry.ok
      ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]"
      : "border-[#f0c7a8] bg-[#fff7ed] text-[#9a4d13]";

  return (
    <div className="grid min-h-40 gap-3 rounded-md border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon size={17} />
          {entry.label}
        </div>
        <Badge className={badgeClassName}>{badgeText}</Badge>
      </div>
      <p className="break-all text-xs text-muted">{entry.fileName}</p>
      <p className="text-sm leading-6 text-muted">{entry.detail}</p>
      {entry.nextStep ? <p className="rounded-md border border-line bg-paper px-3 py-2 text-xs leading-5 text-ink">下一步：{entry.nextStep}</p> : null}
    </div>
  );
}

function WorkflowStepItem({ step }: { step: WorkflowSmokeResult["steps"][number] }) {
  return (
    <div className="flex min-h-28 gap-3 rounded-md border border-line bg-white p-4">
      {step.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-[#25633a]" size={17} /> : <AlertTriangle className="mt-0.5 shrink-0 text-[#9a4d13]" size={17} />}
      <div className="min-w-0">
        <p className="font-medium text-ink">{step.label}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{step.detail}</p>
        {step.nextStep ? <p className="mt-2 rounded-md border border-line bg-paper px-3 py-2 text-xs leading-5 text-ink">下一步：{step.nextStep}</p> : null}
      </div>
    </div>
  );
}

function HealthCard({
  icon,
  status,
  meta,
  isLoading
}: {
  icon: ReactNode;
  status: {
    ok: boolean;
    label: string;
    detail: string;
    nextStep?: string;
    path?: string;
    fileCount?: number;
    sizeBytes?: number;
  };
  meta?: string;
  isLoading: boolean;
}) {
  const fallback = isFallbackStatus(status);
  const badgeText = isLoading ? "读取中" : status.ok ? "正常" : fallback ? "本地兜底" : "需处理";
  const badgeClassName = isLoading
    ? "bg-paper text-muted"
    : status.ok
      ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]"
      : fallback
        ? "border-line bg-paper text-ink"
      : "border-[#f0c7a8] bg-[#fff7ed] text-[#9a4d13]";

  return (
    <div className="grid min-h-36 gap-3 rounded-md border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {icon}
          {status.label}
        </span>
        <Badge className={badgeClassName}>{badgeText}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted">{status.detail}</p>
      {!isLoading && status.nextStep ? (
        <p className="rounded-md border border-line bg-paper px-3 py-2 text-xs leading-5 text-ink">下一步：{status.nextStep}</p>
      ) : null}
      {status.path ? <p className="break-all text-xs text-muted">{status.path}</p> : null}
      {meta ? <p className="text-xs font-medium text-ink">{meta}</p> : null}
    </div>
  );
}

function isFallbackStatus(status: { detail: string }) {
  return /兜底|仍可|回退写入|暂时不可用/u.test(status.detail);
}

function SettingLine({ icon, label, value, nextStep }: { icon: ReactNode; label: string; value: string; nextStep?: string }) {
  return (
    <div className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[180px_1fr]">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      <span className="grid gap-2 break-all text-sm text-muted">
        {value}
        {nextStep ? <span className="rounded-md border border-line bg-paper px-3 py-2 text-xs leading-5 text-ink">下一步：{nextStep}</span> : null}
      </span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
