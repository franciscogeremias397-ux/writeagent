import type {
  BackupExportResult,
  BackupListItem,
  BackupRestoreResult,
  ApplyRewriteResult,
  EditorMarkRecord,
  EditorVersionRecord,
  FullDraftInput,
  FullDraftJobSnapshot,
  AiProviderMode,
  LocalCleanupResult,
  LocalMaintenanceResult,
  LocalResetResult,
  MarkType,
  RewriteSuggestion,
  StoryOutlineInput,
  StoryOutlineResult,
  StoryPlan,
  Work
} from "@shenbi/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "/backend";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`接口请求失败：${response.status} ${text.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`接口请求失败：${response.status} ${text.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`接口请求失败：${response.status} ${text.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`接口请求失败：${response.status} ${text.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

export function startFullDraftJob(input: FullDraftInput) {
  return postJson<FullDraftJobSnapshot>("/api/generate/full-draft", input);
}

export function createStoryOutline(input: StoryOutlineInput) {
  return postJson<StoryOutlineResult>("/api/generate/story-outline", input);
}

export function getFullDraftJob(jobId: string) {
  return getJson<FullDraftJobSnapshot>(`/api/generate/jobs/${encodeURIComponent(jobId)}`);
}

export function resumeFullDraftJob(jobId: string) {
  return postJson<FullDraftJobSnapshot>(`/api/generate/jobs/${encodeURIComponent(jobId)}/resume`, {});
}

export function createRewriteSuggestion(input: { markId: string; selectedText: string; feedback: string }) {
  return postJson<RewriteSuggestion>("/api/writing/rewrite-mark", input);
}

export function getWorks() {
  return getJson<Work[]>("/api/works");
}

export function getWork(workId: string) {
  return getJson<Work>(`/api/works/${encodeURIComponent(workId)}`);
}

export type WorkFormInput = {
  title: string;
  platform?: string;
  status?: Work["status"];
  genreTags?: string[] | string;
  styleTags?: string[] | string;
  summary?: string;
  fullText?: string;
  readCount?: number;
  subscriptionCount?: number;
  revenue?: number;
  completionRate?: number;
  commentFeedback?: string;
  commentKeywords?: string[] | string;
};

export function createWork(input: WorkFormInput) {
  return postJson<{ persisted: boolean; work: Work; message: string }>("/api/works", input);
}

export function updateWork(workId: string, input: Partial<WorkFormInput> & { wordCount?: number }) {
  return patchJson<{ persisted: boolean; work: Work; message: string }>(`/api/works/${encodeURIComponent(workId)}`, input);
}

export function deleteWork(workId: string) {
  return deleteJson<{ persisted: boolean; deleted: boolean; message: string }>(`/api/works/${encodeURIComponent(workId)}`);
}

export function saveWorkFullText(workId: string, fullText: string, storyPlan?: StoryPlan) {
  return postJson<{ persisted: boolean; work: Work; message: string }>(`/api/works/${encodeURIComponent(workId)}/full-text`, { fullText, storyPlan });
}

export function getEditorMarks(workId: string) {
  return getJson<EditorMarkRecord[]>(`/api/works/${workId}/marks`);
}

export function createEditorMark(input: {
  workId: string;
  label: string;
  index: number;
  type: MarkType;
  selectedText: string;
  comment?: string;
  startOffset: number;
  endOffset: number;
}) {
  return postJson<EditorMarkRecord>("/api/marks", input);
}

export function deleteEditorMark(markId: string) {
  return deleteJson<{ persisted: boolean; message: string }>(`/api/marks/${markId}`);
}

export function getEditorVersions(workId: string) {
  return getJson<EditorVersionRecord[]>(`/api/works/${workId}/versions`);
}

export function applyEditorRewrite(input: {
  workId: string;
  markId: string;
  markLabel: string;
  originalText: string;
  newText: string;
  reason: string;
  impactNotes?: string[];
  updateMemory?: boolean;
  fullText?: string;
}) {
  return postJson<ApplyRewriteResult>("/api/editor/apply-rewrite", input);
}

