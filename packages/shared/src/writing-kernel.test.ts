import { describe, expect, it } from "vitest";
import { assembleStoryDraft, enforceStoryWorkflow, generateStoryPlan, reviseSceneDraft, rewriteMarkedText, validateStoryWorkflow } from "./writing-kernel";

describe("writing kernel", () => {
  it("generates a staged short-story plan", () => {
    const plan = generateStoryPlan({ inspiration: "一个被全家嫌弃的女孩，其实是失踪多年的豪门真千金。" });

    expect(plan.topicCards).toHaveLength(3);
    expect(plan.sceneCards).toHaveLength(6);
    expect(plan.scenePrompts).toHaveLength(6);
    expect(plan.sceneDrafts).toHaveLength(6);
    expect(plan.scenePrompts[0].writingPrompt).toContain("第 1 场");
    expect(plan.draft).toContain("【场景1");
    expect(plan.draft).toBe(assembleStoryDraft(plan.sceneDrafts));
    expect(plan.sceneDrafts[0].text).toContain("缴费单");
    expect(plan.sceneDrafts[0].readerNotes.length).toBeGreaterThan(0);
    expect(plan.draft.replace(/\s+/g, "").length).toBeGreaterThan(2500);
    expect(plan.readerReport.platformFitScore).toBeGreaterThan(80);
    expect(plan.qualityReport?.overallScore).toBeGreaterThan(70);
    expect(plan.qualityReport?.checks.map((check) => check.label)).toEqual(["开头钩子", "中段拖沓", "信息差回收", "场景推进", "套路化风险", "结尾后劲"]);
    expect(plan.qualityReport?.guardrails[0]).toContain("AI 生成内容仅供创作参考");
    expect(plan.originalityReport?.originalityScore).toBeGreaterThan(70);
    expect(plan.originalityReport?.checks.map((check) => check.label)).toEqual([
      "题材套路距离",
      "人物与关系原创度",
      "关键桥段替换",
      "信息差原创空间",
      "水文与空话风险"
    ]);
    expect(plan.originalityReport?.learningPoints[0]).toContain("可以学习");
    expect(plan.originalityReport?.avoidCopyPoints[0]).toContain("不要");
    expect(plan.continuityMemory?.characterMemories).toHaveLength(3);
    expect(plan.continuityMemory?.sceneMemories).toHaveLength(6);
    expect(plan.continuityMemory?.nextWritingNotes[0]).toContain("单场重写后");
    expect(plan.learningBasis?.evidenceCards.map((card) => card.sourceType)).toEqual(["user_requirement", "platform_trend"]);
    expect(plan.learningBasis?.mustApply.join(" ")).toContain("主角主动完成");
    expect(plan.learningBasis?.avoid.join(" ")).toContain("不要复制热门作品原文");
    expect(validateStoryWorkflow(plan).ok).toBe(true);
    expect(plan.agentTrace).toHaveLength(10);
    expect(plan.agentTrace?.map((step) => step.agent)).toEqual([
      "主控 Agent",
      "风向分析 Agent",
      "选题 Agent",
      "结构 Agent",
      "场景卡 Agent",
      "提示词 Agent",
      "正文 Agent",
      "测试读者 Agent",
      "编辑改稿 Agent",
      "复盘沉淀 Agent"
    ]);
    expect(plan.agentTrace?.find((step) => step.agent === "正文 Agent")?.input).toContain("场景提示词");
    expect(plan.agentTrace?.find((step) => step.agent === "编辑改稿 Agent")?.output).toContain("修订建议");
  });

  it("repairs plans that try to bypass the scene-by-scene draft contract", () => {
    const plan = generateStoryPlan();
    const brokenPlan = {
      ...plan,
      draft: "这里是一版和分场正文不一致的整篇正文。",
      scenePrompts: plan.scenePrompts.slice(1),
      qualityReport: undefined,
      originalityReport: undefined,
      continuityMemory: undefined,
      sceneDrafts: plan.sceneDrafts.map((scene, index) => ({
        ...scene,
        sceneId: index === 0 ? "wrong-scene-id" : scene.sceneId
      })),
      agentTrace: []
    };

    expect(validateStoryWorkflow(brokenPlan).ok).toBe(false);

    const repaired = enforceStoryWorkflow(brokenPlan, plan);

    expect(repaired.draft).toBe(assembleStoryDraft(repaired.sceneDrafts));
    expect(repaired.scenePrompts).toHaveLength(repaired.sceneCards.length);
    expect(repaired.sceneDrafts[0].sceneId).toBe(repaired.sceneCards[0].id);
    expect(repaired.agentTrace?.map((step) => step.agent)).toEqual([
      "主控 Agent",
      "风向分析 Agent",
      "选题 Agent",
      "结构 Agent",
      "场景卡 Agent",
      "提示词 Agent",
      "正文 Agent",
      "测试读者 Agent",
      "编辑改稿 Agent",
      "复盘沉淀 Agent"
    ]);
    expect(repaired.qualityReport?.checks.length).toBe(6);
    expect(repaired.originalityReport?.checks.length).toBe(5);
    expect(repaired.continuityMemory?.sceneMemories.length).toBe(6);
    expect(validateStoryWorkflow(repaired).ok).toBe(true);
  });

  it("uses writing memory hints when provided", () => {
    const plan = generateStoryPlan({
      genre: "女性成长",
      memoryHints: [
        {
          id: "memory-test",
          sourceType: "review",
          genre: "女性成长",
          rule: "反击必须由主角亲手完成",
          positiveExample: "她自己公开证据后，把旧钥匙收进抽屉。",
          negativeExample: "突然出现外部强者替她解决一切。",
          confidence: 90,
          matchReason: "召回分 120：题材精确匹配、关键词命中「反击」"
        }
      ]
    });

    expect(plan.memoryUsed?.[0]).toContain("反击必须由主角亲手完成");
    expect(plan.memoryUsed?.[0]).toContain("召回分 120");
    expect(plan.learningBasis?.evidenceCards.some((card) => card.sourceType === "review_memory" && card.detail.includes("反击必须由主角亲手完成"))).toBe(true);
    expect(plan.learningBasis?.evidenceCards.some((card) => card.sourceType === "review_memory" && card.weightLabel === "复盘优先")).toBe(true);
    expect(plan.learningBasis?.mustApply.join(" ")).toContain("反击必须由主角亲手完成");
    expect(plan.learningBasis?.avoid.join(" ")).toContain("外部强者替她解决一切");
    expect(plan.topicJudgement).toContain("个人经验");
    expect(plan.readerReport.suggestions[0]).toContain("复盘记忆");
  });

  it("uses personal strategy hints when provided", () => {
    const plan = generateStoryPlan({
      genre: "女性成长",
      strategyHints: [
        {
          id: "strategy-test",
          sourceType: "review",
          genre: "女性成长",
          rule: "开头必须用一个具体物件承压",
          evidence: "带物件钩子的作品完读更高。",
          action: "把物件钩子写进第一场",
          confidence: 88
        }
      ]
    });

    expect(plan.memoryUsed?.[0]).toContain("开头必须用一个具体物件承压");
    expect(plan.learningBasis?.evidenceCards.some((card) => card.sourceType === "review_strategy" && card.detail.includes("把物件钩子写进第一场"))).toBe(true);
    expect(plan.learningBasis?.evidenceCards.some((card) => card.sourceType === "review_strategy" && card.weightLabel === "复盘优先")).toBe(true);
    expect(plan.agentSteps).toContain("个人策略库 Agent 注入复盘策略");
    expect(plan.readerReport.suggestions[0]).toContain("复盘策略");
  });

  it("shows user-authorized platform learning as creation basis", () => {
    const plan = generateStoryPlan({
      genre: "女性成长",
      inspiration: "县城女孩在亲情冲突里完成克制反击。",
      memoryHints: [
        {
          id: "platform-memory-test",
          sourceType: "platform_result",
          genre: "女性成长",
          rule: "平台表现记忆：女性成长读者对克制反击反馈更稳定",
          positiveExample: "克制反击、亲情冲突、现实质感",
          negativeExample: "中段节奏拖慢，无效铺垫太多",
          confidence: 91
        }
      ],
      strategyHints: [
        {
          id: "platform-strategy-test",
          sourceType: "platform_result",
          genre: "女性成长",
          rule: "下一篇女性成长优先验证克制反击",
          evidence: "后台反馈提到中段节奏慢，需要减少无效铺垫",
          action: "把中段节奏拖慢列为发布前检查项",
          confidence: 88
        }
      ]
    });

    const authorizedCards = plan.learningBasis?.evidenceCards.filter((card) => card.sourceType === "user_authorized_data") ?? [];

    expect(authorizedCards).toHaveLength(2);
    expect(authorizedCards.map((card) => card.title).join(" ")).toContain("用户授权后台");
    expect(plan.learningBasis?.sourceSummary).toContain("用户授权后台经验");
    expect(plan.learningBasis?.sourceSummary).toContain("合格授权数据会优先于普通公开趋势");
    expect(plan.learningBasis?.mustApply.join(" ")).toContain("克制反击");
    expect(plan.learningBasis?.avoid.join(" ")).toContain("中段节奏拖慢");
    expect(authorizedCards.every((card) => card.weightLabel === "授权数据优先")).toBe(true);
    expect(authorizedCards.every((card) => card.qualityLabel?.includes("授权"))).toBe(true);
    expect(plan.learningBasis?.stageInfluences?.find((stage) => stage.stage === "选题卡")?.sourceTypes[0]).toBe("user_authorized_data");
    expect(plan.learningBasis?.stageInfluences?.find((stage) => stage.stage === "场景卡")?.summary).toContain("授权数据");
    expect(plan.agentTrace?.find((step) => step.agent === "主控 Agent")?.output).toContain("不直接黑盒写完整正文");
    expect(plan.agentTrace?.find((step) => step.agent === "正文 Agent")?.output).toContain("不跳过场景直接生成全文");
  });

  it("adapts the local fallback story world to the requested genre", () => {
    const plan = generateStoryPlan({
      genre: "悬疑惊悚",
      protagonist: "夜班档案员",
      emotion: "反转",
      inspiration: "一个旧小区夜里响起第三声敲门，但监控里没有人。"
    });

    expect(plan.title).toContain("第三声敲门");
    expect(plan.genre).toBe("悬疑惊悚");
    expect(plan.topicJudgement).toContain("门禁记录");
    expect(plan.characters.map((character) => character.name)).toContain("许知晚");
    expect(plan.sceneCards.flatMap((scene) => scene.relatedForeshadows)).toEqual(expect.arrayContaining(["门禁记录", "录音笔", "旧监控"]));
    expect(plan.draft).toContain("门禁记录");
    expect(plan.readerReport.suggestions[0]).toContain("门禁记录");
    expect(plan.draft).toBe(assembleStoryDraft(plan.sceneDrafts));
    expect(validateStoryWorkflow(plan).ok).toBe(true);
  });

  it("creates a rewrite suggestion for a marked passage", () => {
    const suggestion = rewriteMarkedText("mark-1", "她终于抬起头。", "降低狗血感");

    expect(suggestion.markId).toBe("mark-1");
    expect(suggestion.newText).toContain("她终于抬起头");
    expect(suggestion.memoryImpact.length).toBeGreaterThan(0);
  });

  it("revises one scene draft without changing its identity", () => {
    const plan = generateStoryPlan();
    const revised = reviseSceneDraft({
      sceneDraft: plan.sceneDrafts[0],
      scenePrompt: plan.scenePrompts[0],
      feedback: "强化开头的物件压力"
    });

    expect(revised.sceneId).toBe(plan.sceneDrafts[0].sceneId);
    expect(revised.text).toContain("强化开头的物件压力");
    expect(revised.qualityScore).toBeGreaterThan(plan.sceneDrafts[0].qualityScore);
    expect(revised.changeNotes.length).toBeGreaterThan(0);
  });
});
