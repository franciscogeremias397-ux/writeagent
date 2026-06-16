"use client";

import { useEffect, useState } from "react";
import { Archive, Eraser, FileX2, RotateCcw, Trash2 } from "lucide-react";
import type {
  BackupExportResult,
  BackupListItem,
  BackupRestoreResult,
  LocalCleanupResult,
  LocalMaintenanceResult,
  LocalResetResult
} from "@shenbi/shared";
import { Badge, Card, CardHeader, GhostButton } from "@/components/ui";
import {
  cleanupImportedData,
  clearLocalLogs,
  clearRuntimeCache,
  exportLocalBackup,
  getLocalBackups,
  resetStarterData,
  restoreLatestBackup
} from "@/lib/api";

export function BackupPanel() {
  const [backup, setBackup] = useState<BackupExportResult | null>(null);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<LocalCleanupResult | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<LocalMaintenanceResult | null>(null);
  const [resetResult, setResetResult] = useState<LocalResetResult | null>(null);
  const [message, setMessage] = useState("可以把当前作品、趋势、记忆、灵感模板、复盘和采集日志导出为本地备份。");
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    getLocalBackups()
      .then((result) => setBackups(result))
      .catch(() => setBackups([]));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setMessage("正在整理并写入备份文件。");

    try {
      const result = await exportLocalBackup();
      setBackup(result);
      setMessage(result.message);
      setBackups(await getLocalBackups());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备份导出失败，请稍后再试。");
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) {
      setConfirmRestore(true);
      setConfirmCleanup(false);
      setConfirmClearCache(false);
      setConfirmClearLogs(false);
      setConfirmReset(false);
      setMessage("会读取最近一份备份，并把作品、趋势、记忆、策略、复盘、数据源和编辑记录恢复进去。再点一次确认恢复。");
      return;
    }

    setRestoring(true);
    setMessage("正在读取最新备份并尝试恢复。");

    try {
      const result = await restoreLatestBackup();
      setRestoreResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败，请稍后再试。");
    } finally {
      setRestoring(false);
      setConfirmRestore(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirmCleanup) {
      setConfirmCleanup(true);
      setConfirmRestore(false);
      setConfirmClearCache(false);
      setConfirmClearLogs(false);
      setConfirmReset(false);
      setMessage("会先自动备份，再清理公开网页/CSV/截图/手动导入记录、验证作品、验证记忆、验证灵感模板和截图缓存。再点一次确认清理。");
      return;
    }

    setCleaning(true);
    setMessage("正在备份并清理导入/验证数据。");

    try {
      const result = await cleanupImportedData();
      setCleanupResult(result);
      setMessage(result.message);
      setBackups(await getLocalBackups());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理失败，请先导出备份后再试。");
    } finally {
      setCleaning(false);
      setConfirmCleanup(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirmClearCache) {
      setConfirmClearCache(true);
      setConfirmRestore(false);
      setConfirmCleanup(false);
      setConfirmClearLogs(false);
      setConfirmReset(false);
      setMessage("只会清理截图缓存、临时缓存和运行缓存，不会删除作品、备份、记忆和策略。再点一次确认清理。");
      return;
    }

    setClearingCache(true);
    setMessage("正在清理运行缓存。");

    try {
      const result = await clearRuntimeCache();
      setMaintenanceResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理运行缓存失败，请稍后再试。");
    } finally {
      setClearingCache(false);
      setConfirmClearCache(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirmClearLogs) {
      setConfirmClearLogs(true);
      setConfirmRestore(false);
      setConfirmCleanup(false);
      setConfirmClearCache(false);
      setConfirmReset(false);
      setMessage("只会清空本地日志目录，不会删除作品、备份、记忆和策略。再点一次确认清空。");
      return;
    }

    setClearingLogs(true);
    setMessage("正在清空本地日志。");

    try {
      const result = await clearLocalLogs();
      setMaintenanceResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清空日志失败，请稍后再试。");
    } finally {
      setClearingLogs(false);
      setConfirmClearLogs(false);
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setConfirmRestore(false);
      setConfirmCleanup(false);
      setConfirmClearCache(false);
      setConfirmClearLogs(false);
      setMessage("会先自动备份，再把作品、趋势、记忆、灵感模板、复盘、标记、版本和数据源恢复到初始示例状态。再点一次确认重置。");
      return;
    }

    setResetting(true);
    setMessage("正在备份并重置为初始数据。");

    try {
      const result = await resetStarterData();
      setResetResult(result);
      setMessage(result.message);
      setBackups(await getLocalBackups());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败，请先导出备份后再试。");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const latest = backups[0];

  return (
    <Card>
      <CardHeader title="备份与恢复" action={backup ? <Badge>{backup.fileName}</Badge> : null} />
      <div className="grid gap-3 p-5">
        <GhostButton className="justify-start" onClick={handleExport} disabled={exporting}>
          <Archive size={17} />
          {exporting ? "导出中" : "导出全部数据"}
        </GhostButton>
        <GhostButton className="justify-start" onClick={handleRestore} disabled={restoring || backups.length === 0}>
          <RotateCcw size={17} />
          {restoring ? "恢复中" : confirmRestore ? "确认恢复最新备份" : "恢复最新备份"}
        </GhostButton>
        <GhostButton className="justify-start" onClick={handleClearCache} disabled={clearingCache}>
          <Eraser size={17} />
          {clearingCache ? "清理中" : confirmClearCache ? "确认清理运行缓存" : "清理运行缓存"}
        </GhostButton>
        <GhostButton className="justify-start" onClick={handleClearLogs} disabled={clearingLogs}>
          <FileX2 size={17} />
          {clearingLogs ? "清空中" : confirmClearLogs ? "确认清空日志" : "清空日志"}
        </GhostButton>
        <GhostButton className="justify-start" onClick={handleCleanup} disabled={cleaning}>
          <Trash2 size={17} />
          {cleaning ? "清理中" : confirmCleanup ? "确认清理导入/验证数据" : "清理导入/验证数据"}
        </GhostButton>
        <GhostButton className="justify-start" onClick={handleReset} disabled={resetting}>
          <RotateCcw size={17} />
          {resetting ? "重置中" : confirmReset ? "确认重置为初始数据" : "重置为初始数据"}
        </GhostButton>

        <p className="rounded-md border border-line bg-paper p-3 text-sm leading-6 text-muted">{message}</p>

        {latest ? (
          <div className="rounded-md border border-line bg-white p-4 text-sm">
            <p className="text-xs text-muted">最近备份</p>
            <p className="mt-1 break-all font-medium">{latest.fileName}</p>
            <p className="mt-2 text-xs text-muted">
              大小约 {Math.ceil(latest.sizeBytes / 1024)} KB，包含 {latest.counts.works} 部作品、{latest.counts.trends} 条趋势、{latest.counts.memories} 条记忆、{latest.counts.strategies} 条策略、{latest.counts.knowledgeChunks} 条知识索引、{latest.counts.writingAssets} 条灵感/模板。
            </p>
          </div>
        ) : null}

        {backup ? (
          <div className="grid gap-3 rounded-md border border-line bg-white p-4 text-sm">
            <div>
              <p className="text-xs text-muted">备份文件</p>
              <p className="mt-1 break-all font-medium">{backup.path}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Count label="作品" value={backup.counts.works} />
              <Count label="趋势" value={backup.counts.trends} />
              <Count label="记忆" value={backup.counts.memories} />
              <Count label="策略" value={backup.counts.strategies} />
              <Count label="知识索引" value={backup.counts.knowledgeChunks} />
              <Count label="灵感模板" value={backup.counts.writingAssets} />
              <Count label="复盘" value={backup.counts.reviews} />
              <Count label="数据源" value={backup.counts.datasources} />
              <Count label="采集日志" value={backup.counts.crawlerJobs} />
              <Count label="标记" value={backup.counts.marks} />
              <Count label="版本" value={backup.counts.versions} />
            </div>
          </div>
        ) : null}

        {restoreResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{restoreResult.restored ? "恢复完成" : "备份已读取"}</p>
              <Badge>{restoreResult.fileName || "无备份"}</Badge>
            </div>
            <p className="break-all text-sm leading-6 text-muted">{restoreResult.path}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Count label="作品" value={restoreResult.counts.works} />
              <Count label="趋势" value={restoreResult.counts.trends} />
              <Count label="记忆" value={restoreResult.counts.memories} />
              <Count label="策略" value={restoreResult.counts.strategies} />
              <Count label="知识索引" value={restoreResult.counts.knowledgeChunks} />
              <Count label="灵感模板" value={restoreResult.counts.writingAssets} />
              <Count label="复盘" value={restoreResult.counts.reviews} />
            </div>
          </div>
        ) : null}

        {cleanupResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">清理完成</p>
              <Badge>{cleanupResult.backupFileName ?? "已备份"}</Badge>
            </div>
            {cleanupResult.backupPath ? <p className="break-all text-sm leading-6 text-muted">{cleanupResult.backupPath}</p> : null}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Count label="作品" value={cleanupResult.counts.works} />
              <Count label="趋势" value={cleanupResult.counts.trends} />
              <Count label="记忆" value={cleanupResult.counts.memories} />
              <Count label="策略" value={cleanupResult.counts.strategies} />
              <Count label="知识索引" value={cleanupResult.counts.knowledgeChunks} />
              <Count label="灵感模板" value={cleanupResult.counts.writingAssets} />
              <Count label="复盘" value={cleanupResult.counts.reviews} />
              <Count label="数据源" value={cleanupResult.counts.datasources} />
              <Count label="采集日志" value={cleanupResult.counts.crawlerJobs} />
              <Count label="标记" value={cleanupResult.counts.marks} />
              <Count label="截图" value={cleanupResult.counts.screenshots} />
            </div>
          </div>
        ) : null}

        {maintenanceResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{maintenanceResult.action === "cache" ? "运行缓存已清理" : "日志已清空"}</p>
              <Badge>{formatBytes(maintenanceResult.totalBytes)}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted">{maintenanceResult.message}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {maintenanceResult.items.map((item) => (
                <div key={item.path} className="rounded-md border border-line bg-paper p-3">
                  <p className="text-xs text-muted">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.fileCount}</p>
                  <p className="mt-1 text-xs text-muted">{formatBytes(item.sizeBytes)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {resetResult ? (
          <div className="grid gap-3 rounded-md border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">重置完成</p>
              <Badge>{resetResult.backupFileName ?? "已备份"}</Badge>
            </div>
            {resetResult.backupPath ? <p className="break-all text-sm leading-6 text-muted">{resetResult.backupPath}</p> : null}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Count label="清空作品" value={resetResult.counts.works} />
              <Count label="清空趋势" value={resetResult.counts.trends} />
              <Count label="清空记忆" value={resetResult.counts.memories} />
              <Count label="清空策略" value={resetResult.counts.strategies} />
              <Count label="清空知识索引" value={resetResult.counts.knowledgeChunks} />
              <Count label="清空灵感模板" value={resetResult.counts.writingAssets} />
              <Count label="清空复盘" value={resetResult.counts.reviews} />
              <Count label="初始作品" value={resetResult.starterCounts.works} />
              <Count label="初始趋势" value={resetResult.starterCounts.trends} />
              <Count label="初始记忆" value={resetResult.starterCounts.memories} />
              <Count label="初始策略" value={resetResult.starterCounts.strategies} />
              <Count label="初始知识索引" value={resetResult.starterCounts.knowledgeChunks} />
              <Count label="截图" value={resetResult.counts.screenshots} />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
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
