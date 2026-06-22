import type {
  BackupExportResult,
  BackupListItem,
  BackupRestoreResult,
  ApplyRewriteResult,
  AuthorizedCaptureResult,
  BrowserCaptureExecutorResult,
  BrowserCaptureSessionResult,
  CrawlerJobRecord,
  CsvImportResult,
  DatasourceRecord,
  DatasourceType,
  EditorMarkRecord,
  EditorVersionRecord,
  GeneratePlanInput,
  AiProviderMode,
  LocalCleanupResult,
  LocalMaintenanceResult,
  LocalResetResult,
  MarkType,
  PersonalStrategy,
  ReviseSceneDraftInput,
  ReviewReportResult,
  RewriteSuggestion,
  SceneDraftRevision,
  ScreenshotImportResult,
  AutoWritingPreset,
  SavedInspiration,
  StoryPlan,
  Trend,
  Work,
  WorkspaceExportResult,
  WritingAssetLibrary,
  WritingMemory
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

export function createStoryFromInspiration(input: GeneratePlanInput) {
  return postJson<StoryPlan>("/api/writing/inspiration", input);
}

export function createStoryFromAuto(input: GeneratePlanInput) {
  return postJson<StoryPlan>("/api/writing/auto", input);
}

export function createRewriteSuggestion(input: { markId: string; selectedText: string; feedback: string }) {
  return postJson<RewriteSuggestion>("/api/writing/rewrite-mark", input);
}

export function reviseSceneDraft(input: ReviseSceneDraftInput) {
  return postJson<SceneDraftRevision>("/api/writing/revise-scene", input);
}

export function getWritingAssets() {
  return getJson<WritingAssetLibrary>("/api/writing-assets");
}

export function saveInspirationAsset(input: Omit<SavedInspiration, "id" | "createdAt" | "updatedAt">) {
  return postJson<{ inspiration: SavedInspiration; message: string }>("/api/writing-assets/inspirations", input);
}

export function saveAutoPreset(input: Omit<AutoWritingPreset, "id" | "createdAt" | "updatedAt">) {
  return postJson<{ preset: AutoWritingPreset; message: string }>("/api/writing-assets/presets", input);
}

export function deleteWritingAsset(id: string) {
  return deleteJson<{ id: string; removed: boolean; message: string }>(`/api/writing-assets/${encodeURIComponent(id)}`);
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

export function getTrends() {
  return getJson<Trend[]>("/api/trends");
}

export function saveStoryPlan(plan: StoryPlan) {
  return postJson<{ persisted: boolean; work: Work; message: string; initialEditorMarks?: EditorMarkRecord[]; workspaceExport?: WorkspaceExportResult }>("/api/works/from-plan", plan);
}

export function exportWorkWorkspace(workId: string) {
  return postJson<WorkspaceExportResult & { preview?: StoryPlan }>(`/api/works/${workId}/export-workspace`, {});
}

export function saveWorkFullText(workId: string, fullText: string, storyPlan?: StoryPlan) {
  return postJson<{ persisted: boolean; work: Work; message: string }>(`/api/works/${encodeURIComponent(workId)}/full-text`, { fullText, storyPlan });
}

export function getReviewReport(workId: string) {
  return getJson<ReviewReportResult>(`/api/review/work/${workId}`);
}

export function createReviewReport(
  workId: string,
  input?: {
    readCount?: number;
    subscriptionCount?: number;
    revenue?: number;
    completionRate?: number;
    rankingChange?: string;
    recommendationChange?: string;
    commentFeedback?: string;
    commentKeywords?: string[] | string;
  }
) {
  return postJson<ReviewReportResult>(`/api/review/work/${workId}`, input ?? {});
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
    defaultBaseUrl: string;
    apiKeyEnv: string;
    textModelEnv: string;
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
  crawlerSettings: {
    defaultFrequency: string;
    concurrency: number;
    timeoutSeconds: number;
    scheduledTasks: boolean;
    enabledImports: string[];
    boundaries: string[];
  };
  aiStatus: {
    provider: string;
    providerLabel: string;
    mode: Exclude<AiProviderMode, "fallback">;
    model: string;
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
  baseUrl?: string;
  openAiTextModel?: string;
  openAiEmbeddingModel?: string;
  openAiApiKey?: string;
  kimiApiKey?: string;
  kimiTextModel?: string;
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
  counts: {
    topicCards: number;
    sceneCards: number;
    scenePrompts: number;
    sceneDrafts: number;
  };
  sampleClues: string[];
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

export function getWritingMemories() {
  return getJson<WritingMemory[]>("/api/memory");
}

export function createWritingMemory(input: {
  sourceType?: WritingMemory["sourceType"];
  genre?: string;
  rule: string;
  positiveExample?: string;
  negativeExample?: string;
  confidence?: number;
  relatedWorkIds?: string[];
  enabled?: boolean;
}) {
  return postJson<WritingMemory & { persisted: boolean; message: string }>("/api/memory", input);
}

export function updateWritingMemory(
  id: string,
  input: Partial<Pick<WritingMemory, "rule" | "positiveExample" | "negativeExample" | "confidence" | "enabled">> & { genre?: string }
) {
  return patchJson<WritingMemory & { persisted: boolean; message: string } | { id: string; persisted: boolean; message: string }>(`/api/memory/${id}`, input);
}

export function deleteWritingMemory(id: string) {
  return deleteJson<{ id: string; deleted: boolean; persisted: boolean; message: string }>(`/api/memory/${encodeURIComponent(id)}`);
}

export function getPersonalStrategies() {
  return getJson<PersonalStrategy[]>("/api/strategies");
}

export function createPersonalStrategy(input: {
  sourceType?: PersonalStrategy["sourceType"];
  genre?: string;
  rule: string;
  evidence?: string;
  action?: string;
  confidence?: number;
  relatedWorkIds?: string[];
  enabled?: boolean;
}) {
  return postJson<PersonalStrategy & { persisted: boolean; message: string }>("/api/strategies", input);
}

export function updatePersonalStrategy(
  id: string,
  input: Partial<Pick<PersonalStrategy, "rule" | "evidence" | "action" | "confidence" | "enabled">> & { genre?: string }
) {
  return patchJson<PersonalStrategy & { persisted: boolean; message: string } | { id: string; persisted: boolean; message: string }>(`/api/strategies/${id}`, input);
}

export function deletePersonalStrategy(id: string) {
  return deleteJson<{ id: string; deleted: boolean; persisted: boolean; message: string }>(`/api/strategies/${encodeURIComponent(id)}`);
}

export function getDatasources() {
  return getJson<DatasourceRecord[]>("/api/datasources");
}

export function createDatasource(input: {
  name: string;
  type: DatasourceType;
  enabled?: boolean;
  frequency?: string;
  sourceDetail?: string;
  note?: string;
}) {
  return postJson<{ datasource: DatasourceRecord; message: string }>("/api/datasources", input);
}

export function updateDatasource(id: string, input: Partial<Pick<DatasourceRecord, "name" | "type" | "enabled" | "frequency" | "sourceDetail" | "note">>) {
  return patchJson<{ datasource: DatasourceRecord; message: string }>(`/api/datasources/${encodeURIComponent(id)}`, input);
}

export function getCrawlerJobs() {
  return getJson<CrawlerJobRecord[]>("/api/crawler/jobs");
}

export function importDatasourceCsv(input: { name?: string; fileName?: string; csvText: string; fieldMappings?: Record<string, string> }) {
  return postJson<CsvImportResult>("/api/datasources/import-csv", input);
}

export function importDatasourceText(input: { name?: string; rawText: string }) {
  return postJson<CsvImportResult>("/api/datasources/import-text", input);
}

export function runAuthorizedDatasourceCapture(input: {
  datasourceId?: string;
  name?: string;
  pageUrl?: string;
  visibleText?: string;
  screenshotDataUrl?: string;
  screenshotFileName?: string;
}) {
  return postJson<AuthorizedCaptureResult>("/api/datasources/authorized-capture", input);
}

export function startBrowserCaptureSession(input: { datasourceId?: string; name?: string; pageUrl?: string; platform?: string }) {
  return postJson<BrowserCaptureSessionResult>("/api/datasources/browser-capture-sessions", input);
}

export function getBrowserCaptureSession(sessionId: string) {
  return getJson<BrowserCaptureSessionResult>(`/api/datasources/browser-capture-sessions/${encodeURIComponent(sessionId)}`);
}

export function openBrowserCaptureSession(sessionId: string) {
  return postJson<BrowserCaptureExecutorResult>(`/api/datasources/browser-capture-sessions/${encodeURIComponent(sessionId)}/open`, {});
}

export function previewBrowserCaptureSessionVisiblePage(sessionId: string) {
  return postJson<BrowserCaptureExecutorResult>(`/api/datasources/browser-capture-sessions/${encodeURIComponent(sessionId)}/preview-visible-page`, {});
}

export function readBrowserCaptureSessionVisiblePage(sessionId: string) {
  return postJson<BrowserCaptureExecutorResult>(`/api/datasources/browser-capture-sessions/${encodeURIComponent(sessionId)}/read-visible-page`, {});
}

export function submitBrowserCaptureSessionVisibleText(sessionId: string, input: { visibleText: string; pageUrl?: string }) {
  return postJson<BrowserCaptureSessionResult>(`/api/datasources/browser-capture-sessions/${encodeURIComponent(sessionId)}/visible-text`, input);
}

export function importDatasourcePublicPage(input: { name?: string; url: string }) {
  return postJson<CsvImportResult>("/api/datasources/import-public-page", input);
}

export function importDatasourceScreenshot(input: { name?: string; fileName?: string; dataUrl: string; recognizedText?: string }) {
  return postJson<ScreenshotImportResult>("/api/datasources/import-screenshot", input);
}

export function correctDatasourceScreenshotJob(jobId: string, input: { recognizedText: string }) {
  return postJson<CsvImportResult>(`/api/crawler/jobs/${encodeURIComponent(jobId)}/screenshot-correction`, input);
}

export function retryDatasourceCrawlerJob(jobId: string) {
  return postJson<CsvImportResult>(`/api/crawler/jobs/${encodeURIComponent(jobId)}/retry`, {});
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
