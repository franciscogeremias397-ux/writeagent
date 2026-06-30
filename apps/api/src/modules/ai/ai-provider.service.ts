import { Injectable } from "@nestjs/common";
import {
  createAgentTrace,
  enforceStoryWorkflow,
  generateStoryPlan,
  generateStoryOutlineMock,
  reviseSceneDraft,
  rewriteMarkedText,
  validateStoryWorkflow,
  type FullDraftAiResult,
  type FullDraftInput,
  type GeneratePlanInput,
  type AiProviderMode,
  type ReviseSceneDraftInput,
  type SceneDraftRevision,
  type RewriteSuggestion,
  type StoryOutlineInput,
  type StoryOutlineResult,
  type StoryPlan
} from "@shenbi/shared";
import {
  fullDraftContinuityCheckJsonSchema,
  fullDraftBlueprintJsonSchema,
  rewriteJsonSchema,
  sceneDraftRevisionJsonSchema,
  storyOutlineJsonSchema,
  storyPlanJsonSchema
} from "./openai-schemas.js";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type OpenAIRequest = {
  model: string;
  input:
    | string
    | Array<{
        role: "user" | "system" | "developer";
        content: Array<
          | {
              type: "input_text";
              text: string;
            }
          | {
              type: "input_image";
              image_url: string;
              detail: "low" | "high" | "auto";
            }
        >;
      }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      schema: unknown;
      strict: boolean;
    };
  };
  max_output_tokens?: number;
};

type ChatCompletionRequest = {
  model: string;
  messages: Array<{
    role: "user" | "system";
    content:
      | string
      | Array<
          | {
              type: "text";
              text: string;
            }
          | {
              type: "image_url";
              image_url: {
                url: string;
                detail?: "low" | "high" | "auto";
              };
            }
        >;
  }>;
  response_format?: {
    type: "json_object";
  };
  thinking?: {
    type: "enabled" | "disabled";
    reasoning_effort?: "high" | "max";
  };
  temperature?: number;
  max_tokens?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type ProviderId = "openai" | "kimi" | "deepseek";

type ProviderConfig = {
  id: ProviderId;
  label: string;
  apiKeyEnv: string;
  textModelEnv: string;
  outlineModelEnv?: string;
  baseUrlEnv: string;
  defaultTextModel: string;
  defaultOutlineModel?: string;
  defaultBaseUrl: string;
  endpoint: "responses" | "chat_completions";
  supportsVision: boolean;
};

type StructuredOutputOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  modelName?: string;
};

export type FullDraftBlueprintSection = {
  index: number;
  title: string;
  goal: string;
  context: string;
  openingHook: string;
  readerQuestion: string;
  conflictUpgrade: string;
  informationReveal: string;
  mustInclude: string[];
  avoid: string[];
  turningPoint: string;
  endingHook: string;
  wordTarget: number;
};

export type FullDraftBlueprint = {
  title: string;
  genre: string;
  tags: string[];
  summary: string;
  marketSummary: string;
  qualitySummary: string;
  internalPlan: string;
  sections: FullDraftBlueprintSection[];
};

export type FullDraftSectionResult = {
  index: number;
  title: string;
  text: string;
  revisionNote: string;
};

export type FullDraftStoryState = {
  currentSummary: string;
  completedEvents: string[];
  revealedInformation: string[];
  protagonistKnows: string[];
  readerKnows: string[];
  antagonistKnows: string[];
  openForeshadows: string[];
  resolvedForeshadows: string[];
  characterStates: string[];
  timeline: string[];
  toneAndPacing: string;
  nextContinuityNotes: string[];
};

export type FullDraftStoryStatePatch = {
  currentSummary: string;
  completedEvents: string[];
  revealedInformation: string[];
  protagonistKnows: string[];
  readerKnows: string[];
  antagonistKnows: string[];
  openForeshadows: string[];
  resolvedForeshadows: string[];
  characterStates: string[];
  timeline: string[];
  toneAndPacing: string;
  nextContinuityNotes: string[];
};

export type FullDraftContinuityCheck = {
  ok: boolean;
  rewriteRequired: boolean;
  issues: string[];
  continuityNotes: string[];
  suggestedFix: string;
  statePatch: FullDraftStoryStatePatch;
};

export type FullDraftGenerationMetrics = {
  continuations: number;
  rewrites: number;
  continuityChecks: number;
  qualityLog: string[];
};

export type FullDraftGenerationCheckpoint = {
  blueprint: FullDraftBlueprint;
  sections: FullDraftSectionResult[];
  storyState: FullDraftStoryState;
  continuityNotes: string[];
  metrics: FullDraftGenerationMetrics;
  updatedAt: string;
};

export type FullDraftGenerationProgress = {
  stage: "starting" | "blueprint" | "section" | "continuity" | "saving" | "completed";
  progressLabel: string;
  detail: string;
  completedSections: number;
  totalSections: number;
  currentSectionTitle?: string;
  wordCount: number;
  checkpoint: FullDraftGenerationCheckpoint;
};

export type FullDraftGenerationOptions = {
  resumeCheckpoint?: FullDraftGenerationCheckpoint;
  onProgress?: (progress: FullDraftGenerationProgress) => void | Promise<void>;
};

const AI_PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    textModelEnv: "OPENAI_TEXT_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultTextModel: "gpt-5.2",
    defaultBaseUrl: "https://api.openai.com/v1",
    endpoint: "responses",
    supportsVision: true
  },
  kimi: {
    id: "kimi",
    label: "Kimi",
    apiKeyEnv: "MOONSHOT_API_KEY",
    textModelEnv: "KIMI_TEXT_MODEL",
    outlineModelEnv: "KIMI_OUTLINE_MODEL",
    baseUrlEnv: "KIMI_BASE_URL",
    defaultTextModel: "kimi-k2.6",
    defaultOutlineModel: "moonshot-v1-8k",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    endpoint: "chat_completions",
    supportsVision: true
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    textModelEnv: "DEEPSEEK_TEXT_MODEL",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultTextModel: "deepseek-v4-flash",
    defaultBaseUrl: "https://api.deepseek.com",
    endpoint: "chat_completions",
    supportsVision: false
  }
};

const WRITING_PROMPT_VERSION = "v2-market-editor-2026-06-23-b";

const AI_CLICHE_PATTERNS = [
  /命运的齿轮/u,
  /她没想到的是/u,
  /他没想到的是/u,
  /殊不知/u,
  /这一刻[，,]?她明白/u,
  /这一刻[，,]?他明白/u,
  /内心深处/u,
  /眼神坚定/u,
  /泪水模糊/u,
  /仿佛整个世界/u,
  /故事才刚刚开始/u,
  /属于她的/u,
  /重新找回了自己/u
];

const GENERIC_OUTLINE_PATTERNS = [
  /平凡的/u,
  /精心策划/u,
  /一场报复/u,
  /情感纠葛/u,
  /人性的多面/u,
  /深刻反思/u,
  /真相大白/u,
  /真实身份/u,
  /陌生女[子人]/u,
  /赢得[了]?自己应得/u,
  /面临选择/u,
  /共同面对/u,
  /情感转变/u,
  /情感回收/u,
  /情感释放/u,
  /社会共鸣/u,
  /情感冲击/u,
  /解开谜团/u,
  /成为核心冲突/u,
  /无法回头/u,
  /意外反转/u,
  /以其人之道/u
];

const CONCRETE_STORY_MATERIAL_PATTERN =
  /病历|账单|录音|门禁|合同|旧手机|聊天|截图|遗嘱|监控|钥匙|发票|缴费单|快递|照片|录取|诊断|转账|保单|工牌|时间差|借条|离婚协议|亲子鉴定|孕检|住院单|银行卡|名单|结婚证|报警回执|调解书|U盘|优盘|SD卡|纸条|签名|指纹|流水|账户|印章|摄像头|票据|快递单|通话记录|录音笔|门牌|收据|证明|档案|病例|判决|律师函|登记表/u;

const STORY_AGENT_INSTRUCTIONS = `
你是「神笔马良短篇小说 Agent」的写作内核。
请为中国短篇小说平台创作者生成原创短篇方案。
必须遵守：
1. 不复制任何已有作品原文、桥段和人物名。
2. 不生成规避平台检测、绕过审核、洗稿等内容。
3. 主控 Agent 不直接黑盒写全文，要体现选题卡、情绪曲线、冲突阶梯、信息差、场景卡、测试读者评审。
4. 每张场景卡都必须配一条可执行的 scenePrompts，供用户单独扩写或重写该场景。
5. 每张场景卡都必须生成一条 sceneDrafts，包含该场正文、质量分、读者提醒和下一轮修改重点。
6. 必须按这个顺序工作：选题卡 → 情绪曲线 → 冲突阶梯 → 信息差 → 人物卡 → 场景卡 → 场景提示词 → 分场正文 → 测试读者评审 → 修改建议。
7. 短篇默认 5-8 张场景卡，正文草稿按场景分段，draft 要由 sceneDrafts 合并而来，不能另写一版和分场正文不一致的全文。
8. 风格偏黑白极简产品里的专业创作助手，输出要具体、可执行、适合编辑继续改。
9. 如果用户输入里有 memoryHints 或 strategyHints，请把它们当成用户个人写作偏好和复盘经验，只学习原则，不复用原文。
`;

const FULL_DRAFT_BLUEPRINT_INSTRUCTIONS = `
你是「神笔马良 V2」的后台市场主编，只做内部拆稿，不写正文，不输出给用户看的过程文档。

工作目标：把用户确认的故事方案拆成能让正文主笔直接开写的短篇蓝图。蓝图必须服务平台数据：开头点击欲、前 300 字留存、持续冲突、信息推进、情绪升级、结尾回收。

拆稿原则：
- approvedOutline 是最高创作约束，不能换故事、换主角、换核心冲突。
- 每个分段都必须有明确的读者问题：读者读完本段前必须想知道什么。
- 每个分段都必须推进一件实事：新证据、新行动、新对抗、新代价、新关系变化或新信息揭露。
- 强冲突必须有现实逻辑，不能靠降智、巧合、空喊和无意义狗血。
- 不要沿用旧十步结构，不要输出选题卡、场景卡、测试读者报告等标题。
- 不要要求用户补充信息；信息不足时，按更可能获得短篇平台反馈的方向自行决策。

每个 sections 条目必须像给写手的执行单：
- openingHook：本段开头第一个可写事件，不是概念。
- readerQuestion：本段制造或延续的读者疑问。
- conflictUpgrade：本段冲突如何升级。
- informationReveal：本段揭露或埋下的关键信息。
- mustInclude：必须出现的具体动作、物件、证据或对话材料。
- avoid：本段禁写内容，例如大段回忆、空泛抒情、解释设定、重复上段。
- turningPoint：本段中后部局势变化。
- endingHook：本段最后让读者继续读的钩子。

JSON 输出格式示例：
{
  "title": "缴费单背面的录音编号",
  "genre": "现实情感反转",
  "tags": ["债务", "证据链", "反转"],
  "summary": "女主从一张异常借条追到父亲遗物里的录音编号。",
  "marketSummary": "用债务压迫开局，用证据链推进中段，用现实反制收尾。",
  "qualitySummary": "每段都有新行动和新证据，避免原地争吵。",
  "internalPlan": "先压迫，再取证，再对抗，再回收。",
  "sections": [
    {
      "index": 1,
      "title": "银行门口的借条",
      "goal": "用催债事件把主角逼入行动。",
      "context": "故事开场。",
      "openingHook": "催债人把借条拍在女主面前。",
      "readerQuestion": "这张借条是谁签的？",
      "conflictUpgrade": "丈夫要求她先认债。",
      "informationReveal": "借条日期和父亲住院日期冲突。",
      "mustInclude": ["借条日期", "银行门口", "丈夫催促认债"],
      "avoid": ["解释完整家史", "大段哭诉"],
      "turningPoint": "女主发现日期不对。",
      "endingHook": "她在父亲遗物里看到同一天的缴费单。",
      "wordTarget": 1200
    }
  ]
}

请严格返回 JSON。
`;

