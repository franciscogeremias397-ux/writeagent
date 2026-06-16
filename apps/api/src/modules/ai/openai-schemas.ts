export const storyPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "source",
    "platform",
    "genre",
    "topicJudgement",
    "topicCards",
    "selectedTopic",
    "emotionalCurve",
    "conflictLadder",
    "informationGap",
    "characters",
    "sceneCards",
    "scenePrompts",
    "sceneDrafts",
    "synopsis",
    "tags",
    "draft",
    "readerReport",
    "agentSteps"
  ],
  properties: {
    title: { type: "string" },
    source: { type: "string" },
    platform: { type: "string" },
    genre: { type: "string" },
    topicJudgement: { type: "string" },
    topicCards: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "hook",
          "platform",
          "genre",
          "reader",
          "protagonist",
          "conflict",
          "emotion",
          "reversal",
          "length",
          "fitScore",
          "samenessRisk",
          "originalitySpace",
          "recommendationScore"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          hook: { type: "string" },
          platform: { type: "string" },
          genre: { type: "string" },
          reader: { type: "string" },
          protagonist: { type: "string" },
          conflict: { type: "string" },
          emotion: { type: "string" },
          reversal: { type: "string" },
          length: { type: "string" },
          fitScore: { type: "number" },
          samenessRisk: { type: "string", enum: ["低", "中", "高"] },
          originalitySpace: { type: "string" },
          recommendationScore: { type: "number" }
        }
      }
    },
    selectedTopic: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "title",
        "hook",
        "platform",
        "genre",
        "reader",
        "protagonist",
        "conflict",
        "emotion",
        "reversal",
        "length",
        "fitScore",
        "samenessRisk",
        "originalitySpace",
        "recommendationScore"
      ],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        hook: { type: "string" },
        platform: { type: "string" },
        genre: { type: "string" },
        reader: { type: "string" },
        protagonist: { type: "string" },
        conflict: { type: "string" },
        emotion: { type: "string" },
        reversal: { type: "string" },
        length: { type: "string" },
        fitScore: { type: "number" },
        samenessRisk: { type: "string", enum: ["低", "中", "高"] },
        originalitySpace: { type: "string" },
        recommendationScore: { type: "number" }
      }
    },
    emotionalCurve: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "emotion", "scene", "readerExpectation", "releasePoint"],
        properties: {
          stage: { type: "string" },
          emotion: { type: "string" },
          scene: { type: "string" },
          readerExpectation: { type: "string" },
          releasePoint: { type: "string" }
        }
      }
    },
    conflictLadder: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "event", "parties", "cost", "purpose"],
        properties: {
          level: { type: "number" },
          event: { type: "string" },
          parties: { type: "string" },
          cost: { type: "string" },
          purpose: { type: "string" }
        }
      }
    },
    informationGap: {
      type: "object",
      additionalProperties: false,
      required: ["readerKnows", "protagonistKnows", "antagonistMisses", "revealTiming", "payoff"],
      properties: {
        readerKnows: { type: "string" },
        protagonistKnows: { type: "string" },
        antagonistMisses: { type: "string" },
        revealTiming: { type: "string" },
        payoff: { type: "string" }
      }
    },
    characters: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "role", "personality", "background", "desire", "fear", "relationNotes"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          personality: { type: "string" },
          background: { type: "string" },
          desire: { type: "string" },
          fear: { type: "string" },
          relationNotes: { type: "string" }
        }
      }
    },
    sceneCards: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "index",
          "title",
          "goal",
          "protagonistWant",
          "obstacle",
          "conflictUpgrade",
          "informationGap",
          "emotion",
          "keyAction",
          "keyDialogue",
          "hook",
          "estimatedWords",
          "relatedCharacters",
          "relatedForeshadows"
        ],
        properties: {
          id: { type: "string" },
          index: { type: "number" },
          title: { type: "string" },
          goal: { type: "string" },
          protagonistWant: { type: "string" },
          obstacle: { type: "string" },
          conflictUpgrade: { type: "string" },
          informationGap: { type: "string" },
          emotion: { type: "string" },
          keyAction: { type: "string" },
          keyDialogue: { type: "string" },
          hook: { type: "string" },
          estimatedWords: { type: "number" },
          relatedCharacters: { type: "array", items: { type: "string" } },
          relatedForeshadows: { type: "array", items: { type: "string" } }
        }
      }
    },
    scenePrompts: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sceneId", "index", "title", "objective", "context", "writingPrompt", "mustInclude", "avoid"],
        properties: {
          id: { type: "string" },
          sceneId: { type: "string" },
          index: { type: "number" },
          title: { type: "string" },
          objective: { type: "string" },
          context: { type: "string" },
          writingPrompt: { type: "string" },
          mustInclude: { type: "array", items: { type: "string" } },
          avoid: { type: "array", items: { type: "string" } }
        }
      }
    },
    sceneDrafts: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sceneId", "index", "title", "wordTarget", "text", "qualityScore", "readerNotes", "revisionFocus"],
        properties: {
          id: { type: "string" },
          sceneId: { type: "string" },
          index: { type: "number" },
          title: { type: "string" },
          wordTarget: { type: "number" },
          text: { type: "string" },
          qualityScore: { type: "number" },
          readerNotes: { type: "array", items: { type: "string" } },
          revisionFocus: { type: "string" }
        }
      }
    },
    synopsis: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    draft: { type: "string" },
    readerReport: {
      type: "object",
      additionalProperties: false,
      required: [
        "openingScore",
        "empathyScore",
        "emotionScore",
        "reversalScore",
        "closureScore",
        "platformFitScore",
        "samenessRisk",
        "problems",
        "suggestions"
      ],
      properties: {
        openingScore: { type: "number" },
        empathyScore: { type: "number" },
        emotionScore: { type: "number" },
        reversalScore: { type: "number" },
        closureScore: { type: "number" },
        platformFitScore: { type: "number" },
        samenessRisk: { type: "string", enum: ["低", "中", "高"] },
        problems: { type: "array", items: { type: "string" } },
        suggestions: { type: "array", items: { type: "string" } }
      }
    },
    agentSteps: { type: "array", items: { type: "string" } }
  }
} as const;

export const rewriteJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["understanding", "strategy", "newText", "changeNotes", "memoryImpact"],
  properties: {
    understanding: { type: "string" },
    strategy: { type: "string" },
    newText: { type: "string" },
    changeNotes: { type: "string" },
    memoryImpact: { type: "array", items: { type: "string" } }
  }
} as const;

export const sceneDraftRevisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "sceneId", "index", "title", "wordTarget", "text", "qualityScore", "readerNotes", "revisionFocus", "changeNotes"],
  properties: {
    id: { type: "string" },
    sceneId: { type: "string" },
    index: { type: "number" },
    title: { type: "string" },
    wordTarget: { type: "number" },
    text: { type: "string" },
    qualityScore: { type: "number" },
    readerNotes: { type: "array", items: { type: "string" } },
    revisionFocus: { type: "string" },
    changeNotes: { type: "array", items: { type: "string" } }
  }
} as const;
