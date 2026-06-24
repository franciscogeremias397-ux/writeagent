export type WorkStatus = "draft" | "published" | "serializing" | "finished";

export type MarkType =
  | "delete"
  | "optimize"
  | "rewrite"
  | "logic"
  | "emotion"
  | "rhythm"
  | "character"
  | "information_gap"
  | "scene_goal";

export type Work = {
  id: string;
  title: string;
  cover: string;
  status: WorkStatus;
  platform: string;
  genreTags: string[];
  styleTags: string[];
  wordCount: number;
  summary: string;
  fullText?: string;
  storyPlan?: StoryPlan;
  commentFeedback?: string;
  commentKeywords?: string[];
  sourceLabel?: string;
  sourceDetail?: string;
  importedAt?: string;
  generation?: WorkGenerationMetadata;
  readCount: number;
  subscriptionCount: number;
  revenue: number;
  completionRate: number;
  updatedAt: string;
  createdAt: string;
};

export type WorkGenerationMetadata = {
  jobId?: string;
  createdAt: string;
  route: "kimi_full_text" | "legacy_deepseek" | "legacy_unknown" | "manual";
  proseProvider: AiProviderMode;
  proseModel?: string;
  blueprintProvider?: AiProviderMode;
  blueprintModel?: string;
  providerNotice?: string;
  targetLength?: string;
  completedSections?: number;
  totalSections?: number;
  wordCount?: number;
  continuations?: number;
  rewrites?: number;
  continuityChecks?: number;
  attempts?: number;
  checkpointFile?: string;
};

export type Trend = {
  id: string;
  platform: string;
  genre: string;
  heat: number;
  growthRate: number;
  opportunityScore: number;
  saturationScore: number;
  reason: string;
  tags: string[];
  sourceLabel?: string;
  sourceDetail?: string;
  createdAt: string;
};

export type TopicCard = {
  id: string;
  title: string;
  hook: string;
  platform: string;
  genre: string;
  reader: string;
  protagonist: string;
  conflict: string;
  emotion: string;
  reversal: string;
  length: string;
  fitScore: number;
  samenessRisk: "低" | "中" | "高";
  originalitySpace: string;
  recommendationScore: number;
};

export type EmotionalBeat = {
  stage: string;
  emotion: string;
  scene: string;
  readerExpectation: string;
  releasePoint: string;
};

export type ConflictStep = {
  level: number;
  event: string;
  parties: string;
  cost: string;
  purpose: string;
};

export type InformationGap = {
  readerKnows: string;
  protagonistKnows: string;
  antagonistMisses: string;
  revealTiming: string;
  payoff: string;
};

export type CharacterCard = {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  desire: string;
  fear: string;
  relationNotes: string;
};

export type SceneCard = {
  id: string;
  index: number;
  title: string;
  goal: string;
  protagonistWant: string;
  obstacle: string;
  conflictUpgrade: string;
  informationGap: string;
  emotion: string;
  keyAction: string;
  keyDialogue: string;
  hook: string;
  estimatedWords: number;
  relatedCharacters: string[];
  relatedForeshadows: string[];
};

export type ScenePrompt = {
  id: string;
  sceneId: string;
  index: number;
  title: string;
  objective: string;
  context: string;
  writingPrompt: string;
  mustInclude: string[];
  avoid: string[];
};

export type SceneDraft = {
  id: string;
  sceneId: string;
  index: number;
  title: string;
  wordTarget: number;
  text: string;
  qualityScore: number;
  readerNotes: string[];
  revisionFocus: string;
};

export type AiProviderMode = "mock" | "openai" | "kimi" | "deepseek" | "fallback";

export type FullDraftMode = "inspiration" | "autopilot";

export type FullDraftInput = {
  mode: FullDraftMode;
  inspiration?: string;
  targetPlatform?: string;
  targetLength?: "auto" | "8000" | "15000" | "20000" | string;
  optionalDirection?: string;
  avoid?: string[] | string;
  approvedOutline?: StoryOutlineResult;
  memoryHints?: string[];
  strategyHints?: string[];
};

export type StoryOutlineInput = FullDraftInput & {
  previousOutlines?: StoryOutlineResult[];
};

export type StoryOutlineResult = {
  title: string;
  direction: string;
  outline: string;
  highlights: string[];
  marketReason: string;
  providerMode?: AiProviderMode;
  providerNotice?: string;
  modelName?: string;
};