const STORY_OUTLINE_INSTRUCTIONS = `
你是「神笔马良 V2」的市场选题主编，负责给中国短篇小说平台创作者生成可确认的故事方案。

你不是文学评论者，也不是流程展示助手。你的目标是判断一个故事承诺是否更可能让读者点击、读下去、看到结尾。

方案必须同时回答后台问题：
- 这是什么平台赛道，读者为什么会点开。
- 前 300 字靠什么异常、代价、冲突或悬念留人。
- 主角处境是否具体，压力是否足够快。
- 中段靠什么证据、秘密、误会、关系变化或行动推进。
- 结尾给读者什么情绪回收、反转、爽点或痛感。
- 全自动默认选择更容易获得数据反馈的强冲突方向，不写温吞和解、善意隐瞒、共同面对秘密、开放式选择。

输出给用户必须极简：
- title：像平台短篇标题，具体、有钩子，避免文艺空泛。
- direction：清楚的赛道/方向，例如“现实情感反转”“悬疑反转”“女性成长强冲突”。
- outline：500 个汉字以内，讲清是什么故事，不写正文，不写流程。
- highlights：2 到 4 条，只写创作亮点和可卖点。
- marketReason：一句话说明为什么适合当前短篇平台读者。

如果输入里有 previousOutlines，说明用户不满意旧方案；新方案必须在主角处境、核心冲突、反转机制上明显不同。
不要输出选题卡、情绪曲线、冲突阶梯、信息差、人物卡、场景卡、测试读者报告等旧流程词。
不要写“平凡的女性”“精心策划一场报复”“情感纠葛”“人性的多面性”“深刻反思”“真相大白”“无法回头”等模板表达。
不要写“陌生人的真实身份”“赢得自己应得的一切”“给予情感释放”“社会共鸣”等空泛结果，必须写清具体反转机制和反制动作。
不要写“丈夫其实有苦衷”“女主面临选择”“二人共同面对秘密”这类软冲突，除非用户明确要求。
必须用具体处境、具体证据或具体物件承载卖点，例如病历、账单、录音、门禁记录、合同、旧手机、聊天截图、遗嘱、监控时间差。
不得复制已有作品原文、人物名或受版权保护的表达。不得生成低质洗稿、擦边或规避审核内容。
JSON 输出格式示例：
{
  "title": "缴费单背面的录音编号",
  "direction": "现实情感反转",
  "outline": "女主在银行门口被催债人堵住，对方拿出一张她从没签过的借条。她回家翻父亲遗物，发现旧缴费单背面写着一串录音编号，录音里藏着丈夫和保险业务员合谋转移赔偿金的证据。她一边稳住催债，一边去法律援助中心调取流水，最后用录音和转账记录反制对方。",
  "highlights": ["银行门口催债开场，前 300 字直接给压力", "缴费单、录音编号、流水单形成证据链"],
  "marketReason": "用现实压力和可验证证据推进反转，适合短篇平台的点击和留存。"
}
请严格返回 JSON。
`;

const FULL_DRAFT_SECTION_INSTRUCTIONS = `
你是「神笔马良 V2」的 Kimi 正文主笔，专写中国平台短篇小说正文。

你只写当前分段的连续小说正文。不要写标题、列表、分析、解释、章节编号、创作说明、JSON 或 AI 话术。

正文目标：
- 像真实可编辑的短篇正文，不像大纲扩写。
- 前 300 字必须发生具体事件，不能用背景介绍拖开头。
- 每 600 到 800 字必须有一次有效推进：行动、对抗、证据、信息揭露、代价或关系变化。
- 多写具体动作、物件、证据、地点、对话和细节；少写抽象情绪、人生感悟和总结。
- 对话要带目的：试探、遮掩、威胁、求证、反击或露馅。
- 段尾必须留下继续读的动力：新问题、新证据、新威胁、新选择或情绪落点。
- 字数目标是硬约束：宁可少写一点，也不要超长；超出时删掉解释、回忆、心理独白、重复对话和旁支人物。
- 每段只围绕一个主场景推进，不能在同一段里连续展开多个新地点或新支线。
- mustInclude 不是参考词，而是必须落成场面的材料；如果蓝图材料偏抽象，要转成可触摸、可验证、可展示给别人看的具体物件或记录。

禁写：
- 不要输出“市场判断”“自检摘要”“以下是正文”等非小说内容。
- 不要写“命运的齿轮”“她没想到的是”“殊不知”“这一刻她明白了”“眼神坚定”“泪水模糊”等 AI 套话。
- 不要大段回忆，不要解释设定，不要空泛抒情，不要让角色突然降智。
- 不得复制已有作品原文、人物名或受版权保护的表达；不得输出绕过审核、登录、验证码或检测的内容。

请直接输出小说正文纯文本。
`;

const FULL_DRAFT_SECTION_CONTINUATION_INSTRUCTIONS = `
你是「神笔马良 V2」的 Kimi 正文补写主笔。

任务：当前分段偏短，你只能从“当前已写正文”的最后一句之后继续写，补足本段缺失的小说正文。

硬性规则：
- 只输出续写正文纯文本，不要标题、列表、解释、JSON、创作说明。
- 不重复已写正文，不重启场景，不改设定。
- 继续推进当前分段的行动、证据、对抗、信息揭露或情绪代价。
- 续写最后必须自然停在本段钩子或阶段性转折上。
`;

const FULL_DRAFT_SECTION_REWRITE_INSTRUCTIONS = `
你是「神笔马良 V2」的 Kimi 正文修复主笔。

任务：按连续性问题重写当前分段，仍然只写这一段小说正文。

硬性规则：
- 只输出重写后的小说正文纯文本，不要标题、列表、解释、JSON、创作说明。
- 不换故事，不换主角，不推翻已经完成的前文。
- 必须修复反馈里的连续性、短字数、重复、非小说内容或节奏问题。
- 保持上一段结尾之后的自然承接。
- 如果反馈要求压缩，必须重写为更短版本，不要在原文基础上补写。
- 压缩优先级：保留证据、动作、对抗、反转和段尾钩子；删除背景说明、心理解释、重复争吵、过场动作和无新信息对话。
`;

const FULL_DRAFT_CONTINUITY_CHECK_INSTRUCTIONS = `
你是「神笔马良 V2」的 DeepSeek 连续性审稿助手。

你只做检查和状态更新，绝对不写小说正文，不续写正文，不替 Kimi 写正文。

检查目标：
- 当前分段是否承接前文，没有重启故事、换人设、跳时间、重复上一段结尾。
- 关键信息是否前后矛盾，证据链是否合理。
- 段内是否有真实行动、对抗、信息推进，而不是空泛总结。
- 是否需要让 Kimi 重写这一段。

返回 JSON：
{
  "ok": true,
  "rewriteRequired": false,
  "issues": [],
  "continuityNotes": ["下一段要记住的连续性要点"],
  "suggestedFix": "如果需要重写，给 Kimi 的修复方向；不能写正文。",
  "statePatch": {
    "currentSummary": "截至当前分段的简短故事状态",
    "completedEvents": ["已经发生的关键事件"],
    "revealedInformation": ["已经揭露的信息"],
    "protagonistKnows": ["主角已知"],
    "readerKnows": ["读者已知"],
    "antagonistKnows": ["对手已知"],
    "openForeshadows": ["仍未回收的伏笔"],
    "resolvedForeshadows": ["已回收的伏笔"],
    "characterStates": ["人物关系或状态变化"],
    "timeline": ["时间线节点"],
    "toneAndPacing": "当前节奏和情绪状态",
    "nextContinuityNotes": ["下一段必须承接的事项"]
  }
}

请严格返回 JSON。
`;

const REWRITE_AGENT_INSTRUCTIONS = `
你是「神笔马良短篇小说 Agent」里的编辑改稿 Agent。
你只改用户标记的片段，不扩写全篇。
请理解用户反馈，给出修改策略、新版片段、改动说明和可能影响的写作记忆。
不要提供规避检测、洗稿或复制他人作品的建议。
`;

const SCENE_REVISION_AGENT_INSTRUCTIONS = `
你是「神笔马良短篇小说 Agent」里的正文 Agent。
你只重写用户指定的单个场景，不改其他场景。
必须保留原场景的标题、场景编号、sceneId、主线目标和结尾钩子，只根据用户反馈强化本场正文。
输出要像可继续编辑的短篇正文，不要写解释性创作说明。
不要复制已有作品原文、不要洗稿、不要提供规避检测建议。
`;

const SCREENSHOT_OCR_INSTRUCTIONS = `
你是「神笔马良短篇小说 Agent」里的截图识别助手。
任务：读取用户上传的作者后台、榜单、数据表或评论截图，把可见文字尽量转写出来。
只做文字识别和整理，不要猜测看不清的数据，不要补造不存在的作品名、阅读量、收益、完读率或评论。
如果图片里有表格，请按“平台、作品名、题材、热度、阅读量、收益、完读率、收藏、评论反馈、评论关键词”这些字段尽量整理成多行文本。
如果看不清，请在 recognizedText 里写“图片文字不清晰，建议手动校正”。
`;

@Injectable()
export class AiProviderService {
  async generateStoryPlan(input: GeneratePlanInput): Promise<StoryPlan> {
    const mockPlan = generateStoryPlan(input);

    if (!this.canUseConfiguredAi()) {
      return mockPlan;
    }

    try {
      const provider = this.activeProvider();
      const prompt = `${STORY_AGENT_INSTRUCTIONS}

用户输入：
${JSON.stringify(input, null, 2)}

请严格返回 JSON，不要输出 JSON 之外的解释。`;

      const parsed = await this.createStructuredOutput<Omit<StoryPlan, "id" | "providerMode" | "providerNotice">>(
        prompt,
        "shenbi_story_plan",
        storyPlanJsonSchema
      );

      const enforcedPlan = enforceStoryWorkflow(
        {
          ...parsed,
          id: `plan-${Date.now()}`,
          providerMode: provider.id,
          providerNotice: `已使用真实 ${provider.label} 模型：${this.modelName()}`,
          memoryUsed: mockPlan.memoryUsed,
          learningBasis: mockPlan.learningBasis,
          sceneDrafts: parsed.sceneDrafts?.length ? parsed.sceneDrafts : mockPlan.sceneDrafts,
          agentTrace: createAgentTrace({
            source: parsed.source || mockPlan.source,
            platform: parsed.platform,
            genre: parsed.genre,
            topicCards: parsed.topicCards,
            selectedTopic: parsed.selectedTopic,
            emotionalCurve: parsed.emotionalCurve,
            conflictLadder: parsed.conflictLadder,
            informationGap: parsed.informationGap,
            characters: parsed.characters,
            sceneCards: parsed.sceneCards,
            scenePrompts: parsed.scenePrompts,
            sceneDrafts: parsed.sceneDrafts?.length ? parsed.sceneDrafts : mockPlan.sceneDrafts,
            readerReport: parsed.readerReport,
            learningBasis: mockPlan.learningBasis,
            memoryUsed: mockPlan.memoryUsed
          })
        },
        mockPlan
      );
      const workflowValidation = validateStoryWorkflow(enforcedPlan);

      if (!workflowValidation.ok) {
        throw new Error(`AI 分阶段结果不完整：${workflowValidation.problems.join("；")}`);
      }

      return {
        ...enforcedPlan,
        providerNotice: `已使用真实 ${provider.label} 模型：${this.modelName()}；结果已按选题卡→结构→场景→提示词→分场正文→测试读者的顺序校验。`
      };
    } catch (error) {
      return {
        ...mockPlan,
        providerMode: "fallback",
        providerNotice: `真实 AI 暂时没有返回可用结果，已自动切回本地模拟内核。原因：${this.errorMessage(error)}`
      };
    }
  }

  async generateFullDraft(input: FullDraftInput, options: FullDraftGenerationOptions = {}): Promise<FullDraftAiResult> {
    const proseProvider = this.primaryProseProvider();

    if (!proseProvider) {
      throw new Error("正式全文生成需要先配置 Kimi API Key；系统不会用 DeepSeek 或本地样稿替写正式正文。");
    }

    try {
      const blueprintProvider = this.blueprintProviderFor(proseProvider);

      return await this.generateFullDraftWithProviders(input, blueprintProvider, proseProvider, options);
    } catch (error) {
      throw new Error(`Kimi 正式全文生成失败，未保存任何替代正文。原因：${this.friendlyErrorMessage(error)}`);
    }
  }

