import type { Trend, Work, WritingMemory } from "./types";

export const navItems = [
  "首页",
  "灵感写作",
  "自动写作",
  "风向标",
  "作品专栏",
  "正文编辑器",
  "数据看板",
  "复盘分析",
  "写作记忆库",
  "数据源管理",
  "设置中心"
] as const;

export const trends: Trend[] = [
  {
    id: "trend-1",
    platform: "番茄短故事",
    genre: "女性成长",
    heat: 96.5,
    growthRate: 12.4,
    opportunityScore: 91,
    saturationScore: 48,
    reason: "亲情冲突、职场反击和县城生活细节的组合仍有稳定读者反馈。",
    tags: ["现实女性", "亲情冲突", "反击"],
    createdAt: "2026-06-07"
  },
  {
    id: "trend-2",
    platform: "番茄短故事",
    genre: "悬疑惊悚",
    heat: 93.1,
    growthRate: 8.6,
    opportunityScore: 88,
    saturationScore: 62,
    reason: "短篇里强钩子和反转结尾更容易被读完，但同质化标题要避开。",
    tags: ["强钩子", "身份反转", "密室感"],
    createdAt: "2026-06-07"
  },
  {
    id: "trend-3",
    platform: "番茄短故事",
    genre: "宫斗宅斗",
    heat: 91.7,
    growthRate: 6.3,
    opportunityScore: 84,
    saturationScore: 70,
    reason: "老赛道仍有基础盘，短篇更适合单线冲突和一处高质量反转。",
    tags: ["宅斗", "身份差", "克制反杀"],
    createdAt: "2026-06-07"
  },
  {
    id: "trend-4",
    platform: "番茄短故事",
    genre: "现言甜宠",
    heat: 90.2,
    growthRate: 4.9,
    opportunityScore: 79,
    saturationScore: 76,
    reason: "甜宠仍有阅读惯性，但需要更具体的职业、地域和人物缺陷。",
    tags: ["轻甜", "误会解除", "职业细节"],
    createdAt: "2026-06-07"
  },
  {
    id: "trend-5",
    platform: "番茄小说",
    genre: "男频脑洞",
    heat: 89.6,
    growthRate: 9.1,
    opportunityScore: 82,
    saturationScore: 67,
    reason: "设定奇观有效，但短篇里必须尽快给出规则和代价。",
    tags: ["规则怪谈", "逆袭", "设定流"],
    createdAt: "2026-06-07"
  }
];

export const works: Work[] = [
  {
    id: "work-1",
    title: "她在废墟上开花",
    cover: "/assets/work-cover-1.svg",
    status: "published",
    platform: "番茄短故事",
    genreTags: ["女性成长", "亲情冲突"],
    styleTags: ["现实质感", "克制反击"],
    wordCount: 12400,
    summary: "被全家忽视的县城女孩在一次意外中发现身世真相，却选择先救自己。",
    readCount: 1268000,
    subscriptionCount: 48100,
    revenue: 412.56,
    completionRate: 68.7,
    updatedAt: "2026-06-06",
    createdAt: "2026-05-20"
  },
  {
    id: "work-2",
    title: "雾灯之后",
    cover: "/assets/work-cover-2.svg",
    status: "draft",
    platform: "番茄短故事",
    genreTags: ["悬疑惊悚", "身份反转"],
    styleTags: ["电影感", "强钩子"],
    wordCount: 8700,
    summary: "失踪案唯一目击者回到旧镇，发现所有人都在替她记住另一段人生。",
    readCount: 0,
    subscriptionCount: 0,
    revenue: 0,
    completionRate: 0,
    updatedAt: "2026-06-07",
    createdAt: "2026-06-05"
  },
  {
    id: "work-3",
    title: "月亮照进早餐店",
    cover: "/assets/work-cover-3.svg",
    status: "serializing",
    platform: "番茄短故事",
    genreTags: ["现实情感", "小人物逆袭"],
    styleTags: ["口语化", "人味细节"],
    wordCount: 15300,
    summary: "离婚后的女人回到县城开早餐店，靠一碗热汤重新找回生活的秩序。",
    readCount: 543000,
    subscriptionCount: 17900,
    revenue: 128.72,
    completionRate: 61.3,
    updatedAt: "2026-06-04",
    createdAt: "2026-05-29"
  }
];

export const writingMemories: WritingMemory[] = [
  {
    id: "memory-1",
    sourceType: "review",
    genre: "女性成长",
    rule: "现实女性题材里，反击最好由主角主动完成，不要完全靠外部身份救场。",
    positiveExample: "主角先争取证据和资源，再让真相公开。",
    negativeExample: "结尾突然出现豪门亲人替主角解决一切。",
    confidence: 86,
    relatedWorkIds: ["work-1"],
    enabled: true,
    createdAt: "2026-06-01",
    updatedAt: "2026-06-06"
  },
  {
    id: "memory-2",
    sourceType: "reader_report",
    genre: "悬疑惊悚",
    rule: "开头 300 字内要出现不可解释的异常，同时给读者一个可追的问题。",
    positiveExample: "主角收到一条来自自己旧号码的短信。",
    negativeExample: "连续铺背景，第三页才出现事件。",
    confidence: 78,
    relatedWorkIds: ["work-2"],
    enabled: true,
    createdAt: "2026-06-05",
    updatedAt: "2026-06-07"
  }
];

export const weeklyTrendPoints = [
  { day: "06-01", 女性成长: 82, 悬疑惊悚: 74, 现言甜宠: 78 },
  { day: "06-02", 女性成长: 88, 悬疑惊悚: 79, 现言甜宠: 76 },
  { day: "06-03", 女性成长: 86, 悬疑惊悚: 83, 现言甜宠: 80 },
  { day: "06-04", 女性成长: 91, 悬疑惊悚: 85, 现言甜宠: 78 },
  { day: "06-05", 女性成长: 89, 悬疑惊悚: 90, 现言甜宠: 81 },
  { day: "06-06", 女性成长: 94, 悬疑惊悚: 88, 现言甜宠: 84 },
  { day: "06-07", 女性成长: 97, 悬疑惊悚: 93, 现言甜宠: 90 }
];

export const todayIdeas = [
  "一个被全家嫌弃的女孩，其实不是没人要，而是她一直替真正的继承人挡灾。",
  "县城早餐店老板娘收到一张十年前的欠条，发现债主其实在替她守一个秘密。",
  "失踪多年的姐姐突然回家，却只记得妹妹写过的小说结局。",
  "一个短剧剪辑师总能提前刷到明天会爆的热搜，代价是每次都忘掉一个亲人。",
  "被迫替人相亲的女孩发现，对方手里拿着她小时候丢失的日记。"
] as const;

export const todayIdea = todayIdeas[0];
