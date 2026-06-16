import { Injectable } from "@nestjs/common";
import {
  createAgentTrace,
  enforceStoryWorkflow,
  generateStoryPlan,
  reviseSceneDraft,
  rewriteMarkedText,
  validateStoryWorkflow,
  type GeneratePlanInput,
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

    if (!this.canUseOpenAI()) {
      return mockPlan;
    }

    try {
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
          providerMode: "openai",
          providerNotice: `已使用真实 OpenAI 模型：${this.modelName()}`,
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
        providerNotice: `已使用真实 OpenAI 模型：${this.modelName()}；结果已按选题卡→结构→场景→提示词→分场正文→测试读者的顺序校验。`
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

    if (!this.canUseOpenAI()) {
      return mockSuggestion;
    }

    try {
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
        providerMode: "openai",
        providerNotice: `已使用真实 OpenAI 模型：${this.modelName()}`
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

    if (!this.canUseOpenAI()) {
      return mockRevision;
    }

    try {
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
        providerMode: "openai",
        providerNotice: `已使用真实 OpenAI 模型：${this.modelName()}`
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
    providerMode: "openai" | "mock" | "fallback";
    providerNotice: string;
    recognizedText: string;
  }> {
    if (!this.canUseOpenAI()) {
      return {
        providerMode: "mock",
        providerNotice: "还没有配置 OPENAI_API_KEY，截图已保存，暂时需要手动填写截图文字。",
        recognizedText: ""
      };
    }

    try {
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
        providerMode: "openai",
        providerNotice: `已使用真实 OpenAI 模型识别截图：${this.modelName()}`,
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
    return {
      provider: process.env.AI_PROVIDER ?? "openai",
      mode: this.canUseOpenAI() ? "openai" : "mock",
      model: this.modelName(),
      embeddingModel: this.embeddingModelName(),
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      message: this.canUseOpenAI()
        ? "已检测到 OPENAI_API_KEY，写作接口会优先尝试真实 AI。"
        : "还没有检测到 OPENAI_API_KEY，写作接口会使用本地模拟内核。"
    };
  }

  async testConnection() {
    if (!this.canUseOpenAI()) {
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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
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

  private canUseOpenAI() {
    return (process.env.AI_PROVIDER ?? "openai") === "openai" && Boolean(process.env.OPENAI_API_KEY);
  }

  private modelName() {
    return process.env.OPENAI_TEXT_MODEL ?? "gpt-5.2";
  }

  private embeddingModelName() {
    return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
  }
}