  async generateStoryOutline(input: StoryOutlineInput): Promise<StoryOutlineResult> {
    const mockOutline = generateStoryOutlineMock(input);
    const proseProvider = this.primaryStoryProvider();

    if (!proseProvider) {
      return mockOutline;
    }

    try {
      const normalizedInput = this.normalizeStoryOutlineInput(input);
      const compactInput = this.compactStoryOutlineInput(normalizedInput);
      const outlineModel = this.storyOutlineModelName(proseProvider);
      const prompt = `${STORY_OUTLINE_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

用户输入：
${JSON.stringify(compactInput, null, 2)}

硬性要求：
- outline 必须控制在 500 个汉字以内。
- highlights 写 2 到 4 条，强调创作亮点，不写流程。
- direction 必须是清楚的赛道/方向，例如“现实情感反转”“悬疑反转”“女性成长强冲突”。
- 如果是全自动模式，不要向用户要更多信息，直接选择一个更可能有市场反馈的方向。
- 标题必须包含可感知的人、物、处境或异常，避免“逆风飞扬”“破茧成蝶”这类空泛题名。
- 大纲里必须出现：主角、开局压力、核心冲突、中段推进机制、结尾承诺。

请只返回 JSON 对象，不要输出 JSON 之外的解释。`;

      let parsed = await this.createStructuredOutputWithRetry<Omit<StoryOutlineResult, "providerMode" | "providerNotice" | "modelName">>(
        prompt,
        "shenbi_v2_story_outline",
        storyOutlineJsonSchema,
        proseProvider,
        {
          maxTokens: 1100,
          temperature: this.temperatureForProvider(proseProvider, outlineModel),
          modelName: outlineModel,
          timeoutMs: this.timeoutMsForStoryOutline(proseProvider)
        }
      );
      let normalized = this.normalizeStoryOutlineResult(parsed, normalizedInput);
      const outlineIssues = this.storyOutlineQualityIssues(normalized);

      if (outlineIssues.length) {
        parsed = await this.createStructuredOutputWithRetry<Omit<StoryOutlineResult, "providerMode" | "providerNotice" | "modelName">>(
          `${prompt}

上一次故事方案未通过质量闸门，必须重写。问题：
${outlineIssues.map((issue) => `- ${issue}`).join("\n")}

重写要求：
- 换掉空泛标题和空泛表达。
- 大纲里必须出现至少一个具体证据、物件、记录或行动。
- 结尾必须写出具体反制动作或具体代价回收，不要写“赢回一切”“真相大白”。
- 创作亮点必须是可写的场面卖点，不要写抽象价值判断。
`,
          "shenbi_v2_story_outline",
          storyOutlineJsonSchema,
          proseProvider,
          {
            maxTokens: 1100,
            temperature: this.temperatureForProvider(proseProvider, outlineModel),
            modelName: outlineModel,
            timeoutMs: this.timeoutMsForStoryOutline(proseProvider)
          }
        );
        normalized = this.normalizeStoryOutlineResult(parsed, normalizedInput);
      }

      return {
        ...normalized,
        providerMode: proseProvider.id,
        providerNotice: `已使用真实 ${proseProvider.label} 生成故事方案：${outlineModel}`,
        modelName: outlineModel
      };
    } catch (error) {
      return {
        ...mockOutline,
        providerMode: "fallback",
        providerNotice: `Kimi 这次没有返回可用方案，已先给出本地临时方案；你可以直接编辑后确认，或点“重新生成方案”再让 Kimi 试一次。原因：${this.friendlyErrorMessage(error)}`
      };
    }
  }

  async rewriteMarkedText(markId: string, selectedText: string, feedback: string): Promise<RewriteSuggestion> {
    const mockSuggestion = rewriteMarkedText(markId, selectedText, feedback);

    if (!this.canUseConfiguredAi()) {
      return mockSuggestion;
    }

    try {
      const provider = this.activeProvider();
      const prompt = `${REWRITE_AGENT_INSTRUCTIONS}

标记编号：${markId}
用户选中的原文：
${selectedText}

用户反馈：
${feedback}

请严格返回 JSON，不要输出 JSON 之外的解释。`;

      const parsed = await this.createStructuredOutput<Omit<RewriteSuggestion, "markId" | "providerMode" | "providerNotice">>(
        prompt,
        "shenbi_rewrite_suggestion",
        rewriteJsonSchema
      );

      return {
        markId,
        ...parsed,
        providerMode: provider.id,
        providerNotice: `已使用真实 ${provider.label} 模型：${this.modelName()}`
      };
    } catch (error) {
      return {
        ...mockSuggestion,
        providerMode: "fallback",
        providerNotice: `真实 AI 暂时没有返回可用改稿，已自动切回本地模拟内核。原因：${this.errorMessage(error)}`
      };
    }
  }

  async reviseSceneDraft(input: ReviseSceneDraftInput): Promise<SceneDraftRevision> {
    const mockRevision = reviseSceneDraft(input);

    if (!this.canUseConfiguredAi()) {
      return mockRevision;
    }

    try {
      const provider = this.activeProvider();
      const prompt = `${SCENE_REVISION_AGENT_INSTRUCTIONS}

当前场景正文：
${JSON.stringify(input.sceneDraft, null, 2)}

当前场景提示词：
${JSON.stringify(input.scenePrompt ?? null, null, 2)}

用户反馈：
${input.feedback ?? ""}

请严格返回 JSON，不要输出 JSON 之外的解释。`;

      const parsed = await this.createStructuredOutput<Omit<SceneDraftRevision, "providerMode" | "providerNotice">>(
        prompt,
        "shenbi_scene_draft_revision",
        sceneDraftRevisionJsonSchema
      );

      return {
        ...parsed,
        id: input.sceneDraft.id,
        sceneId: input.sceneDraft.sceneId,
        index: input.sceneDraft.index,
        title: input.sceneDraft.title,
        providerMode: provider.id,
        providerNotice: `已使用真实 ${provider.label} 模型：${this.modelName()}`
      };
    } catch (error) {
      return {
        ...mockRevision,
        providerMode: "fallback",
        providerNotice: `真实 AI 暂时没有返回可用单场重写，已自动切回本地模拟内核。原因：${this.errorMessage(error)}`
      };
    }
  }