export type AiSettingsStatus = {
  aiProvider: string;
  hasApiKey: boolean;
  availableAiProviders: Array<{
    id: "openai" | "kimi" | "deepseek";
    label: string;
    defaultTextModel: string;
    defaultOutlineModel?: string;
    defaultBaseUrl: string;
    apiKeyEnv: string;
    textModelEnv: string;
    outlineModelEnv?: string;
    baseUrlEnv: string;
    supportsVision: boolean;
  }>;
  storageDir: string;
  workspaceDir: string;
  logDir: string;
  persistence: {
    mode: "database" | "local_file";
    label: string;
    durable: boolean;
    fallbackActive: boolean;
    detail: string;
    scope: string[];
    paths: {
      storageDir: string;
      workspaceDir: string;
      logDir: string;
    };
    nextStep?: string;
  };
  launchEntries: Array<{
    ok: boolean;
    label: string;
    fileName: string;
    path: string;
    executable: boolean;
    detail: string;
    nextStep?: string;
  }>;
  runtimeHealth: {
    database: {
      ok: boolean;
      label: string;
      detail: string;
      nextStep?: string;
    };
    redis: {
      ok: boolean;
      label: string;
      detail: string;
      nextStep?: string;
    };
    knowledge: {
      ok: boolean;
      label: string;
      detail: string;
      nextStep?: string;
    };
    storage: {
      ok: boolean;
      label: string;
      path: string;
      fileCount: number;
      sizeBytes: number;
      detail: string;
      nextStep?: string;
    };
    workspace: {
      ok: boolean;
      label: string;
      path: string;
      fileCount: number;
      sizeBytes: number;
      detail: string;
      nextStep?: string;
    };
    logs: {
      ok: boolean;
      label: string;
      path: string;
      fileCount: number;
      sizeBytes: number;
      detail: string;
      nextStep?: string;
    };
  };
  aiStatus: {
    provider: string;
    providerLabel: string;
    mode: Exclude<AiProviderMode, "fallback">;
    model: string;
    outlineModel?: string;
    baseUrl: string;
    embeddingModel: string;
    hasApiKey: boolean;
    apiKeyEnv: string;
    message: string;
  };
};

export function getSettings() {
  return getJson<AiSettingsStatus>("/api/settings");
}

export function saveAiSettings(input: {
  aiProvider?: string;
  apiKey?: string;
  textModel?: string;
  outlineModel?: string;
  baseUrl?: string;
  openAiTextModel?: string;
  openAiEmbeddingModel?: string;
  openAiApiKey?: string;
  kimiApiKey?: string;
  kimiTextModel?: string;
  kimiOutlineModel?: string;
  kimiBaseUrl?: string;
  deepSeekApiKey?: string;
  deepSeekTextModel?: string;
  deepSeekBaseUrl?: string;
  clearApiKey?: boolean;
  clearOpenAiApiKey?: boolean;
  dryRun?: boolean;
}) {
  return patchJson<{
    status: "saved" | "preview";
    dryRun: boolean;
    hasApiKey: boolean;
    aiStatus: AiSettingsStatus["aiStatus"];
    message: string;
  }>("/api/settings", input);
}

export function testAiConnection() {
  return postJson<{ ok: boolean; message?: string; response?: unknown; error?: string; aiStatus?: AiSettingsStatus["aiStatus"] }>(
    "/api/settings/test-ai",
    {}
  );
}

export type AiKernelTestResult = {
  ok: boolean;
  providerMode: AiProviderMode;
  title: string;
  detail: string;
  providerNotice?: string;
  draft: {
    wordCount: number;
    genre: string;
    tags: string[];
    marketSummary: string;
    qualitySummary: string;
  };
  nextStep?: string;
};

export function testAiKernel() {
  return postJson<AiKernelTestResult>("/api/settings/test-ai-kernel", {});
}

export type WorkflowSmokeResult = {
  ok: boolean;
  summary: string;
  steps: Array<{
    label: string;
    ok: boolean;
    detail: string;
    nextStep?: string;
  }>;
  cleaned: {
    workId?: string;
    deletedMemories: number;
  };
  nextStep?: string;
};

export function testWritingWorkflow() {
  return postJson<WorkflowSmokeResult>("/api/settings/test-workflow", {});
}

export function exportLocalBackup() {
  return postJson<BackupExportResult>("/api/backups/export", {});
}

export function getLocalBackups() {
  return getJson<BackupListItem[]>("/api/backups");
}

export function restoreLatestBackup() {
  return postJson<BackupRestoreResult>("/api/backups/restore-latest", {});
}

export function cleanupImportedData() {
  return postJson<LocalCleanupResult>("/api/backups/cleanup-imported", {});
}

export function clearRuntimeCache() {
  return postJson<LocalMaintenanceResult>("/api/backups/clear-cache", {});
}

export function clearLocalLogs() {
  return postJson<LocalMaintenanceResult>("/api/backups/clear-logs", {});
}

export function resetStarterData() {
  return postJson<LocalResetResult>("/api/backups/reset-starter", {});
}