export type FullDraftAiResult = {
  title: string;
  content: string;
  genre: string;
  tags: string[];
  summary: string;
  marketSummary: string;
  qualitySummary: string;
  internalPlan: string;
  revisionNotes: string[];
  providerMode?: AiProviderMode;
  providerNotice?: string;
  modelName?: string;
};

export type FullDraftResult = {
  workId: string;
  editorUrl: string;
  title: string;
  status: "completed";
  providerMode: AiProviderMode;
  providerNotice?: string;
  modelName?: string;
  marketSummary: string;
  qualitySummary: string;
  persisted: boolean;
  message: string;
};

export type FullDraftJobStatus = "queued" | "running" | "completed" | "failed";

export type FullDraftJobCheckpointSnapshot = {
  canResume: boolean;
  completedSections: number;
  totalSections: number;
  wordCount: number;
  stage: "starting" | "blueprint" | "section" | "continuity" | "saving" | "failed" | "completed";
  currentSectionTitle?: string;
  continuations: number;
  rewrites: number;
  continuityChecks: number;
  qualityLog: string[];
  updatedAt: string;
};

export type FullDraftJobSnapshot = {
  jobId: string;
  status: FullDraftJobStatus;
  progress: number;
  progressLabel: string;
  detail?: string;
  createdAt: string;
  updatedAt: string;
  checkpoint?: FullDraftJobCheckpointSnapshot;
  result?: FullDraftResult;
  error?: string;
};

export type SceneDraftRevision = SceneDraft & {
  providerMode?: AiProviderMode;
  providerNotice?: string;
  changeNotes: string[];
};

export type ReviseSceneDraftInput = {
  sceneDraft: SceneDraft;
  scenePrompt?: ScenePrompt;
  feedback?: string;
};

export type ReaderReport = {
  openingScore: number;
  empathyScore: number;
  emotionScore: number;
  reversalScore: number;
  closureScore: number;
  platformFitScore: number;
  samenessRisk: "低" | "中" | "高";
  problems: string[];
  suggestions: string[];
};

export type StoryQualityCheck = {
  id: string;
  label: string;
  score: number;
  status: "通过" | "注意" | "高风险";
  evidence: string;
  fix: string;
  relatedScenes: number[];
};

export type StoryQualityReport = {
  overallScore: number;
  publishReadiness: "可进入精修" | "需要重点修改" | "暂不建议发布";
  summary: string;
  checks: StoryQualityCheck[];
  guardrails: string[];
};

export type StoryOriginalityCheck = {
  id: string;
  label: string;
  riskLevel: "低" | "中" | "高";
  evidence: string;
  learnFrom: string;
  avoidCopy: string;
  rewriteAction: string;
  relatedScenes: number[];
};

export type StoryOriginalityReport = {
  originalityScore: number;
  riskLevel: "低" | "中" | "高";
  verdict: string;
  learningPoints: string[];
  avoidCopyPoints: string[];
  rewriteActions: string[];
  checks: StoryOriginalityCheck[];
};

export type StoryCharacterMemory = {
  characterId: string;
  name: string;
  role: string;
  currentState: string;
  relationshipShift: string;
  nextUse: string;
};

export type StoryForeshadowMemory = {
  id: string;
  clue: string;
  plantedInScenes: number[];
  payoffInScenes: number[];
  status: "待回收" | "已回收";
  note: string;
};

export type StorySceneMemory = {
  sceneId: string;
  index: number;
  title: string;
  emotionalState: string;
  characterState: string;
  relationshipChange: string;
  plantedForeshadows: string[];
  paidForeshadows: string[];
  nextContinuityNote: string;
};

export type StoryContinuityMemory = {
  summary: string;
  characterMemories: StoryCharacterMemory[];
  foreshadowMemories: StoryForeshadowMemory[];
  sceneMemories: StorySceneMemory[];
  nextWritingNotes: string[];
};