  async extractScreenshotText(dataUrl: string): Promise<{
    providerMode: AiProviderMode;
    providerNotice: string;
    recognizedText: string;
  }> {
    if (!this.canUseConfiguredAi()) {
      return {
        providerMode: "mock",
        providerNotice: "还没有配置可用的真实 AI API Key，截图已保存，暂时需要手动填写截图文字。",
        recognizedText: ""
      };
    }

    try {
      const provider = this.activeProvider();

      if (!provider.supportsVision) {
        return {
          providerMode: "fallback",
          providerNotice: `${provider.label} 当前只用于文本写作；截图识别请切换到 Kimi/OpenAI，或手动校正截图文字。`,
          recognizedText: ""
        };
      }

      const parsed = await this.createStructuredOutput<{ recognizedText: string }>(
        [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${SCREENSHOT_OCR_INSTRUCTIONS}

请严格返回 JSON：{"recognizedText":"..."}。`
              },
              {
                type: "input_image",
                image_url: dataUrl,
                detail: "high"
              }
            ]
          }
        ],
        "shenbi_screenshot_ocr",
        {
          type: "object",
          additionalProperties: false,
          required: ["recognizedText"],
          properties: {
            recognizedText: { type: "string" }
          }
        }
      );

      return {
        providerMode: provider.id,
        providerNotice: `已使用真实 ${provider.label} 模型识别截图：${this.modelName()}`,
        recognizedText: parsed.recognizedText.trim()
      };
    } catch (error) {
      return {
        providerMode: "fallback",
        providerNotice: `截图自动识别暂时失败，已保留为等待校正。原因：${this.errorMessage(error)}`,
        recognizedText: ""
      };
    }
  }

  getStatus() {
    const provider = this.activeProvider();
    const hasApiKey = Boolean(this.apiKey());

    return {
      provider: provider.id,
      providerLabel: provider.label,
      mode: hasApiKey ? provider.id : "mock",
      model: this.modelName(),
      outlineModel: this.storyOutlineModelName(provider),
      baseUrl: this.baseUrl(),
      embeddingModel: this.embeddingModelName(),
      hasApiKey,
      apiKeyEnv: provider.apiKeyEnv,
      message: hasApiKey
        ? this.activeProviderMessage(provider)
        : `还没有检测到 ${provider.apiKeyEnv}，写作接口会使用本地模拟内核。`
    };
  }

  listProviders() {
    return Object.values(AI_PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      defaultTextModel: provider.defaultTextModel,
      defaultOutlineModel: provider.defaultOutlineModel,
      defaultBaseUrl: provider.defaultBaseUrl,
      apiKeyEnv: provider.apiKeyEnv,
      textModelEnv: provider.textModelEnv,
      outlineModelEnv: provider.outlineModelEnv,
      baseUrlEnv: provider.baseUrlEnv,
      supportsVision: provider.supportsVision
    }));
  }

  async testConnection() {
    if (!this.canUseConfiguredAi()) {
      return {
        ok: false,
        ...this.getStatus()
      };
    }

    try {
      const provider = this.activeProvider();
      const modelName = provider.id === "kimi" ? this.storyOutlineModelName(provider) : this.modelName(provider);
      const result = await this.createStructuredOutput<{ ok: boolean; message: string }>(
        "请返回 JSON：{\"ok\":true,\"message\":\"连接正常\"}",
        "shenbi_connection_test",
        {
          type: "object",
          additionalProperties: false,
          required: ["ok", "message"],
          properties: {
            ok: { type: "boolean" },
            message: { type: "string" }
          }
        },
        provider,
        {
          maxTokens: 200,
          modelName,
          temperature: this.temperatureForProvider(provider, modelName),
          timeoutMs: provider.id === "kimi" ? this.timeoutMsForStoryOutline(provider) : this.requestTimeoutMs()
        }
      );

      return {
        ok: true,
        ...this.getStatus(),
        response: result
      };
    } catch (error) {
      return {
        ok: false,
        ...this.getStatus(),
        error: this.errorMessage(error)
      };
    }
  }

  private async generateFullDraftWithProviders(
    input: FullDraftInput,
    blueprintProvider: ProviderConfig,
    proseProvider: ProviderConfig,
    options: FullDraftGenerationOptions = {}
  ): Promise<FullDraftAiResult> {
    const normalizedInput = this.normalizeFullDraftInput(input);
    const metrics = options.resumeCheckpoint?.metrics
      ? {
          continuations: options.resumeCheckpoint.metrics.continuations,
          rewrites: options.resumeCheckpoint.metrics.rewrites,
          continuityChecks: options.resumeCheckpoint.metrics.continuityChecks,
          qualityLog: [...options.resumeCheckpoint.metrics.qualityLog]
        }
      : this.emptyFullDraftMetrics();
    const blueprint = options.resumeCheckpoint?.blueprint ?? await this.createFullDraftBlueprint(normalizedInput, blueprintProvider);
    const sections: FullDraftSectionResult[] = options.resumeCheckpoint?.sections.map((section) => ({ ...section })) ?? [];
    let storyState = options.resumeCheckpoint?.storyState ?? this.initialFullDraftStoryState(blueprint, normalizedInput);
    const continuityNotes: string[] = [...(options.resumeCheckpoint?.continuityNotes ?? [])];

    await this.emitFullDraftProgress(options, {
      stage: "blueprint",
      progressLabel: sections.length ? "正在继续生成" : "分段蓝图已完成",
      detail: sections.length
        ? `已恢复到第 ${sections.length}/${blueprint.sections.length} 段，Kimi 将继续写下一段。`
        : `已拆成 ${blueprint.sections.length} 个正文分段，准备由 Kimi K2.6 写正文。`,
      completedSections: sections.length,
      totalSections: blueprint.sections.length,
      currentSectionTitle: blueprint.sections[sections.length]?.title,
      wordCount: this.countReadableText(this.composeFullDraftContent(sections)),
      checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
    });

    for (const section of blueprint.sections.slice(sections.length)) {
      const currentWordCount = this.countReadableText(this.composeFullDraftContent(sections));
      const activeSection = this.sectionForRemainingTarget(normalizedInput, section, sections.length, blueprint.sections.length, currentWordCount);
      const previousText = sections.length ? sections[sections.length - 1].text.slice(-900) : "";
      await this.emitFullDraftProgress(options, {
        stage: "section",
        progressLabel: `正在写正文 ${sections.length + 1}/${blueprint.sections.length}`,
        detail: `Kimi K2.6 正在写「${activeSection.title}」，本段目标约 ${activeSection.wordTarget} 字。`,
        completedSections: sections.length,
        totalSections: blueprint.sections.length,
        currentSectionTitle: activeSection.title,
        wordCount: currentWordCount,
        checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
      });
      let result = await this.createFullDraftSection(normalizedInput, blueprint, activeSection, previousText, storyState, proseProvider);
      result = await this.ensureFullDraftSectionLength(normalizedInput, blueprint, activeSection, previousText, storyState, result, proseProvider, metrics);
      result = await this.refineFullDraftSectionQuality(
        normalizedInput,
        blueprint,
        activeSection,
        previousText,
        storyState,
        result,
        proseProvider,
        metrics
      );
      const qualityIssues = this.fullDraftSectionQualityIssues(result, activeSection, previousText, blueprint.sections.length);

      if (qualityIssues.length) {
        result = {
          ...result,
          revisionNote: `${result.revisionNote} 质量闸门提醒：${qualityIssues.join("；")}`
        };
        this.recordFullDraftQualityLog(metrics, `第 ${activeSection.index} 段最终仍有提醒：${qualityIssues.join("；")}`);
      }

      await this.emitFullDraftProgress(options, {
        stage: "continuity",
        progressLabel: `正在检查连续性 ${sections.length + 1}/${blueprint.sections.length}`,
        detail: `正在检查「${activeSection.title}」是否接得上前文。`,
        completedSections: sections.length,
        totalSections: blueprint.sections.length,
        currentSectionTitle: activeSection.title,
        wordCount: this.countReadableText(this.composeFullDraftContent([...sections, result])),
        checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
      });
      metrics.continuityChecks += 1;
      const continuityCheck = await this.checkFullDraftContinuity(normalizedInput, blueprint, activeSection, previousText, storyState, result);

      if (continuityCheck.continuityNotes.length) {
        continuityNotes.push(...continuityCheck.continuityNotes.map((note) => `第 ${activeSection.index} 段：${note}`));
      }

      if (continuityCheck.rewriteRequired) {
        const fixFeedback = [
          ...continuityCheck.issues.map((issue) => `- ${issue}`),
          continuityCheck.suggestedFix ? `- 修复方向：${continuityCheck.suggestedFix}` : ""
        ].filter(Boolean).join("\n");
        this.recordFullDraftRewrite(metrics, `第 ${activeSection.index} 段连续性重写：${continuityCheck.issues.join("；") || continuityCheck.suggestedFix}`);

        result = await this.rewriteFullDraftSectionWithFeedback(
          normalizedInput,
          blueprint,
          activeSection,
          previousText,
          storyState,
          result,
          proseProvider,
          fixFeedback
        );
        result = await this.ensureFullDraftSectionLength(normalizedInput, blueprint, activeSection, previousText, storyState, result, proseProvider, metrics);
        metrics.continuityChecks += 1;
        const repairedCheck = await this.checkFullDraftContinuity(normalizedInput, blueprint, activeSection, previousText, storyState, result);

        if (repairedCheck.continuityNotes.length) {
          continuityNotes.push(...repairedCheck.continuityNotes.map((note) => `第 ${activeSection.index} 段修复后：${note}`));
        }

        if (repairedCheck.rewriteRequired || repairedCheck.issues.length) {
          result = {
            ...result,
            revisionNote: `${result.revisionNote} 连续性提醒：${repairedCheck.issues.join("；") || repairedCheck.suggestedFix}`
          };
          this.recordFullDraftQualityLog(metrics, `第 ${activeSection.index} 段修复后连续性提醒：${repairedCheck.issues.join("；") || repairedCheck.suggestedFix}`);
        }

        storyState = this.mergeFullDraftStoryState(storyState, repairedCheck.statePatch);
      } else {
        storyState = this.mergeFullDraftStoryState(storyState, continuityCheck.statePatch);
      }

      sections.push(result);
      await this.emitFullDraftProgress(options, {
        stage: "section",
        progressLabel: `已完成正文 ${sections.length}/${blueprint.sections.length}`,
        detail: `「${activeSection.title}」已写完，当前约 ${this.countReadableText(this.composeFullDraftContent(sections))} 字。`,
        completedSections: sections.length,
        totalSections: blueprint.sections.length,
        currentSectionTitle: activeSection.title,
        wordCount: this.countReadableText(this.composeFullDraftContent(sections)),
        checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
      });
    }

    await this.ensureFullDraftTotalLength(normalizedInput, blueprint, sections, storyState, continuityNotes, metrics, proseProvider, options);

    await this.emitFullDraftProgress(options, {
      stage: "saving",
      progressLabel: "正在整理正文",
      detail: "所有分段已完成，正在整理成可保存正文。",
      completedSections: sections.length,
      totalSections: blueprint.sections.length,
      wordCount: this.countReadableText(this.composeFullDraftContent(sections)),
      checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
    });

    const normalized = this.normalizeFullDraftResult({
      title: blueprint.title,
      content: this.composeFullDraftContent(sections),
      genre: blueprint.genre,
      tags: blueprint.tags,
      summary: blueprint.summary,
      marketSummary: blueprint.marketSummary,
      qualitySummary: blueprint.qualitySummary,
      internalPlan: `${blueprint.internalPlan}\n提示词版本：${WRITING_PROMPT_VERSION}\n正文路由：Kimi K2.6 分段主笔；DeepSeek 仅做市场蓝图和连续性检查，不写正文。\n最终故事状态：${storyState.currentSummary}`,
      revisionNotes: [...sections.map((section) => section.revisionNote).filter(Boolean), ...continuityNotes].slice(0, 12)
    });
    const readableTextCount = this.countReadableText(normalized.content);
    const minimumTextCount = this.minimumReadableTextForTarget(input);

    if (readableTextCount < minimumTextCount) {
      throw new Error(`真实 AI 返回的正文过短（约 ${readableTextCount} 字），没有形成可用短篇。`);
    }

    return {
      ...normalized,
      providerMode: proseProvider.id,
      providerNotice:
        blueprintProvider.id === proseProvider.id
          ? `正式正文已由 ${proseProvider.label} ${this.modelName(proseProvider)} 分段生成；未使用 DeepSeek 或本地样稿替写正文。`
          : `已由 ${blueprintProvider.label} 做市场蓝图辅助和连续性检查，正式正文由 ${proseProvider.label} ${this.modelName(proseProvider)} 分段主笔。`,
      modelName:
        blueprintProvider.id === proseProvider.id
          ? this.modelName(proseProvider)
          : `${blueprintProvider.label} ${this.modelName(blueprintProvider)} + ${proseProvider.label} ${this.modelName(proseProvider)}`
    };
  }

  private async createFullDraftBlueprint(input: FullDraftInput, provider: ProviderConfig): Promise<FullDraftBlueprint> {
    const targetLength = this.targetLengthNumber(input);
    const sectionCount = this.sectionCountForTarget(input);
    const sectionTarget = this.sectionWordTargetForInput(input);
    const prompt = `${FULL_DRAFT_BLUEPRINT_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

目标：
- 总字数约 ${targetLength} 字。
- 分成 ${sectionCount} 个正文分段，每段 wordTarget 尽量接近 ${sectionTarget} 字；这是模型校准后的目标，用它控制最终总字数，不要自行改动。
- 只返回蓝图 JSON，不写正文 content。
- sections 必须按 1 到 ${sectionCount} 顺序排列，并覆盖完整故事起承转合。
- 第 1 段必须设计前 300 字留存事件，不能从世界观、人物履历或心情介绍开始。
- 中间段必须逐段升级：每段至少一个新行动或新证据，不能原地争吵。
- 最后一段必须回收核心冲突，不要只写“她重新开始了”。
- mustInclude 必须是具体可写材料，例如“一张被折过的缴费单”“门口的第二串脚印”“一句暴露时间差的对话”，不能写抽象概念。
- avoid 必须针对本段列出禁写问题，例如“大段童年回忆”“用旁白解释阴谋”“重复上一段争吵”。

用户输入：
${JSON.stringify(input, null, 2)}

用户已确认或编辑的故事方案：
${JSON.stringify(input.approvedOutline ?? null, null, 2)}

请只返回 JSON 对象，不要输出 JSON 之外的解释。`;

    const parsed = await this.createStructuredOutput<FullDraftBlueprint>(
      prompt,
      "shenbi_v2_full_draft_blueprint",
      fullDraftBlueprintJsonSchema,
      provider,
      {
        maxTokens: 3500,
        timeoutMs: 60000
      }
    );

    return this.normalizeFullDraftBlueprint(parsed, input);
  }

  private async createFullDraftSection(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    provider: ProviderConfig
  ): Promise<FullDraftSectionResult> {
    return this.createFullDraftSectionWithFeedback(input, blueprint, section, previousText, storyState, provider);
  }

  private async createFullDraftSectionWithFeedback(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    provider: ProviderConfig,
    qualityFeedback?: string
  ): Promise<FullDraftSectionResult> {
    const minimumWordTarget = this.minimumReadableTextForSection(section);
    const maximumWordTarget = this.maximumReadableTextForSection(section);
    const prompt = `${FULL_DRAFT_SECTION_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

全篇信息：
${JSON.stringify(
  {
    title: blueprint.title,
    genre: blueprint.genre,
    summary: blueprint.summary,
    marketSummary: blueprint.marketSummary,
    qualitySummary: blueprint.qualitySummary,
    sections: blueprint.sections.map((item) => ({
      index: item.index,
      title: item.title,
      goal: item.goal,
      readerQuestion: item.readerQuestion,
      conflictUpgrade: item.conflictUpgrade,
      informationReveal: item.informationReveal,
      wordTarget: item.wordTarget
    }))
  },
  null,
  2
)}

当前分段：
${JSON.stringify(section, null, 2)}

上一段结尾：
${previousText || "这是开头分段。"}

当前故事状态：
${JSON.stringify(storyState, null, 2)}

连续性硬约束：
- 必须承接 currentSummary 和 nextContinuityNotes，不要重启故事。
- 已经发生的 completedEvents 不能反复重写，只能推动新行动。
- 已经揭露的 revealedInformation 不能当成新反转重复揭露。
- openForeshadows 只允许推进或回收，不能遗忘。

${qualityFeedback ? `上一次生成未通过质量闸门，必须修正：\n${qualityFeedback}\n` : ""}

用户输入：
${JSON.stringify(
  {
    mode: input.mode,
    inspiration: input.inspiration,
    targetPlatform: input.targetPlatform,
    targetLength: input.targetLength,
    optionalDirection: input.optionalDirection,
    avoid: input.avoid,
    approvedOutline: input.approvedOutline
  },
  null,
  2
)}

要求：
- text 只写当前分段正文，目标约 ${section.wordTarget} 字，建议范围 ${minimumWordTarget}-${maximumWordTarget} 字；超过 ${maximumWordTarget} 字就是失败。
- 当前分段只写一个主场景，最多 6-10 个自然段；每个自然段都必须有新动作、新证据、新对抗或新信息。
- 写到目标字数附近必须停，不要为了补解释、补心理活动或补背景而继续扩写。
- 为了控长，优先保留动作、证据、对抗和转折，删掉解释、回忆、抒情、重复信息和无新信息对话。
- 当前段不能复述蓝图，不能输出段落标题。
- 如果是第 1 段，前 300 字内必须有强异常、强冲突、强代价或强悬念。
- 如果是最后一段，必须回收核心冲突并给出情绪落点。
- 必须使用 mustInclude 中的具体材料，至少出现 2 项。
- mustInclude 要以读者能看见的物件、记录、动作或对话出现，不能只用一句旁白概括。
- 必须回应 readerQuestion，并在段尾制造新的继续阅读理由。
- 必须让 conflictUpgrade 和 informationReveal 以场面形式发生，不能只用旁白总结。
- 不能重复上一段结尾的句子。
- 不要写任何“市场判断、自检摘要、创作说明、以下正文、章节标题”。

请直接输出当前分段的小说正文纯文本，不要 JSON。`;

    const text = await this.createChatTextOutput(
      prompt,
      provider,
      {
        maxTokens: this.maxTokensForSection(section.wordTarget),
        timeoutMs: this.timeoutMsForSection(section.wordTarget, provider)
      }
    );

    return this.normalizeFullDraftSection(
      {
        index: section.index,
        title: section.title,
        text,
        revisionNote: qualityFeedback
          ? `${section.title} 已按质量反馈重写，建议复核连续性。`
          : `${section.title} 已由 Kimi 生成，建议检查节奏和信息推进。`
      },
      section
    );
  }

  private async continueFullDraftSection(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    currentResult: FullDraftSectionResult,
    provider: ProviderConfig,
    missingReadableCount: number
  ): Promise<FullDraftSectionResult> {
    const targetAppendCount = Math.max(420, Math.min(1200, missingReadableCount + 260));
    const prompt = `${FULL_DRAFT_SECTION_CONTINUATION_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

全篇信息：
${JSON.stringify(
  {
    title: blueprint.title,
    genre: blueprint.genre,
    summary: blueprint.summary,
    currentSection: section,
    storyState,
    previousTextTail: previousText
  },
  null,
  2
)}

当前已写正文：
${currentResult.text}

用户输入：
${JSON.stringify(
  {
    mode: input.mode,
    inspiration: input.inspiration,
    targetPlatform: input.targetPlatform,
    targetLength: input.targetLength,
    approvedOutline: input.approvedOutline
  },
  null,
  2
)}

续写目标：
- 补写约 ${targetAppendCount} 字。
- 从当前已写正文之后继续，不重复前文。
- 优先补足 mustInclude 里的具体材料、readerQuestion、conflictUpgrade、informationReveal 和 endingHook。

请直接输出续写正文纯文本。`;

    const continuation = await this.createChatTextOutput(prompt, provider, {
      maxTokens: this.maxTokensForContinuation(targetAppendCount),
      timeoutMs: this.timeoutMsForSection(targetAppendCount, provider)
    });
    const cleanContinuation = this.cleanGeneratedSectionText(continuation);

    if (!cleanContinuation || currentResult.text.includes(cleanContinuation.slice(0, 80))) {
      return currentResult;
    }

    return {
      ...currentResult,
      text: `${currentResult.text.trim()}\n\n${cleanContinuation}`.trim(),
      revisionNote: `${currentResult.revisionNote} 已由 Kimi 续写补足本段长度。`
    };
  }

  private async rewriteFullDraftSectionWithFeedback(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    currentResult: FullDraftSectionResult,
    provider: ProviderConfig,
    feedback: string
  ): Promise<FullDraftSectionResult> {
    const prompt = `${FULL_DRAFT_SECTION_REWRITE_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

全篇信息：
${JSON.stringify(
  {
    title: blueprint.title,
    genre: blueprint.genre,
    summary: blueprint.summary,
    marketSummary: blueprint.marketSummary,
    currentSection: section,
    storyState,
    previousTextTail: previousText
  },
  null,
  2
)}

当前问题：
${feedback}

当前待修复正文：
${currentResult.text}

用户输入：
${JSON.stringify(
  {
    mode: input.mode,
    inspiration: input.inspiration,
    targetPlatform: input.targetPlatform,
    targetLength: input.targetLength,
    optionalDirection: input.optionalDirection,
    approvedOutline: input.approvedOutline
  },
  null,
  2
)}

要求：
- 目标约 ${section.wordTarget} 字，合格范围 ${this.minimumReadableTextForSection(section)}-${this.maximumReadableTextForSection(section)} 字。
- 修复反馈中的问题，同时保留当前分段该推进的情节职责。
- 不要重复上一段结尾，不要输出标题或说明。
- 必须遵守 storyState：已发生事件不能重写，已揭露信息不能当成新发现，未回收伏笔要推进或回收。
- 如果反馈说过长，必须压缩到目标附近，只保留动作、证据、对抗和转折。
- mustInclude 必须以具体可见材料落地；如果反馈指出材料不足，至少写出两个可展示给别人看的证据/物件/记录/动作。

请直接输出重写后的小说正文纯文本。`;

    const text = await this.createChatTextOutput(prompt, provider, {
      maxTokens: this.maxTokensForSection(section.wordTarget),
      timeoutMs: this.timeoutMsForSection(section.wordTarget, provider)
    });

    return this.normalizeFullDraftSection(
      {
        index: section.index,
        title: section.title,
        text,
        revisionNote: `${section.title} 已按质量或连续性反馈由 Kimi 重写。`
      },
      section
    );
  }

  private async createStructuredOutput<T>(
    input: OpenAIRequest["input"],
    name: string,
    schema: unknown,
    provider = this.activeProvider(),
    options: StructuredOutputOptions = {}
  ): Promise<T> {

    if (provider.endpoint === "chat_completions") {
      return this.createChatStructuredOutput<T>(input, name, provider, options);
    }

    const request: OpenAIRequest = {
      model: options.modelName ?? this.modelName(provider),
      input,
      text: {
        format: {
          type: "json_schema",
          name,
          schema,
          strict: false
        }
      },
      max_output_tokens: options.maxTokens
    };

    const response = await fetch(this.joinUrl(this.baseUrl(provider), "responses"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey(provider)}`
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? this.requestTimeoutMs()),
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI 请求失败：${response.status} ${body.slice(0, 240)}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const text = this.extractOutputText(data);
    if (!text) {
      throw new Error("OpenAI 没有返回可解析文本");
    }

    return JSON.parse(text) as T;
  }

  private async createChatStructuredOutput<T>(
    input: OpenAIRequest["input"],
    name: string,
    provider: ProviderConfig,
    options: StructuredOutputOptions = {}
  ): Promise<T> {
    if (this.containsImageInput(input) && !provider.supportsVision) {
      throw new Error(`${provider.label} 当前配置不支持图片输入。`);
    }

    const modelName = options.modelName ?? this.modelName(provider);
    const temperature = this.temperatureForChatRequest(provider, modelName, options.temperature);
    const thinking = this.thinkingForChatRequest(provider, modelName);
    const request: ChatCompletionRequest = {
      model: modelName,
      messages: this.toChatMessages(input, name),
      response_format: {
        type: "json_object"
      },
      ...(temperature === undefined ? {} : { temperature }),
      ...(thinking ? { thinking } : {}),
      max_tokens: options.maxTokens
    };

    const response = await fetch(this.joinUrl(this.baseUrl(provider), "chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey(provider)}`
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? this.requestTimeoutMs()),
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${provider.label} 请求失败：${response.status} ${body.slice(0, 240)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = this.extractChatOutputText(data);
    if (!text) {
      throw new Error(`${provider.label} 没有返回可解析文本`);
    }

    return this.parseJsonText<T>(text);
  }

  private async createChatTextOutput(
    input: string,
    provider: ProviderConfig,
    options: StructuredOutputOptions = {}
  ): Promise<string> {
    if (provider.endpoint !== "chat_completions") {
      throw new Error(`${provider.label} 当前不是正式正文主笔；正式全文正文只允许 Kimi K2.6 分段生成。`);
    }

    const modelName = options.modelName ?? this.modelName(provider);
    const temperature = this.temperatureForChatRequest(provider, modelName, options.temperature);
    const thinking = this.thinkingForChatRequest(provider, modelName);
    const request: ChatCompletionRequest = {
      model: modelName,
      messages: [
        {
          role: "system",
          content: "你是专业中文短篇小说主笔。只输出小说正文纯文本，不要 JSON、Markdown、标题、解释或创作说明。"
        },
        {
          role: "user",
          content: input
        }
      ],
      ...(temperature === undefined ? {} : { temperature }),
      ...(thinking ? { thinking } : {}),
      max_tokens: options.maxTokens
    };

    const response = await fetch(this.joinUrl(this.baseUrl(provider), "chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey(provider)}`
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? this.requestTimeoutMs()),
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${provider.label} 请求失败：${response.status} ${body.slice(0, 240)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = this.extractChatOutputText(data);

    if (!text) {
      throw new Error(`${provider.label} 没有返回可用正文`);
    }

    return text.trim();
  }

  private extractOutputText(response: OpenAIResponse) {
    if (response.output_text) {
      return response.output_text;
    }

    return response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n");
  }

  private extractChatOutputText(response: ChatCompletionResponse) {
    const content = response.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content;
    }

    return content
      ?.map((item) => item.text)
      .filter(Boolean)
      .join("\n");
  }

  private toChatMessages(input: OpenAIRequest["input"], name: string): ChatCompletionRequest["messages"] {
    const systemMessage = `你必须只返回 JSON 对象，不要输出 Markdown、代码块或解释文字。JSON 任务名：${name}。`;

    if (typeof input === "string") {
      return [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: input
        }
      ];
    }

    return [
      {
        role: "system",
        content: systemMessage
      },
      ...input.map((message) => ({
        role: message.role === "user" ? "user" as const : "system" as const,
        content: message.content.map((item) =>
          item.type === "input_text"
            ? {
                type: "text" as const,
                text: item.text
              }
            : {
                type: "image_url" as const,
                image_url: {
                  url: item.image_url,
                  detail: item.detail
                }
              }
        )
      }))
    ];
  }

  private containsImageInput(input: OpenAIRequest["input"]) {
    return Array.isArray(input) && input.some((message) => message.content.some((item) => item.type === "input_image"));
  }

  private async createStructuredOutputWithRetry<T>(
    input: OpenAIRequest["input"],
    name: string,
    schema: unknown,
    provider = this.activeProvider(),
    options: StructuredOutputOptions = {},
    attempts = 2
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.createStructuredOutput<T>(input, name, schema, provider, options);
      } catch (error) {
        lastError = error;

        if (attempt >= attempts - 1 || !this.isRetryableAiError(error)) {
          break;
        }

        await this.sleep(this.retryDelayMs(attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("真实 AI 连续两次没有返回可用结果");
  }

  private normalizeFullDraftInput(input: FullDraftInput): FullDraftInput {
    return {
      ...input,
      targetPlatform: input.targetPlatform?.trim() || "fanqie",
      targetLength: input.targetLength || "auto",
      optionalDirection: input.optionalDirection?.trim(),
      inspiration: input.inspiration?.trim(),
      avoid: this.normalizeStringList(input.avoid),
      approvedOutline: input.approvedOutline ? this.normalizeStoryOutlineResult(input.approvedOutline, input) : undefined,
      memoryHints: this.normalizeStringList(input.memoryHints),
      strategyHints: this.normalizeStringList(input.strategyHints)
    };
  }

  private normalizeStoryOutlineInput(input: StoryOutlineInput): StoryOutlineInput {
    return {
      ...this.normalizeFullDraftInput(input),
      previousOutlines: this.normalizeArray(input.previousOutlines)
        .map((outline) => this.normalizeStoryOutlineResult(outline, input))
        .slice(0, 4)
    };
  }

  private compactStoryOutlineInput(input: StoryOutlineInput) {
    return {
      mode: input.mode,
      inspiration: input.inspiration || "",
      targetPlatform: input.targetPlatform || "fanqie",
      targetLength: input.targetLength || "auto",
      optionalDirection: input.optionalDirection || "自动判断",
      avoid: this.normalizeStringList(input.avoid).slice(0, 6),
      previousOutlines: this.normalizeArray(input.previousOutlines)
        .slice(-3)
        .map((outline) => ({
          title: outline.title,
          direction: outline.direction,
          outline: this.limitReadableText(outline.outline, 180)
        })),
      learningSignals: [
        ...this.normalizeStringList(input.strategyHints).slice(0, 2),
        ...this.normalizeStringList(input.memoryHints).slice(0, 2)
      ].map((item) => this.limitReadableText(item, 120))
    };
  }

  private normalizeStoryOutlineResult(
    result: Omit<StoryOutlineResult, "providerMode" | "providerNotice" | "modelName">,
    input: Pick<StoryOutlineInput, "optionalDirection" | "mode" | "inspiration">
  ): StoryOutlineResult {
    const fallback = generateStoryOutlineMock(input as StoryOutlineInput);
    const outline = result.outline?.trim() || fallback.outline;

    return {
      title: result.title?.trim() || fallback.title,
      direction: result.direction?.trim() || input.optionalDirection?.trim() || fallback.direction,
      outline: this.limitReadableText(outline, 500),
      highlights: this.normalizeStringList(result.highlights).slice(0, 5).length
        ? this.normalizeStringList(result.highlights).slice(0, 5)
        : fallback.highlights,
      marketReason: result.marketReason?.trim() || fallback.marketReason
    };
  }

  private storyOutlineQualityIssues(outline: StoryOutlineResult) {
    const issues: string[] = [];
    const combined = [outline.title, outline.direction, outline.outline, outline.marketReason, ...outline.highlights].join("\n");
    const concreteSignalPattern = /病历|账单|录音|门禁|合同|旧手机|聊天|截图|遗嘱|监控|钥匙|发票|缴费单|快递|照片|录取|诊断|转账|保单|工牌|时间差|借条|离婚协议|亲子鉴定|孕检|住院单|银行卡|名单|结婚证|报警回执|调解书/u;
    const titleSignalPattern = /病历|账单|录音|门禁|合同|旧手机|聊天|截图|遗嘱|监控|钥匙|发票|缴费单|快递|照片|录取|诊断|转账|保单|工牌|借条|协议|鉴定|孕检|银行卡|名单|结婚证|回执|调解书|背面|第二|最后|消失|失踪|多出|少了|错位/u;
    const conflictActionPattern = /伪造|冒名|转移|藏[起了住]|删除|威胁|催债|逼迫|报警|律师|取证|流水|录音|监控|合同|借条|赔偿|财产|反击|对峙|举报|调解|起诉/u;

    if (outline.title.length < 5 || /^(逆风飞扬|破茧成蝶|重生之路|背叛的代价|双面情人|未命名短篇)$/u.test(outline.title.trim())) {
      issues.push("标题过于空泛，缺少可感知的人、物、处境或异常。");
    }

    if (!titleSignalPattern.test(outline.title)) {
      issues.push("标题缺少具体物件、异常或强处境，点击承诺不够清楚。");
    }

    if (outline.outline.length < 90) {
      issues.push("大纲太短，没有讲清主角处境、核心冲突和结尾承诺。");
    }

    if (GENERIC_OUTLINE_PATTERNS.some((pattern) => pattern.test(combined))) {
      issues.push("出现模板化表达，必须换成具体事件、证据和行动。");
    }

    const concreteHits = combined.match(new RegExp(concreteSignalPattern.source, "gu")) ?? [];

    if (concreteHits.length < 2) {
      issues.push("缺少具体证据、物件或记录，卖点承载不够具体。");
    }

    if (!conflictActionPattern.test(combined)) {
      issues.push("缺少强行动或强对抗，不能停留在怀疑、发现、选择。");
    }

    if (/选题卡|情绪曲线|冲突阶梯|信息差|人物卡|场景卡|测试读者/u.test(combined)) {
      issues.push("出现旧流程词，用户不需要看到工作流。");
    }

    if (outline.highlights.some((item) => /人性|价值|反思|成长|复杂性|多面性/u.test(item) && item.length < 24)) {
      issues.push("创作亮点太抽象，必须改成具体场面卖点。");
    }

    return issues.slice(0, 5);
  }

  private normalizeFullDraftBlueprint(blueprint: FullDraftBlueprint, input: FullDraftInput): FullDraftBlueprint {
    const sectionCount = this.sectionCountForTarget(input);
    const fallbackWordTarget = this.sectionWordTargetForInput(input);
    const sections = this.normalizeFullDraftSections(blueprint.sections, sectionCount, fallbackWordTarget);

    if (sections.length < 1) {
      throw new Error("真实 AI 没有返回可用的分段蓝图。");
    }

    return {
      title: blueprint.title?.trim() || "未命名短篇",
      genre: blueprint.genre?.trim() || input.optionalDirection?.trim() || "市场导向短篇",
      tags: this.normalizeStringList(blueprint.tags).slice(0, 8),
      summary: blueprint.summary?.trim() || "一篇面向平台读者的原创短篇初稿。",
      marketSummary: blueprint.marketSummary?.trim() || "围绕点击欲、留存、冲突升级和结尾回收生成。",
      qualitySummary: blueprint.qualitySummary?.trim() || "分段生成后建议进入编辑器人工精修。",
      internalPlan: blueprint.internalPlan?.trim() || "后台先生成市场蓝图，再逐段生成正文并合并保存。",
      sections
    };
  }

  private normalizeFullDraftSections(sections: FullDraftBlueprintSection[] | undefined, sectionCount: number, fallbackWordTarget: number) {
    const normalized = this.normalizeArray(sections)
      .slice(0, sectionCount)
      .map((section, index) => ({
        index: index + 1,
        title: section.title?.trim() || `分段 ${index + 1}`,
        goal: section.goal?.trim() || "推进核心冲突。",
        context: section.context?.trim() || "承接前文，继续推进故事。",
        openingHook: section.openingHook?.trim() || "以具体行动或异常开场。",
        readerQuestion: section.readerQuestion?.trim() || "读者会追问主角接下来如何破局。",
        conflictUpgrade: section.conflictUpgrade?.trim() || "让主角付出新的代价，冲突进一步升级。",
        informationReveal: section.informationReveal?.trim() || "揭露一个改变读者判断的新信息。",
        mustInclude: this.normalizeStringList(section.mustInclude).slice(0, 8).length
          ? this.normalizeStringList(section.mustInclude).slice(0, 8)
          : ["一个具体物件", "一次带目的的对话", "一个可验证的行动"],
        avoid: this.normalizeStringList(section.avoid).slice(0, 8).length
          ? this.normalizeStringList(section.avoid).slice(0, 8)
          : ["大段背景介绍", "空泛抒情"],
        turningPoint: section.turningPoint?.trim() || "让局势发生变化。",
        endingHook: section.endingHook?.trim() || "留下继续读的动力。",
        wordTarget: this.normalizeWordTarget(section.wordTarget, fallbackWordTarget)
      }));

    return normalized.length >= 1 ? normalized : [];
  }

  private normalizeFullDraftSection(result: FullDraftSectionResult, fallback: FullDraftBlueprintSection): FullDraftSectionResult {
    const text = this.cleanGeneratedSectionText(result.text ?? "");

    if (!text) {
      throw new Error(`第 ${fallback.index} 段正文为空。`);
    }

    return {
      index: fallback.index,
      title: result.title?.trim() || fallback.title,
      text,
      revisionNote: result.revisionNote?.trim() || `${fallback.title} 已生成，建议检查节奏和信息推进。`
    };
  }

  private emptyFullDraftMetrics(): FullDraftGenerationMetrics {
    return {
      continuations: 0,
      rewrites: 0,
      continuityChecks: 0,
      qualityLog: []
    };
  }

  private createFullDraftCheckpoint(
    blueprint: FullDraftBlueprint,
    sections: FullDraftSectionResult[],
    storyState: FullDraftStoryState,
    continuityNotes: string[],
    metrics: FullDraftGenerationMetrics
  ): FullDraftGenerationCheckpoint {
    return {
      blueprint: {
        ...blueprint,
        tags: [...blueprint.tags],
        sections: blueprint.sections.map((section) => ({
          ...section,
          mustInclude: [...section.mustInclude],
          avoid: [...section.avoid]
        }))
      },
      sections: sections.map((section) => ({ ...section })),
      storyState: {
        ...storyState,
        completedEvents: [...storyState.completedEvents],
        revealedInformation: [...storyState.revealedInformation],
        protagonistKnows: [...storyState.protagonistKnows],
        readerKnows: [...storyState.readerKnows],
        antagonistKnows: [...storyState.antagonistKnows],
        openForeshadows: [...storyState.openForeshadows],
        resolvedForeshadows: [...storyState.resolvedForeshadows],
        characterStates: [...storyState.characterStates],
        timeline: [...storyState.timeline],
        nextContinuityNotes: [...storyState.nextContinuityNotes]
      },
      continuityNotes: [...continuityNotes],
      metrics: {
        continuations: metrics.continuations,
        rewrites: metrics.rewrites,
        continuityChecks: metrics.continuityChecks,
        qualityLog: metrics.qualityLog.slice(-24)
      },
      updatedAt: new Date().toISOString()
    };
  }

  private async emitFullDraftProgress(options: FullDraftGenerationOptions, progress: FullDraftGenerationProgress) {
    await options.onProgress?.(progress);
  }

  private sectionForRemainingTarget(
    input: FullDraftInput,
    section: FullDraftBlueprintSection,
    completedSections: number,
    totalSections: number,
    currentWordCount: number
  ): FullDraftBlueprintSection {
    const target = this.targetLengthNumber(input);
    const remainingSections = Math.max(1, totalSections - completedSections);
    const remainingTarget = Math.max(900, target - currentWordCount);
    const dynamicTarget = Math.round((remainingTarget / remainingSections) * 0.7);

    return {
      ...section,
      wordTarget: Math.max(620, Math.min(section.wordTarget, dynamicTarget))
    };
  }

  private recordFullDraftQualityLog(metrics: FullDraftGenerationMetrics, message: string) {
    metrics.qualityLog = [...metrics.qualityLog, message].slice(-24);
  }

  private recordFullDraftRewrite(metrics: FullDraftGenerationMetrics, message: string) {
    metrics.rewrites += 1;
    this.recordFullDraftQualityLog(metrics, message);
  }

  private async refineFullDraftSectionQuality(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    result: FullDraftSectionResult,
    provider: ProviderConfig,
    metrics: FullDraftGenerationMetrics
  ) {
    let nextResult = result;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const issues = this.fullDraftSectionQualityIssues(nextResult, section, previousText, blueprint.sections.length);
      const retryableIssues = this.retryableFullDraftSectionIssues(issues);

      if (!retryableIssues.length) {
        return nextResult;
      }

      const feedback = this.fullDraftRewriteFeedback(section, nextResult, retryableIssues, attempt);
      this.recordFullDraftRewrite(metrics, `第 ${section.index} 段第 ${attempt + 1} 次 Kimi 重写：${retryableIssues.join("；")}`);

      nextResult = await this.rewriteFullDraftSectionWithFeedback(
        input,
        blueprint,
        section,
        previousText,
        storyState,
        nextResult,
        provider,
        feedback
      );
      nextResult = await this.ensureFullDraftSectionLength(input, blueprint, section, previousText, storyState, nextResult, provider, metrics);
    }

    return nextResult;
  }

  private fullDraftRewriteFeedback(
    section: FullDraftBlueprintSection,
    result: FullDraftSectionResult,
    issues: string[],
    attempt: number
  ) {
    const readableCount = this.countReadableText(result.text);
    const minimumCount = this.minimumReadableTextForSection(section);
    const maximumCount = this.maximumReadableTextForSection(section);
    const strictMaximum = Math.max(minimumCount + 120, Math.round(maximumCount * (attempt >= 1 ? 0.94 : 1)));
    const mustInclude = section.mustInclude.length ? section.mustInclude.join("、") : "蓝图里的具体证据、物件和行动";

    return [
      `当前约 ${readableCount} 字，合格范围 ${minimumCount}-${strictMaximum} 字。`,
      `必须重写为更紧的版本，不能超过 ${strictMaximum} 字；如果已经超长，删掉解释、回忆、心理独白、重复争吵和无新信息过场。`,
      `必须把这些材料写成可见场面：${mustInclude}。`,
      `段尾必须兑现或推进 endingHook：「${section.endingHook}」。`,
      ...issues.map((issue) => `- ${issue}`)
    ].join("\n");
  }

  private async ensureFullDraftSectionLength(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    result: FullDraftSectionResult,
    provider: ProviderConfig,
    metrics: FullDraftGenerationMetrics
  ) {
    let nextResult = result;
    const minimumCount = this.minimumReadableTextForSection(section);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentCount = this.countReadableText(nextResult.text);
      const missingCount = minimumCount - currentCount;

      if (missingCount <= 0) {
        return nextResult;
      }

      metrics.continuations += 1;
      this.recordFullDraftQualityLog(metrics, `第 ${section.index} 段偏短，已触发 Kimi 续写补足。`);
      nextResult = await this.continueFullDraftSection(input, blueprint, section, previousText, storyState, nextResult, provider, missingCount);

      if (this.countReadableText(nextResult.text) <= currentCount + 80) {
        return nextResult;
      }
    }

    return nextResult;
  }

  private async ensureFullDraftTotalLength(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    sections: FullDraftSectionResult[],
    storyState: FullDraftStoryState,
    continuityNotes: string[],
    metrics: FullDraftGenerationMetrics,
    provider: ProviderConfig,
    options: FullDraftGenerationOptions
  ) {
    const minimumCount = this.minimumReadableTextForTarget(input);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const currentCount = this.countReadableText(this.composeFullDraftContent(sections));
      const missingCount = minimumCount - currentCount;

      if (missingCount <= 0 || !sections.length) {
        return;
      }

      const lastIndex = sections.length - 1;
      const lastBlueprintSection = blueprint.sections[lastIndex] ?? blueprint.sections.at(-1);
      const lastResult = sections[lastIndex];
      const previousText = sections.length > 1 ? sections[sections.length - 2].text.slice(-900) : "";

      if (!lastBlueprintSection || !lastResult) {
        return;
      }

      await this.emitFullDraftProgress(options, {
        stage: "section",
        progressLabel: "正在补足全文",
        detail: `全文当前约 ${currentCount} 字，Kimi 正在补足最后一段收束。`,
        completedSections: sections.length,
        totalSections: blueprint.sections.length,
        currentSectionTitle: lastBlueprintSection.title,
        wordCount: currentCount,
        checkpoint: this.createFullDraftCheckpoint(blueprint, sections, storyState, continuityNotes, metrics)
      });

      metrics.continuations += 1;
      this.recordFullDraftQualityLog(metrics, `全文总字数不足，已触发第 ${attempt + 1} 次 Kimi 收束补写。`);
      sections[lastIndex] = await this.continueFullDraftSection(
        input,
        blueprint,
        lastBlueprintSection,
        previousText,
        storyState,
        lastResult,
        provider,
        missingCount
      );
    }
  }

  private initialFullDraftStoryState(blueprint: FullDraftBlueprint, input: FullDraftInput): FullDraftStoryState {
    const approvedOutline = input.approvedOutline;

    return {
      currentSummary: approvedOutline?.outline?.trim() || blueprint.summary,
      completedEvents: [],
      revealedInformation: [],
      protagonistKnows: [],
      readerKnows: [],
      antagonistKnows: [],
      openForeshadows: blueprint.sections.slice(0, 2).map((section) => section.readerQuestion).filter(Boolean),
      resolvedForeshadows: [],
      characterStates: [],
      timeline: [],
      toneAndPacing: "开局前，等待第一段用具体事件建立压力。",
      nextContinuityNotes: [
        "不要换故事、换主角或改掉用户确认的大纲。",
        "每段必须承接前一段的行动后果，不要重启场景。"
      ]
    };
  }

  private async checkFullDraftContinuity(
    input: FullDraftInput,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    result: FullDraftSectionResult
  ): Promise<FullDraftContinuityCheck> {
    const deepseek = AI_PROVIDERS.deepseek;

    if (!this.hasProviderApiKey(deepseek)) {
      return this.localFullDraftContinuityCheck(blueprint, section, previousText, storyState, result);
    }

    try {
      const prompt = `${FULL_DRAFT_CONTINUITY_CHECK_INSTRUCTIONS}

提示词版本：${WRITING_PROMPT_VERSION}

用户输入：
${JSON.stringify(
  {
    mode: input.mode,
    targetPlatform: input.targetPlatform,
    targetLength: input.targetLength,
    optionalDirection: input.optionalDirection,
    approvedOutline: input.approvedOutline
  },
  null,
  2
)}

全篇蓝图：
${JSON.stringify(
  {
    title: blueprint.title,
    genre: blueprint.genre,
    summary: blueprint.summary,
    sections: blueprint.sections.map((item) => ({
      index: item.index,
      title: item.title,
      goal: item.goal,
      readerQuestion: item.readerQuestion,
      conflictUpgrade: item.conflictUpgrade,
      informationReveal: item.informationReveal,
      endingHook: item.endingHook
    }))
  },
  null,
  2
)}

当前故事状态：
${JSON.stringify(storyState, null, 2)}

上一段结尾：
${previousText || "这是开头分段。"}

当前分段蓝图：
${JSON.stringify(section, null, 2)}

当前 Kimi 正文：
${result.text}

只检查，不写正文。请只返回 JSON 对象。`;

      const parsed = await this.createStructuredOutput<FullDraftContinuityCheck>(
        prompt,
        "shenbi_v2_full_draft_continuity_check",
        fullDraftContinuityCheckJsonSchema,
        deepseek,
        {
          maxTokens: 2200,
          temperature: 0.2,
          timeoutMs: 60000
        }
      );

      return this.normalizeFullDraftContinuityCheck(parsed, blueprint, section, storyState, result);
    } catch (error) {
      const localCheck = this.localFullDraftContinuityCheck(blueprint, section, previousText, storyState, result);

      return {
        ...localCheck,
        continuityNotes: [
          ...localCheck.continuityNotes,
          `DeepSeek 连续性检查暂不可用，已使用本地规则检查：${this.errorMessage(error)}`
        ].slice(0, 6)
      };
    }
  }

  private localFullDraftContinuityCheck(
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    previousText: string,
    storyState: FullDraftStoryState,
    result: FullDraftSectionResult
  ): FullDraftContinuityCheck {
    const issues: string[] = [];
    const text = result.text.trim();
    const previousEnding = previousText.trim().slice(-80);

    if (previousEnding && text.includes(previousEnding)) {
      issues.push("当前分段重复了上一段结尾。");
    }

    if (/市场判断|自检摘要|创作说明|以下是|下面是|JSON|作为AI|作为一个AI/u.test(text)) {
      issues.push("当前分段混入了非小说正文。");
    }

    if (section.index > 1 && /^(我叫|她叫|他叫|故事发生|这是一个)/u.test(text.slice(0, 80))) {
      issues.push("当前分段像重新开篇，没有承接前文。");
    }

    const readableCount = this.countReadableText(text);
    if (readableCount < this.minimumReadableTextForSection(section) * 0.72) {
      issues.push(`当前分段仍明显偏短，约 ${readableCount} 字。`);
    }

    const completedEvent = `第 ${section.index} 段「${section.title}」：${section.goal}`;
    const nextSummary = this.limitReadableText(
      [storyState.currentSummary, completedEvent, section.informationReveal].filter(Boolean).join("；"),
      900
    );
    const patch: FullDraftStoryStatePatch = {
      currentSummary: nextSummary,
      completedEvents: [completedEvent],
      revealedInformation: [section.informationReveal].filter(Boolean),
      protagonistKnows: [section.informationReveal].filter(Boolean),
      readerKnows: [section.readerQuestion, section.informationReveal].filter(Boolean),
      antagonistKnows: [],
      openForeshadows: section.index < blueprint.sections.length ? [section.endingHook].filter(Boolean) : [],
      resolvedForeshadows: section.index === blueprint.sections.length ? [blueprint.summary, section.endingHook].filter(Boolean) : [],
      characterStates: [section.turningPoint].filter(Boolean),
      timeline: [`第 ${section.index} 段完成：${section.title}`],
      toneAndPacing: section.index === blueprint.sections.length ? "核心冲突进入收束。" : `已推进到「${section.endingHook}」，下一段继续升级。`,
      nextContinuityNotes: section.index < blueprint.sections.length
        ? [`下一段必须承接「${section.endingHook}」。`, `不要忘记已揭露信息：「${section.informationReveal}」。`]
        : ["全文已到收束段，后续进入编辑器人工精修。"]
    };

    return {
      ok: issues.length === 0,
      rewriteRequired: issues.some((issue) => /重复|非小说|重新开篇/u.test(issue)),
      issues,
      continuityNotes: patch.nextContinuityNotes,
      suggestedFix: issues.length ? "让 Kimi 保留本段职责，改成承接前文的连续小说场面。" : "",
      statePatch: patch
    };
  }

  private normalizeFullDraftContinuityCheck(
    check: FullDraftContinuityCheck,
    blueprint: FullDraftBlueprint,
    section: FullDraftBlueprintSection,
    storyState: FullDraftStoryState,
    result: FullDraftSectionResult
  ): FullDraftContinuityCheck {
    const localCheck = this.localFullDraftContinuityCheck(blueprint, section, "", storyState, result);
    const issues = this.normalizeStringList(check.issues).slice(0, 6);

    return {
      ok: Boolean(check.ok) && issues.length === 0,
      rewriteRequired: Boolean(check.rewriteRequired),
      issues,
      continuityNotes: this.normalizeStringList(check.continuityNotes).slice(0, 6),
      suggestedFix: check.suggestedFix?.trim() || localCheck.suggestedFix,
      statePatch: this.normalizeFullDraftStoryStatePatch(check.statePatch, localCheck.statePatch)
    };
  }

  private normalizeFullDraftStoryStatePatch(
    patch: FullDraftStoryStatePatch | undefined,
    fallback: FullDraftStoryStatePatch
  ): FullDraftStoryStatePatch {
    return {
      currentSummary: patch?.currentSummary?.trim() || fallback.currentSummary,
      completedEvents: this.normalizeStringList(patch?.completedEvents).slice(0, 8),
      revealedInformation: this.normalizeStringList(patch?.revealedInformation).slice(0, 8),
      protagonistKnows: this.normalizeStringList(patch?.protagonistKnows).slice(0, 8),
      readerKnows: this.normalizeStringList(patch?.readerKnows).slice(0, 8),
      antagonistKnows: this.normalizeStringList(patch?.antagonistKnows).slice(0, 8),
      openForeshadows: this.normalizeStringList(patch?.openForeshadows).slice(0, 8),
      resolvedForeshadows: this.normalizeStringList(patch?.resolvedForeshadows).slice(0, 8),
      characterStates: this.normalizeStringList(patch?.characterStates).slice(0, 8),
      timeline: this.normalizeStringList(patch?.timeline).slice(0, 8),
      toneAndPacing: patch?.toneAndPacing?.trim() || fallback.toneAndPacing,
      nextContinuityNotes: this.normalizeStringList(patch?.nextContinuityNotes).slice(0, 8)
    };
  }

  private mergeFullDraftStoryState(state: FullDraftStoryState, patch: FullDraftStoryStatePatch): FullDraftStoryState {
    return {
      currentSummary: patch.currentSummary?.trim() || state.currentSummary,
      completedEvents: this.uniqueStrings([...state.completedEvents, ...this.normalizeStringList(patch.completedEvents)]).slice(-16),
      revealedInformation: this.uniqueStrings([...state.revealedInformation, ...this.normalizeStringList(patch.revealedInformation)]).slice(-16),
      protagonistKnows: this.uniqueStrings([...state.protagonistKnows, ...this.normalizeStringList(patch.protagonistKnows)]).slice(-16),
      readerKnows: this.uniqueStrings([...state.readerKnows, ...this.normalizeStringList(patch.readerKnows)]).slice(-16),
      antagonistKnows: this.uniqueStrings([...state.antagonistKnows, ...this.normalizeStringList(patch.antagonistKnows)]).slice(-16),
      openForeshadows: this.uniqueStrings([...state.openForeshadows, ...this.normalizeStringList(patch.openForeshadows)])
        .filter((item) => !patch.resolvedForeshadows.includes(item))
        .slice(-16),
      resolvedForeshadows: this.uniqueStrings([...state.resolvedForeshadows, ...this.normalizeStringList(patch.resolvedForeshadows)]).slice(-16),
      characterStates: this.uniqueStrings([...state.characterStates, ...this.normalizeStringList(patch.characterStates)]).slice(-16),
      timeline: this.uniqueStrings([...state.timeline, ...this.normalizeStringList(patch.timeline)]).slice(-16),
      toneAndPacing: patch.toneAndPacing?.trim() || state.toneAndPacing,
      nextContinuityNotes: this.uniqueStrings(this.normalizeStringList(patch.nextContinuityNotes)).slice(-8)
    };
  }

  private cleanGeneratedSectionText(value: string) {
    return value
      .trim()
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, "")
      .replace(/^#+\s*.+$/gmu, "")
      .replace(/^(第[一二三四五六七八九十\d]+[章节段]|分段\s*\d+|正文|小说正文)[:：\s]*/gmu, "")
      .replace(/^(以下是|下面是).{0,24}(正文|分段|小说).{0,12}[:：]\s*/gmu, "")
      .replace(/市场判断[:：][\s\S]*$/u, "")
      .replace(/自检摘要[:：][\s\S]*$/u, "")
      .replace(/创作说明[:：][\s\S]*$/u, "")
      .trim();
  }

  private fullDraftSectionQualityIssues(
    section: FullDraftSectionResult,
    blueprintSection: FullDraftBlueprintSection,
    previousText: string,
    totalSections: number
  ) {
    const issues: string[] = [];
    const text = section.text.trim();
    const readableCount = this.countReadableText(text);
    const minimumCount = this.minimumReadableTextForSection(blueprintSection);
    const maximumCount = this.maximumReadableTextForSection(blueprintSection);
    const firstPart = text.slice(0, 320);
    const previousEnding = previousText.trim().slice(-80);
    const listLineCount = text.split("\n").filter((line) => /^\s*(?:[-*]|\d+[.、)）])\s+/u.test(line)).length;

    if (readableCount < minimumCount) {
      issues.push(`正文过短，当前约 ${readableCount} 字，至少应接近 ${minimumCount} 字，并用场面推进补足。`);
    }

    if (readableCount > maximumCount) {
      issues.push(`正文过长，当前约 ${readableCount} 字，本段应压到 ${maximumCount} 字以内，删掉重复动作和解释。`);
    }

    if (/市场判断|自检摘要|创作说明|以下是|下面是|作为AI|作为一个AI|JSON|章节标题/u.test(text)) {
      issues.push("混入了非小说正文内容，必须只保留连续小说正文。");
    }

    if (listLineCount >= 2) {
      issues.push("正文出现列表化表达，必须改成自然段叙事。");
    }

    const cliche = AI_CLICHE_PATTERNS.find((pattern) => pattern.test(text));
    if (cliche) {
      issues.push("出现 AI 套话或空泛表达，必须改成具体动作、物件、证据和对话。");
    }

    if (blueprintSection.index === 1 && /^(我叫|她叫|他叫|这是|故事发生|在这个|多年以后|很久以前|从小|小时候)/u.test(firstPart.trim())) {
      issues.push("开头太慢，不能从履历、背景或世界观介绍开始，前 300 字必须先发生事件。");
    }

    if (previousEnding && text.includes(previousEnding)) {
      issues.push("重复了上一段结尾，必须换成承接后的新行动或新信息。");
    }

    if (this.hasRepeatedNarrativeBeat(text)) {
      issues.push("同一关键信息或同一句式重复出现，必须保留一次并用新动作推进。");
    }

    if (this.missingConcreteBlueprintMaterial(text, blueprintSection.mustInclude)) {
      issues.push("正文没有真正落到蓝图里的具体物件、证据或动作，必须把 mustInclude 写成场面。");
    }

    if (blueprintSection.index < totalSections && !/[？?！!。]$/u.test(text)) {
      issues.push("段尾收束不稳，必须留下清晰的新问题、新证据、新威胁或新选择。");
    }

    if (blueprintSection.index === totalSections && !/。$/u.test(text)) {
      issues.push("结尾没有形成完整情绪落点，最后一段必须完整收束。");
    }

    if (blueprintSection.index === totalSections && !this.hasConcreteResolution(text)) {
      issues.push("最后一段缺少具体反制或代价回收，必须写出证据如何生效、对手付出什么代价、主角拿回什么。");
    }

    return issues.slice(0, 6);
  }

  private hasConcreteResolution(text: string) {
    const resolutionSignals =
      /报警|警察|派出所|法院|法庭|起诉|律师|调解|撤销|冻结|查封|带走|拘留|判决|赔偿|还清|追回|归还|公开|举报|录音|证据|U盘|优盘|SD卡|遗嘱|合同|流水|转账|账户|签名|指纹|监控|承认|道歉|真相|名单|回执|材料/u;
    const actionSignals = /交给|递给|发给|提交|按下|打开|播放|调出|拿出|举起|签下|摁住|拦住|锁定|带走|撤回|退回|转入|归还|赔/u;

    return resolutionSignals.test(text) && actionSignals.test(text);
  }

  private hasRepeatedNarrativeBeat(text: string) {
    const repeatedSignals = ["已经报警", "明天调解", "放弃继承", "秘密录音", "流水单", "三十万"];

    if (repeatedSignals.some((signal) => (text.match(new RegExp(signal, "gu")) ?? []).length >= 3)) {
      return true;
    }

    const repeatedLines = text
      .split(/\n+/u)
      .map((line) => line.trim())
      .filter((line) => line.length >= 14 && line.length <= 80);
    const seenLines = new Set<string>();

    for (const line of repeatedLines) {
      if (seenLines.has(line)) {
        return true;
      }

      seenLines.add(line);
    }

    const clauses = text
      .split(/[，,。！？!?；;\n]/u)
      .map((clause) => clause.trim())
      .filter((clause) => clause.length >= 14 && clause.length <= 42);
    const seenClauses = new Set<string>();

    for (const clause of clauses) {
      if (seenClauses.has(clause)) {
        return true;
      }

      seenClauses.add(clause);
    }

    const sentences = text
      .split(/[。！？!?]\s*/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 18);
    const seen = new Set<string>();

    for (const sentence of sentences) {
      const key = sentence.slice(0, 28);

      if (seen.has(key)) {
        return true;
      }

      seen.add(key);
    }

    return false;
  }

  private retryableFullDraftSectionIssues(issues: string[]) {
    return issues.filter((issue) => /正文过短|正文过长|非小说正文|列表化表达|AI 套话|开头太慢|重复了上一段|具体物件|具体材料|段尾收束|完整情绪|具体反制|代价回收/u.test(issue));
  }

  private missingConcreteBlueprintMaterial(text: string, mustInclude: string[]) {
    const concreteWords = this.normalizeStringList(mustInclude)
      .flatMap((item) => item.split(/[，,、\s]/u))
      .map((item) => item.replace(/[“”"‘’'：:；;。！？!?（）()]/gu, "").trim())
      .filter((item) => item.length >= 2 && item.length <= 12 && !/^(一个|一次|一句|具体|材料|动作|物件|证据|对话|场面|信息|冲突|关键|核心)$/u.test(item));
    const uniqueWords = Array.from(new Set(concreteWords));
    const hitCount = uniqueWords.filter((word) => text.includes(word)).length;
    const materialHits = new Set(text.match(new RegExp(CONCRETE_STORY_MATERIAL_PATTERN.source, "gu")) ?? []);

    if (hitCount >= 2 || materialHits.size >= 2) {
      return false;
    }

    return uniqueWords.length >= 2 && hitCount === 0;
  }

  private composeFullDraftContent(sections: FullDraftSectionResult[]) {
    return sections
      .sort((a, b) => a.index - b.index)
      .map((section) => section.text.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  private normalizeFullDraftResult(result: FullDraftAiResult): FullDraftAiResult {
    return {
      title: result.title?.trim() || "未命名短篇",
      content: result.content?.trim() || "",
      genre: result.genre?.trim() || "市场导向短篇",
      tags: this.normalizeStringList(result.tags).slice(0, 8),
      summary: result.summary?.trim() || "一篇面向平台读者的原创短篇初稿。",
      marketSummary: result.marketSummary?.trim() || "优先强化开头冲突、读者期待和结尾回收。",
      qualitySummary: result.qualitySummary?.trim() || "已进行基础自检，仍建议人工精修后发布。",
      internalPlan: result.internalPlan?.trim() || "围绕市场机会、故事承诺、正文交付和自检重写生成。",
      revisionNotes: this.normalizeStringList(result.revisionNotes).slice(0, 8)
    };
  }

  private normalizeStringList(value?: string[] | string) {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }

    return value?.split(/[、,\n]/u).map((item) => item.trim()).filter(Boolean) ?? [];
  }

  private uniqueStrings(value: string[]) {
    return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  }

  private normalizeArray<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private normalizeWordTarget(value: number | undefined, fallback: number) {
    const candidate = Number.isFinite(value) && value && value > 0 ? Math.round(value) : fallback;
    const minimum = Math.max(600, Math.round(fallback * 0.72));
    const maximum = Math.round(fallback * 1.12);

    return Math.min(maximum, Math.max(minimum, candidate));
  }

  private countReadableText(text: string) {
    return text.replace(/\s+/g, "").length;
  }

  private limitReadableText(text: string, maxLength: number) {
    const trimmed = text.trim();

    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trim()}...` : trimmed;
  }

  private parseJsonText<T>(text: string): T {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");

      if (start >= 0 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      }

      throw new Error("真实 AI 返回内容不是可解析 JSON");
    }
  }

  private canUseConfiguredAi() {
    return Boolean(this.apiKey());
  }

  private modelName(provider = this.activeProvider()) {
    return process.env[provider.textModelEnv] ?? provider.defaultTextModel;
  }

  private embeddingModelName() {
    return this.activeProvider().id === "openai" ? (process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small") : "本地轻量索引";
  }

  private baseUrl(provider = this.activeProvider()) {
    return process.env[provider.baseUrlEnv] ?? provider.defaultBaseUrl;
  }

  private apiKey(provider = this.activeProvider()) {
    return process.env[provider.apiKeyEnv];
  }

  private hasProviderApiKey(provider: ProviderConfig) {
    return Boolean(this.apiKey(provider));
  }

  private activeProviderMessage(provider: ProviderConfig) {
    if (provider.id === "kimi") {
      return this.hasProviderApiKey(AI_PROVIDERS.deepseek)
        ? `已检测到 ${provider.apiKeyEnv}，故事方案使用 ${this.storyOutlineModelName(provider)}，全文正文由 ${this.modelName(provider)} 主笔；DeepSeek 只做市场蓝图和连续性检查，不写正文。`
        : `已检测到 ${provider.apiKeyEnv}，故事方案使用 ${this.storyOutlineModelName(provider)}，全文正文由 ${this.modelName(provider)} 主笔。`;
    }

    if (this.hasProviderApiKey(AI_PROVIDERS.kimi)) {
      return `Kimi Key 已配置，全文正文仍由 Kimi 主笔；${provider.label} 只做后台辅助，不写正式正文。`;
    }

    if (provider.id === "deepseek") {
      return `已检测到 ${provider.apiKeyEnv}，DeepSeek 可用于市场蓝图、结构判断和连续性检查；正式正文仍需要配置 Kimi。`;
    }

    return `已检测到 ${provider.apiKeyEnv}，写作接口会优先尝试 ${provider.label}。`;
  }

  private primaryProseProvider() {
    const kimi = AI_PROVIDERS.kimi;

    if (this.hasProviderApiKey(kimi)) {
      return kimi;
    }

    return null;
  }

  private primaryStoryProvider() {
    const kimi = AI_PROVIDERS.kimi;

    return this.hasProviderApiKey(kimi) ? kimi : null;
  }

  private blueprintProviderFor(proseProvider: ProviderConfig) {
    const deepseek = AI_PROVIDERS.deepseek;

    if (this.hasProviderApiKey(deepseek)) {
      return deepseek;
    }

    return proseProvider;
  }

  private activeProvider() {
    const providerId = process.env.AI_PROVIDER;

    if (providerId === "kimi" || providerId === "deepseek" || providerId === "openai") {
      return AI_PROVIDERS[providerId];
    }

    return AI_PROVIDERS.openai;
  }

  private temperatureForProvider(provider: ProviderConfig, modelName = this.modelName(provider)) {
    const model = modelName.toLowerCase();

    if (provider.id === "kimi" && model.startsWith("kimi-k2")) {
      return 1;
    }

    return 0.6;
  }

  private temperatureForChatRequest(provider: ProviderConfig, modelName: string, requested?: number) {
    const model = modelName.toLowerCase();

    if (provider.id === "kimi" && model.startsWith("kimi-k2") && this.thinkingForChatRequest(provider, modelName)?.type === "disabled") {
      return undefined;
    }

    return requested ?? this.temperatureForProvider(provider, modelName);
  }

  private thinkingForChatRequest(provider: ProviderConfig, modelName: string): ChatCompletionRequest["thinking"] | undefined {
    const model = modelName.toLowerCase();

    if (provider.id === "deepseek") {
      return { type: "disabled" };
    }

    if (provider.id === "kimi" && model.startsWith("kimi-k2")) {
      return { type: "disabled" };
    }

    return undefined;
  }

  private storyOutlineModelName(provider: ProviderConfig) {
    if (provider.id !== "kimi") {
      return this.modelName(provider);
    }

    return process.env[provider.outlineModelEnv ?? ""]?.trim() || provider.defaultOutlineModel || this.modelName(provider);
  }

  private targetLengthNumber(input: FullDraftInput) {
    const parsed = Number(String(input.targetLength ?? "").replace(/[^\d]/gu, ""));

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
  }

  private sectionCountForTarget(input: FullDraftInput) {
    const target = this.targetLengthNumber(input);

    if (target <= 4000) {
      return 3;
    }

    if (target <= 8000) {
      return 5;
    }

    if (target <= 15000) {
      return 9;
    }

    return 12;
  }

  private sectionWordTargetForInput(input: FullDraftInput) {
    const target = this.targetLengthNumber(input);
    const sectionCount = this.sectionCountForTarget(input);
    const compactingRatio = target <= 4000 ? 0.82 : target <= 8000 ? 0.78 : target <= 15000 ? 0.76 : 0.74;

    return Math.max(700, Math.round((target * compactingRatio) / sectionCount));
  }

  private maxTokensForSection(wordTarget: number) {
    return Math.min(3000, Math.max(1000, Math.round(wordTarget * 0.86 + 260)));
  }

  private maxTokensForContinuation(wordTarget: number) {
    return Math.min(2200, Math.max(700, Math.round(wordTarget * 1.05 + 220)));
  }

  private minimumReadableTextForSection(section: FullDraftBlueprintSection) {
    return Math.max(520, Math.min(1900, Math.round(section.wordTarget * 0.68)));
  }

  private maximumReadableTextForSection(section: FullDraftBlueprintSection) {
    return Math.max(760, Math.min(2200, Math.round(section.wordTarget * 1.08)));
  }

  private timeoutMsForSection(wordTarget: number, provider: ProviderConfig) {
    const configured = this.requestTimeoutMs();
    const calculated = Math.round(Math.max(60000, Math.min(180000, wordTarget * 45)));
    const providerFloor = provider.id === "kimi" ? 180000 : 60000;

    return Math.max(configured, providerFloor, calculated);
  }

  private timeoutMsForStoryOutline(provider: ProviderConfig) {
    const configured = Number(process.env.AI_STORY_OUTLINE_TIMEOUT_MS);

    if (Number.isFinite(configured) && configured >= 30000) {
      return configured;
    }

    return provider.id === "kimi" ? 180000 : 60000;
  }

  private minimumReadableTextForTarget(input: FullDraftInput) {
    const target = this.targetLengthNumber(input);

    return Math.max(1800, Math.round(target * 0.7));
  }

  private joinUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/u, "")}/${path.replace(/^\/+/u, "")}`;
  }

  private requestTimeoutMs() {
    const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS);

    return Number.isFinite(configured) && configured >= 10000 ? configured : 60000;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
  }

  private friendlyErrorMessage(error: unknown) {
    const message = this.errorMessage(error);

    if (/engine_overloaded|overloaded|429|too many requests|rate[_ -]?limit/iu.test(message)) {
      return "Kimi 当前模型过载或限流，属于服务端繁忙；不是你的内容或提示词本身错误";
    }

    if (/invalid temperature/iu.test(message)) {
      return "Kimi 拒绝了当前温度参数；Kimi K2 需要使用兼容参数";
    }

    if (/401|unauthorized|invalid api key|api key/iu.test(message)) {
      return "Kimi API Key 无效、过期或没有正确加载";
    }

    if (/insufficient|quota|balance|余额|额度/iu.test(message)) {
      return "Kimi 额度或账户余额不足";
    }

    if (/aborted|abort|timeout|timed out/iu.test(message)) {
      return "Kimi 响应超时，通常是模型排队、网络慢或请求过大";
    }

    return message;
  }

  private isRetryableAiError(error: unknown) {
    const message = this.errorMessage(error);

    return /engine_overloaded|overloaded|429|too many requests|rate[_ -]?limit|502|503|504|fetch failed|ECONNRESET/iu.test(message);
  }

  private retryDelayMs(attempt: number) {
    return 900 + attempt * 1400;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
