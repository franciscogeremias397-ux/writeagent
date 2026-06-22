import { Injectable } from "@nestjs/common";
import {
  createAgentTrace,
  enforceStoryWorkflow,
  generateStoryPlan,
  reviseSceneDraft,
  rewriteMarkedText,
  validateStoryWorkflow,
  type GeneratePlanInput,
  type AiProviderMode,
  type ReviseSceneDraftInput,
  type SceneDraftRevision,
  type RewriteSuggestion,
  type StoryPlan
} from "@shenbi/shared";
import { rewriteJsonSchema, sceneDraftRevisionJsonSchema, storyPlanJsonSchema } from "./openai-schemas.js";

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
  temperature?: number;
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
  baseUrlEnv: string;
  defaultTextModel: string;
  defaultBaseUrl: string;
  endpoint: "responses" | "chat_completions";
  supportsVision: boolean;
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
    baseUrlEnv: "KIMI_BASE_URL",
    defaultTextModel: "kimi-k2.6",
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
      baseUrl: this.baseUrl(),
      embeddingModel: this.embeddingModelName(),
      hasApiKey,
      apiKeyEnv: provider.apiKeyEnv,
      message: hasApiKey
        ? `已检测到 ${provider.apiKeyEnv}，写作接口会优先尝试 ${provider.label}。`
        : `还没有检测到 ${provider.apiKeyEnv}，写作接口会使用本地模拟内核。`
    };
  }

  listProviders() {
    return Object.values(AI_PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      defaultTextModel: provider.defaultTextModel,
      defaultBaseUrl: provider.defaultBaseUrl,
      apiKeyEnv: provider.apiKeyEnv,
      textModelEnv: provider.textModelEnv,
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

  private async createStructuredOutput<T>(input: OpenAIRequest["input"], name: string, schema: unknown): Promise<T> {
    const provider = this.activeProvider();

    if (provider.endpoint === "chat_completions") {
      return this.createChatStructuredOutput<T>(input, name, provider);
    }

    const request: OpenAIRequest = {
      model: this.modelName(),
      input,
      text: {
        format: {
          type: "json_schema",
          name,
          schema,
          strict: false
        }
      }
    };

    const response = await fetch(this.joinUrl(this.baseUrl(), "responses"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey()}`
      },
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

  private async createChatStructuredOutput<T>(input: OpenAIRequest["input"], name: string, provider: ProviderConfig): Promise<T> {
    if (this.containsImageInput(input) && !provider.supportsVision) {
      throw new Error(`${provider.label} 当前配置不支持图片输入。`);
    }

    const request: ChatCompletionRequest = {
      model: this.modelName(),
      messages: this.toChatMessages(input, name),
      response_format: {
        type: "json_object"
      },
      temperature: this.temperatureForProvider(provider)
    };

    const response = await fetch(this.joinUrl(this.baseUrl(), "chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey()}`
      },
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

  private modelName() {
    const provider = this.activeProvider();

    return process.env[provider.textModelEnv] ?? provider.defaultTextModel;
  }

  private embeddingModelName() {
    return this.activeProvider().id === "openai" ? (process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small") : "本地轻量索引";
  }

  private baseUrl() {
    const provider = this.activeProvider();

    return process.env[provider.baseUrlEnv] ?? provider.defaultBaseUrl;
  }

  private apiKey() {
    const provider = this.activeProvider();

    return process.env[provider.apiKeyEnv];
  }

  private activeProvider() {
    const providerId = process.env.AI_PROVIDER;

    if (providerId === "kimi" || providerId === "deepseek" || providerId === "openai") {
      return AI_PROVIDERS[providerId];
    }

    return AI_PROVIDERS.openai;
  }

  private temperatureForProvider(provider: ProviderConfig) {
    const model = this.modelName().toLowerCase();

    if (provider.id === "kimi" && model.startsWith("kimi-k2")) {
      return 1;
    }

    return 0.6;
  }

  private joinUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/u, "")}/${path.replace(/^\/+/u, "")}`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
  }
}