export type WritingMemory = {
  id: string;
  sourceType: "user_feedback" | "review" | "platform_result" | "manual_rule" | "reader_report";
  genre: string;
  rule: string;
  positiveExample: string;
  negativeExample: string;
  confidence: number;
  relatedWorkIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonalStrategy = {
  id: string;
  sourceType: "review" | "platform_result" | "manual_rule" | "editor_feedback";
  genre: string;
  rule: string;
  evidence: string;
  action: string;
  confidence: number;
  relatedWorkIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentTraceStep = {
  id: string;
  order: number;
  agent: string;
  role: string;
  input: string;
  output: string;
  handoff: string;
  status: "done" | "waiting";
};

export type StoryLearningEvidence = {
  id: string;
  sourceType: "user_requirement" | "platform_trend" | "user_authorized_data" | "review_memory" | "review_strategy" | "writing_memory" | "personal_strategy";
  title: string;
  detail: string;
  confidence: number;
  weight?: number;
  weightLabel?: string;
  sourceLabel?: string;
  qualityLabel?: string;
  qualityNotes?: string[];
};

export type StoryStageInfluence = {
  stage: string;
  sourceTypes: StoryLearningEvidence["sourceType"][];
  evidenceIds: string[];
  summary: string;
};

export type StoryLearningBasis = {
  sourceSummary: string;
  evidenceCards: StoryLearningEvidence[];
  stageInfluences?: StoryStageInfluence[];
  mustApply: string[];
  avoid: string[];
  structureSuggestion: string[];
  generationReason: string;
};

export type StoryPlan = {
  id: string;
  title: string;
  providerMode?: AiProviderMode;
  providerNotice?: string;
  memoryUsed?: string[];
  learningBasis?: StoryLearningBasis;
  source: string;
  platform: string;
  genre: string;
  topicJudgement: string;
  topicCards: TopicCard[];
  selectedTopic: TopicCard;
  emotionalCurve: EmotionalBeat[];
  conflictLadder: ConflictStep[];
  informationGap: InformationGap;
  characters: CharacterCard[];
  sceneCards: SceneCard[];
  scenePrompts: ScenePrompt[];
  sceneDrafts: SceneDraft[];
  synopsis: string;
  tags: string[];
  draft: string;
  readerReport: ReaderReport;
  qualityReport?: StoryQualityReport;
  originalityReport?: StoryOriginalityReport;
  continuityMemory?: StoryContinuityMemory;
  agentSteps: string[];
  agentTrace?: AgentTraceStep[];
};

export type SavedInspiration = {
  id: string;
  text: string;
  platform: string;
  genre: string;
  emotion: string;
  length: string;
  ending: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
};

export type AutoWritingPreset = {
  id: string;
  name: string;
  platform: string;
  genre: string;
  length: string;
  emotion: string;
  protagonist: string;
  ending: string;
  style: string;
  mode: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type WritingAssetLibrary = {
  inspirations: SavedInspiration[];
  presets: AutoWritingPreset[];
};

export type RewriteSuggestion = {
  markId: string;
  providerMode?: AiProviderMode;
  providerNotice?: string;
  understanding: string;
  strategy: string;
  newText: string;
  changeNotes: string;
  memoryImpact: string[];
};

export type EditorMarkRecord = {
  id: string;
  workId: string;
  label: string;
  index: number;
  type: MarkType;
  selectedText: string;
  comment: string;
  startOffset: number;
  endOffset: number;
  persisted: boolean;
  createdAt: string;
};

export type EditorVersionRecord = {
  id: string;
  workId: string;
  markId: string;
  markLabel: string;
  originalText: string;
  newText: string;
  reason: string;
  impactNotes: string[];
  persisted: boolean;
  createdAt: string;
};

export type RewriteMemorySummary = {
  requested: boolean;
  created: number;
  skipped: number;
  rules: string[];
  skippedRules: string[];
  persisted: boolean;
  message: string;
};

export type RewriteDiffSummary = {
  originalLength: number;
  newLength: number;
  delta: number;
  changed: boolean;
};

export type ApplyRewriteResult = {
  version: EditorVersionRecord;
  memory: RewriteMemorySummary;
  diff: RewriteDiffSummary;
  message: string;
};

export type ReviewReportResult = {
  id: string;
  workId: string;
  performanceMetrics?: {
    readCount: number;
    subscriptionCount?: number;
    revenue: number;
    completionRate: number;
    rankingChange?: string;
    recommendationChange?: string;
    commentFeedback?: string;
  };
  contentDiagnostics?: Array<{
    label: string;
    score: number;
    judgement: string;
    evidence: string;
    action: string;
  }>;
  performanceSummary: string;
  strengths: string[];
  weaknesses: string[];
  nextWritingAdvice: string[];
  strategyLessons: string[];
  persisted: boolean;
  createdAt: string;
};

export type WorkspaceExportResult = {
  workId: string;
  title: string;
  path: string;
  files: string[];
  persisted: boolean;
  message: string;
};

export type DatasourceType = "public_page" | "csv" | "screenshot" | "manual";

export type DatasourceRecord = {
  id: string;
  name: string;
  type: DatasourceType;
  enabled: boolean;
  frequency: string;
  sourceDetail?: string;
  note?: string;
  persisted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrawlerJobStatus = "success" | "waiting" | "failed" | "running";

export type CrawlerJobRecord = {
  id: string;
  datasourceId?: string;
  name: string;
  type: DatasourceType | "public_rank";
  status: CrawlerJobStatus;
  lastRunAt: string;
  successCount: number;
  failureReason: string;
  sourceDetail?: string;
  persisted: boolean;
  createdAt: string;
};

export type DatasourceLearningResult = {
  memoriesCreated: number;
  strategiesCreated: number;
  summary: string;
  memoryRules: string[];
  strategyRules: string[];
};

export type CsvImportResult = {
  datasource: DatasourceRecord;
  job: CrawlerJobRecord;
  parsedRows: number;
  trendsCreated: number;
  worksUpdated: number;
  worksCreated: number;
  learningCreated?: DatasourceLearningResult;
  persisted: boolean;
  queueMode?: "redis" | "direct";
  queueJobId?: string;
  message: string;
};

export type ScreenshotImportResult = CsvImportResult & {
  storedPath: string;
  originalName: string;
  sizeBytes: number;
  recognizedText?: string;
  ocrProviderMode?: AiProviderMode;
  ocrNotice?: string;
};

export type AuthorizedCaptureMode = "visible_text" | "screenshot" | "waiting";

export type AuthorizedCaptureResult = CsvImportResult & {
  captureMode: AuthorizedCaptureMode;
  pageUrl?: string;
  nextStep?: string;
};

export type BrowserCaptureSession = {
  id: string;
  datasourceId?: string;
  jobId: string;
  pageUrl: string;
  platform: string;
  status: CrawlerJobStatus;
  lastMessage: string;
  nextStep?: string;
  persisted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BrowserCaptureSessionResult = {
  session: BrowserCaptureSession;
  capture?: AuthorizedCaptureResult;
  message: string;
  nextStep?: string;
};

export type BrowserCaptureExecutorResult = BrowserCaptureSessionResult & {
  executorAvailable: boolean;
  opened: boolean;
  pageUrl: string;
  visibleTextLength: number;
  visibleText?: string;
  visibleTextPreview?: string;
  capturedAt?: string;
};

export type KnowledgeChunk = {
  id: string;
  sourceType: "memory" | "strategy";
  sourceId: string;
  genre: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackupExportResult = {
  id: string;
  fileName: string;
  path: string;
  createdAt: string;
  counts: {
    works: number;
    trends: number;
    memories: number;
    strategies: number;
    knowledgeChunks: number;
    writingAssets: number;
    datasources: number;
    crawlerJobs: number;
    reviews: number;
    marks: number;
    versions: number;
  };
  message: string;
};

export type BackupListItem = BackupExportResult & {
  sizeBytes: number;
};

export type BackupRestoreResult = {
  fileName: string;
  path: string;
  restored: boolean;
  counts: BackupExportResult["counts"];
  message: string;
};

export type LocalCleanupResult = {
  cleaned: boolean;
  backupFileName?: string;
  backupPath?: string;
  counts: BackupExportResult["counts"] & {
    screenshots: number;
  };
  message: string;
};

export type LocalResetResult = {
  reset: boolean;
  backupFileName?: string;
  backupPath?: string;
  counts: BackupExportResult["counts"] & {
    screenshots: number;
  };
  starterCounts: BackupExportResult["counts"];
  message: string;
};

export type LocalMaintenanceResult = {
  cleaned: boolean;
  dryRun: boolean;
  action: "cache" | "logs";
  items: {
    label: string;
    path: string;
    fileCount: number;
    sizeBytes: number;
  }[];
  totalFiles: number;
  totalBytes: number;
  message: string;
};
