import type {
  AgentTraceStep,
  CharacterCard,
  ConflictStep,
  EmotionalBeat,
  FullDraftAiResult,
  FullDraftInput,
  InformationGap,
  PersonalStrategy,
  ReaderReport,
  ReviseSceneDraftInput,
  RewriteSuggestion,
  SceneCard,
  SceneDraft,
  SceneDraftRevision,
  ScenePrompt,
  StoryOutlineInput,
  StoryOutlineResult,
  StoryContinuityMemory,
  StoryLearningBasis,
  StoryOriginalityCheck,
  StoryOriginalityReport,
  StoryQualityCheck,
  StoryQualityReport,
  StoryPlan,
  TopicCard,
  WritingMemory
} from "./types";

const agentSteps = [
  "主控 Agent 判断任务",
  "风向分析 Agent 匹配赛道",
  "选题 Agent 生成选题卡",
  "结构 Agent 设计情绪曲线",
  "场景卡 Agent 拆分场景",
  "提示词 Agent 组装写作提示",
  "正文 Agent 分段生成草稿",
  "测试读者 Agent 评审",
  "编辑改稿 Agent 生成修订建议",
  "复盘沉淀 Agent 写入记忆"
];

export const storyWorkflowAgentOrder = [
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
];

export type GeneratePlanInput = {
  inspiration?: string;
  platform?: string;
  genre?: string;
  length?: string;
  emotion?: string;
  protagonist?: string;
  ending?: string;
  style?: string;
  mode?: string;
  selectedTopicId?: string;
  memoryHints?: Array<
    Pick<WritingMemory, "id" | "sourceType" | "genre" | "rule" | "positiveExample" | "negativeExample" | "confidence"> & {
      matchScore?: number;
      matchReason?: string;
    }
  >;
  strategyHints?: Array<
    Pick<PersonalStrategy, "id" | "sourceType" | "genre" | "rule" | "evidence" | "action" | "confidence"> & {
      matchScore?: number;
      matchReason?: string;
    }
  >;
};

const fallbackInspiration = "一个普通女孩在亲情误解里发现自己的真正价值，并用克制的方式完成反击。";

export function generateStoryOutlineMock(input: StoryOutlineInput = { mode: "autopilot" }): StoryOutlineResult {
  const inspiration = input.inspiration?.trim() || "一个普通人从被动承受开始，抓住一次被忽视的证据，完成克制反击。";
  const direction = input.optionalDirection?.trim() || (input.mode === "autopilot" ? "现实情感反转" : "现实强冲突短篇");
  const previousCount = input.previousOutlines?.length ?? 0;
  const title = /病历|保险|丈夫/u.test(inspiration) ? "病历复印件" : previousCount ? "雨夜证词" : "雨夜留证";
  const outline = [
    `这是一个面向番茄短故事的${direction}。`,
    "主角一开始处在亲密关系或家庭关系里的被动位置，发现一条被别人低估的证据，意识到自己不是被误会，而是被人有计划地利用。",
    "故事前段用具体异常制造点击欲，中段让主角用证据链一步步夺回主动权，后段把冲突推到公开场合，让对方无法再用情绪和关系压制她。",
    "结尾不靠外部英雄救场，而是落在主角重新掌控自己人生和资料的情绪爽点上。"
  ].join("");

  return {
    title,
    direction,
    outline: outline.slice(0, 500),
    highlights: ["前 300 字给出强异常和明确代价", "中段用证据推进，不靠吵架水字数", "结尾回收控制权，形成现实爽感"],
    marketReason: `围绕“${inspiration.slice(0, 36)}”提炼平台读者容易理解的冲突、反转和情绪回收。`,
    providerMode: "mock",
    providerNotice: "当前为本地故事方案兜底，用于验证方案确认和全文生成链路。"
  };
}

export function generateFullDraftMock(input: FullDraftInput = { mode: "autopilot" }): FullDraftAiResult {
  const inspiration = input.inspiration?.trim() || "一个普通人从被动承受开始，抓住一次被忽视的证据，完成克制反击。";
  const approvedOutline = input.approvedOutline;
  const direction = approvedOutline?.direction?.trim() || input.optionalDirection?.trim() || (input.mode === "autopilot" ? "现实情感反转" : "现实强冲突短篇");
  const targetLength = input.targetLength && input.targetLength !== "auto" ? `${input.targetLength} 字` : "约 2 万字完整短篇";
  const avoidNotes = normalizeAvoidList(input.avoid);
  const title = approvedOutline?.title?.trim() || (/病历|保险|丈夫/u.test(inspiration) ? "病历复印件" : "雨夜留证");
  const content = [
    "我从医院回来的那天，丈夫周明把厨房擦得太干净了。灶台没有一点油星，垃圾袋换成新的，连我昨晚放在玄关的病历袋也不见了。",
    "他端着一碗汤出来，语气温和得像背过稿：“医生怎么说？别胡思乱想，先把身体养好。”",
    "我看着那碗汤，没有接。手机里，保险公司客服刚刚发来一条确认短信：感谢您补充被保险人近期病理资料，理赔评估将在三个工作日内完成。",
    "被保险人是我。补充资料的人，却不是我。",
    "周明的手顿了一下，汤面晃出细小的波纹。他很快笑了：“现在骗子短信多，你别当真。”",
    "我也笑：“是吗？那你手机借我报个警。”",
    "屋里安静下来。窗外下着小雨，楼道感应灯亮了又灭。结婚三年，我第一次发现，一个人心虚的时候，连呼吸都会变轻。",
    "周明没有把手机给我。他说公司有急事，转身要走。我拦在门口，手里捏着从物业打印室取回来的监控截图。昨天下午三点十六分，他拿着我的病历袋，进了小区门口那家复印店。",
    "他脸上的温柔终于裂开：“林夏，你非要闹得这么难看吗？”",
    "我说：“把我的病历卖给保险公司时，你怎么没嫌难看？”",
    "他沉默两秒，忽然低声笑了：“你以为你现在还能做什么？病历是真的，签字也是你以前授权过的。公司只认材料，不认眼泪。”",
    "这句话让我彻底冷静下来。原来他不是一时糊涂，他连我会怎么反抗都算过了。",
    "我没有吵，也没有哭。我打开门，让他走。周明以为自己赢了，临出门前甚至替我把汤放回餐桌，说：“别任性，过两天我回来接你去复查。”",
    "门关上的瞬间，我拨通了另一个号码。电话那头，是那家保险公司的合规投诉专线。半小时前，我已经把复印店老板的收款记录、监控截图、短信截图，以及周明用我旧授权书伪造补充提交的时间线整理成了邮件。",
    "客服问我是否确认实名投诉。我说确认。",
    "第二天上午，周明的部门经理先给我打电话。他声音客气，问我和周明是不是有什么误会。我把邮件抄送给他，只回了一句：如果这是误会，请贵司出具数据调取记录。",
    "下午，周明回来了。他没带钥匙，站在门外敲了很久。那时我正在收拾行李，桌上放着离婚协议和警方受案回执。",
    "他在门外说：“林夏，我只是怕以后压力太大。我也是为这个家考虑。”",
    "我拉开门，看见他眼里的慌张终于大过了算计。楼道灯亮着，邻居家的门开了一条缝。",
    "我把那碗没有喝过的汤递给他：“那你先为这个家喝一口。”",
    "周明没有接。",
    "我轻声说：“你看，你也知道有些东西不能随便吞下去。”",
    "后来保险公司暂停了他的合作权限，复印店老板愿意出具证言，警方把周明带走问话。朋友问我难不难过，我想了很久，说当然难过。",
    "可比难过更清楚的是，我终于明白，真正救我的不是谁突然良心发现，而是我在最害怕的那一刻，没有把证据交给情绪。",
    "一个月后，我搬进新租的房子。窗台很小，只放得下一盆薄荷。复查报告出来那天，我把报告拍照存档，然后锁进自己的云盘。",
    "这一次，所有关于我的东西，都只由我决定给谁看。"
  ].join("\n\n");

  return {
    title,
    content,
    genre: direction,
    tags: Array.from(new Set([direction, "强冲突", "反转", "现实质感"])).slice(0, 5),
    summary: approvedOutline?.outline?.trim() || `围绕“${inspiration.slice(0, 42)}”生成的市场导向短篇样稿。`,
    marketSummary: `本地兜底选择 ${direction}，优先保证开头冲突、证据推进和结尾情绪回收。目标篇幅：${targetLength}。`,
    qualitySummary: `样稿完整度可用于验收链路；${avoidNotes.length ? `已记录禁写方向：${avoidNotes.join("、")}。` : "未设置禁写方向。"}真实发布前建议使用已配置模型重写扩展。`,
    internalPlan: "市场机会围绕亲密关系背叛与证据反击；正文采用即时冲突开头、证据递进、公开压力与自我夺回控制权的收束。",
    revisionNotes: ["开头 300 字内给出异常短信和病历消失。", "中段用证据链推动，不用解释性大纲。", "结尾落在女主重新掌控个人资料。"],
    providerMode: "mock",
    providerNotice: "当前为本地 V2 样稿兜底，用于验证生成、保存和跳转链路。"
  };
}

function normalizeAvoidList(avoid?: FullDraftInput["avoid"]) {
  if (Array.isArray(avoid)) {
    return avoid.map((item) => item.trim()).filter(Boolean);
  }

  return avoid?.split(/[、,\n]/u).map((item) => item.trim()).filter(Boolean) ?? [];
}

function normalizeInput(input: GeneratePlanInput) {
  return {
    inspiration: input.inspiration?.trim() || fallbackInspiration,
    platform: input.platform || "番茄短故事",
    genre: input.genre || "女性成长",
    length: input.length || "8000 字",
    emotion: input.emotion || "爽",
    protagonist: input.protagonist || "县城女性",
    ending: input.ending || "逆袭成功",
    style: input.style || "现实质感",
    mode: input.mode || "步步确认"
  };
}

type NarrativeProfile = {
  key: "realistic" | "suspense" | "ancient" | "romance" | "urban";
  title: string;
  altTitle: string;
  quietTitle: string;
  themePair: string;
  reader: string;
  altReader: string;
  quietReader: string;
  protagonistName: string;
  protagonistRole: string;
  antagonistName: string;
  antagonistRole: string;
  mirrorName: string;
  mirrorRole: string;
  setting: string;
  openingEvent: string;
  resource: string;
  clueOne: string;
  clueTwo: string;
  clueThree: string;
  publicStage: string;
  finalObject: string;
  warmObject: string;
  conflict: string;
  reversal: string;
  originalitySpace: string;
  synopsis: string;
  keyLine: string;
};

function createNarrativeProfile(base: ReturnType<typeof normalizeInput>): NarrativeProfile {
  const signal = `${base.genre} ${base.protagonist} ${base.style} ${base.inspiration}`;
  const suspenseSignal = /悬疑|惊悚|推理|凶案|怪谈|门后|敲门|门禁|监控|旧小区|案发|档案员/u.test(signal);
  const missingSuspenseSignal = /失踪/u.test(signal) && /夜|警|查|监控|门禁|小区|档案|敲门/u.test(signal);

  if (suspenseSignal || missingSuspenseSignal) {
    return {
      key: "suspense",
      title: "她在第三声敲门后关灯",
      altTitle: "失踪门禁的最后一分钟",
      quietTitle: "楼道灯没有熄",
      themePair: "悬疑钩子 + 真相追查",
      reader: "喜欢强钩子、线索反转和现实惊悚的短篇读者",
      altReader: "偏好失踪谜团、旧楼秘密和连续反转的读者",
      quietReader: "喜欢冷感悬疑、人性后劲和克制结尾的读者",
      protagonistName: "许知晚",
      protagonistRole: base.protagonist || "夜班档案员",
      antagonistName: "韩主任",
      antagonistRole: "试图抹掉异常记录的人",
      mirrorName: "程屿",
      mirrorRole: "留下线索的关键证人",
      setting: "旧小区值班室",
      openingEvent: "夜班时第三声敲门响起，监控却显示门外没有人",
      resource: "门禁记录",
      clueOne: "门禁记录",
      clueTwo: "录音笔",
      clueThree: "旧监控",
      publicStage: "业主大会",
      finalObject: "备用钥匙",
      warmObject: "楼道灯",
      conflict: "主角想查清失踪者最后一晚，管理处却把异常记录推到她身上。",
      reversal: "求救者并不是突然消失，而是提前把证据交到了主角最不起眼的值班本里。",
      originalitySpace: "把恐惧落在门禁、旧楼、值班表和邻里沉默里，避开纯套路密室。",
      synopsis: "一个夜班档案员在旧小区听见第三声敲门，却发现监控里没有任何人。她沿着门禁记录、录音笔和旧监控追查，最后在公开场合揭开失踪真相，并选择把恐惧留在门外。",
      keyLine: "“如果门外没人，那是谁替他刷了卡？”"
    };
  }

  if (/古言|宫斗|宅斗|侯府|王府|宫|嫡女|庶女|凤印/u.test(signal)) {
    return {
      key: "ancient",
      title: "她把凤印留在雪夜",
      altTitle: "侯府旧账",
      quietTitle: "檐下第二盏灯",
      themePair: "古言权谋 + 克制反击",
      reader: "喜欢宅斗压迫、证据反转和女性自救的短篇读者",
      altReader: "偏好侯府旧事、身份错置和公开翻案的读者",
      quietReader: "喜欢古言人情、慢热反击和余味结尾的读者",
      protagonistName: "沈照雪",
      protagonistRole: base.protagonist || "被迫替嫁的侯府嫡女",
      antagonistName: "陆太夫人",
      antagonistRole: "用家族体面压人的掌事长辈",
      mirrorName: "沈念",
      mirrorRole: "被偏护的妹妹",
      setting: "侯府雪夜",
      openingEvent: "寿宴上她被迫认下替嫁旧账",
      resource: "婚书",
      clueOne: "宫牌",
      clueTwo: "旧药方",
      clueThree: "账册",
      publicStage: "寿宴厅",
      finalObject: "凤印",
      warmObject: "檐灯",
      conflict: "主角想守住清白和婚书，侯府却逼她替妹妹认下一桩旧罪。",
      reversal: "所谓替嫁不是她攀附权贵，而是侯府多年用她挡灾的证据。",
      originalitySpace: "把权谋落到婚书、药方、账册和府中人情，不照搬常见真假嫡女桥段。",
      synopsis: "一个被侯府牺牲的女子在雪夜寿宴上被迫认罪。她沿着宫牌、旧药方和账册查出真正的替嫁旧账，公开翻案后没有留恋凤印，而是给自己留下一盏檐下灯。",
      keyLine: "“这枚凤印，我拿得起，也放得下。”"
    };
  }

  if (/甜宠|现言|恋爱|合约|婚恋|告白|甜/u.test(signal)) {
    return {
      key: "romance",
      title: "她在合约末页写下春天",
      altTitle: "过期告白",
      quietTitle: "便利店的热牛奶",
      themePair: "现言甜宠 + 情感反转",
      reader: "喜欢暧昧拉扯、误会反转和温柔兑现的短篇读者",
      altReader: "偏好合约关系、成年人克制和双向奔赴的读者",
      quietReader: "喜欢生活流甜感、轻反击和暖结尾的读者",
      protagonistName: "温以宁",
      protagonistRole: base.protagonist || "想结束合约关系的普通女生",
      antagonistName: "顾临川",
      antagonistRole: "把真心藏进条款里的合约对象",
      mirrorName: "许乔",
      mirrorRole: "制造误会的旧人",
      setting: "雨夜便利店",
      openingEvent: "合约到期前夜，她发现最后一页被人换过",
      resource: "合约",
      clueOne: "合约末页",
      clueTwo: "旧车票",
      clueThree: "未寄出的信",
      publicStage: "发布会后台",
      finalObject: "钢笔",
      warmObject: "热牛奶",
      conflict: "主角想体面结束合约关系，对方却用沉默把真心和误会一起藏起来。",
      reversal: "那份合约不是束缚她的笼子，而是对方笨拙保护她的证据。",
      originalitySpace: "把甜感落到合约细节、旧车票和生活动作，避免只靠误会拖剧情。",
      synopsis: "一个想结束合约关系的女生在到期前夜发现合约被改。她沿着旧车票和未寄出的信查清误会，在发布会后台完成选择，最后把关系从条款写回真实生活。",
      keyLine: "“这一次，不按合约，按我自己的心。”"
    };
  }

  if (/男频|都市|逆袭|赘婿|打工人|创业|职场|项目/u.test(signal)) {
    return {
      key: "urban",
      title: "他把欠条钉在晨光里",
      altTitle: "项目署名权",
      quietTitle: "天桥下的早餐车",
      themePair: "都市逆袭 + 证据反击",
      reader: "喜欢底层逆袭、职场压迫和证据翻盘的短篇读者",
      altReader: "偏好项目争夺、名誉反击和爽点兑现的读者",
      quietReader: "喜欢现实职场、人情压力和稳扎稳打逆袭的读者",
      protagonistName: "陈临",
      protagonistRole: base.protagonist || "普通打工人",
      antagonistName: "许经理",
      antagonistRole: "抢走项目署名的人",
      mirrorName: "梁博",
      mirrorRole: "关键同事",
      setting: "凌晨办公室",
      openingEvent: "项目上线前，他的名字从署名页被删掉",
      resource: "项目署名",
      clueOne: "欠条",
      clueTwo: "会议录音",
      clueThree: "代码提交记录",
      publicStage: "项目复盘会",
      finalObject: "工牌",
      warmObject: "早餐车",
      conflict: "主角想守住自己的劳动成果，上司却把项目和债务一起压到他身上。",
      reversal: "真正能证明项目归属的不是口头承诺，而是没人注意的提交记录。",
      originalitySpace: "把爽点落到项目文件、欠条、录音和职场流程，避免万能神豪式反转。",
      synopsis: "一个普通打工人在项目上线前被删掉署名，还被债务和舆论逼到角落。他整理欠条、会议录音和提交记录，在项目复盘会上拿回成果，最后选择用自己的名字重新开始。",
      keyLine: "“你删得掉页面上的名字，删不掉每一次提交记录。”"
    };
  }

  return {
    key: "realistic",
    title: "她把旧姓还给雨夜",
    altTitle: "无人认领的女儿",
    quietTitle: "早餐店的第二盏灯",
    themePair: "亲情冲突 + 克制反击",
    reader: "喜欢强情绪开头、克制反击和现实细节的短篇读者",
    altReader: "偏好真千金、家庭冲突、后劲结尾的读者",
    quietReader: "喜欢人味细节、慢热反击和生活流治愈的读者",
    protagonistName: "林照雨",
    protagonistRole: base.protagonist,
    antagonistName: "周明岚",
    antagonistRole: "习惯用牺牲一个人维持家庭表面平衡的母亲",
    mirrorName: "林念",
    mirrorRole: "被偏爱的对照人物",
    setting: "雨夜家宴",
    openingEvent: "家宴上被迫让出人生机会",
    resource: "报名名额",
    clueOne: "缴费单",
    clueTwo: "旧手机语音",
    clueThree: "医院档案",
    publicStage: "家宴直播",
    finalObject: "旧钥匙",
    warmObject: "热汤",
    conflict: "主角想保住最后的尊严，家人却把她当成可以被牺牲的人。",
    reversal: "真相不是主角被选中，而是她一直在替别人承担后果。",
    originalitySpace: "把冲突落到县城日常、餐桌、医院缴费单等具体细节里。",
    synopsis: "一个长期被家庭忽视的女孩，在被迫让出人生机会后发现当年真相。她没有等待任何人拯救，而是整理证据、公开真相，并最终选择离开旧家庭，重新开始自己的生活。",
    keyLine: "“这一次，我不懂事了。”"
  };
}

function makeTopicCards(base: ReturnType<typeof normalizeInput>): TopicCard[] {
  const profile = createNarrativeProfile(base);

  return [
    {
      id: "topic-1",
      title: profile.title,
      hook: `从“${base.inspiration}”延展出「${profile.themePair}」，开篇直接给出${profile.setting}里的压迫场面。`,
      platform: base.platform,
      genre: base.genre,
      reader: profile.reader,
      protagonist: profile.protagonistRole,
      conflict: profile.conflict,
      emotion: `${base.emotion}感从压抑慢慢推到清醒反击`,
      reversal: profile.reversal,
      length: base.length,
      fitScore: 92,
      samenessRisk: "中",
      originalitySpace: profile.originalitySpace,
      recommendationScore: 94
    },
    {
      id: "topic-2",
      title: profile.altTitle,
      hook: `主角围绕「${profile.resource}」第一次主动离开旧规则，反而让所有人看见真相。`,
      platform: base.platform,
      genre: base.genre,
      reader: profile.altReader,
      protagonist: profile.protagonistRole,
      conflict: `${profile.antagonistRole}把矛盾推到主角身上，主角必须决定是否继续沉默。`,
      emotion: "误解、冷静、反击、释然",
      reversal: profile.reversal,
      length: base.length,
      fitScore: 88,
      samenessRisk: profile.key === "realistic" ? "高" : "中",
      originalitySpace: `避开同类题材的常见桥段，把关键证据换成：${profile.clueOne}、${profile.clueTwo}、${profile.clueThree}。`,
      recommendationScore: 86
    },
    {
      id: "topic-3",
      title: profile.quietTitle,
      hook: `降低狗血感，让主角在${profile.warmObject}和日常动作里完成真正的转身。`,
      platform: base.platform,
      genre: profile.key === "realistic" ? "现实情感" : base.genre,
      reader: profile.quietReader,
      protagonist: profile.protagonistRole,
      conflict: `外部冲突结束后，主角还要从「${profile.finalObject}」代表的旧身份里走出来。`,
      emotion: "苦、稳、暖、后劲",
      reversal: "真正的胜利不是压倒所有人，而是主角不再需要旧规则的许可。",
      length: base.length,
      fitScore: 84,
      samenessRisk: "低",
      originalitySpace: `以${profile.setting}、${profile.warmObject}和地方人情承载平台读者容易共情的现实议题。`,
      recommendationScore: 89
    }
  ];
}

function makeEmotionalCurve(profile: NarrativeProfile): EmotionalBeat[] {
  return [
    {
      stage: "压抑",
      emotion: "委屈但忍住",
      scene: profile.openingEvent,
      readerExpectation: "想知道主角为什么不反抗",
      releasePoint: `${profile.protagonistName}看见${profile.clueOne}里的异常`
    },
    {
      stage: "误解",
      emotion: "孤立",
      scene: `所有说法都指向${profile.protagonistName}有错`,
      readerExpectation: "等待第一处证据翻转",
      releasePoint: `${profile.protagonistName}保存下${profile.clueTwo}`
    },
    {
      stage: "崩溃",
      emotion: "痛到清醒",
      scene: `她发现自己被当成${profile.resource}背后的替罪羊`,
      readerExpectation: "主角必须做选择",
      releasePoint: `她第一次拒绝按${profile.antagonistName}的安排走`
    },
    {
      stage: "觉醒",
      emotion: "冷静",
      scene: `主角整理${profile.clueOne}、${profile.clueTwo}和${profile.clueThree}`,
      readerExpectation: "期待聪明反击",
      releasePoint: "她没有哭闹，而是开始行动"
    },
    {
      stage: "反击",
      emotion: "克制的爽",
      scene: `${profile.publicStage}里真相被主角亲手揭开`,
      readerExpectation: "看压迫者付出代价",
      releasePoint: `一句「${profile.keyLine}」完成反杀`
    },
    {
      stage: "回味",
      emotion: "释然",
      scene: "主角回到自己的生活",
      readerExpectation: "情绪落地，不要空喊口号",
      releasePoint: `${profile.protagonistName}把${profile.finalObject}放回旧处`
    }
  ];
}

function makeConflictLadder(profile: NarrativeProfile): ConflictStep[] {
  return [
    {
      level: 1,
      event: profile.openingEvent,
      parties: `${profile.protagonistName} vs ${profile.antagonistName}`,
      cost: "尊严被消耗",
      purpose: "快速建立压迫感"
    },
    {
      level: 2,
      event: `${profile.resource}被转给更有话语权的人`,
      parties: `${profile.protagonistName} vs ${profile.mirrorName}`,
      cost: "现实利益受损",
      purpose: "让冲突不只停留在情绪"
    },
    {
      level: 3,
      event: `主角被公开误解为${profile.key === "suspense" ? "制造恐慌" : profile.key === "romance" ? "利用关系" : "贪心"}`,
      parties: "主角 vs 舆论",
      cost: "名誉受损",
      purpose: "把读者情绪推高"
    },
    {
      level: 4,
      event: `主角发现${profile.clueThree}能解释真正的错位`,
      parties: "主角 vs 真相",
      cost: "关系彻底破裂",
      purpose: "进入转折"
    },
    {
      level: 5,
      event: `主角用${profile.clueOne}、${profile.clueTwo}和${profile.clueThree}反击`,
      parties: `${profile.protagonistName} vs 压迫者`,
      cost: "必须放弃旧关系和旧身份里的幻想",
      purpose: "释放爽点"
    },
    {
      level: 6,
      event: "主角选择自己的新生活",
      parties: "主角 vs 旧身份",
      cost: "失去依附感",
      purpose: "形成短篇闭环和后劲"
    }
  ];
}

function makeInformationGap(profile: NarrativeProfile): InformationGap {
  return {
    readerKnows: `主角围绕${profile.resource}被不公平对待，但暂时不知道背后的真正原因。`,
    protagonistKnows: `主角只知道自己被推到台前，还不知道${profile.reversal}`,
    antagonistMisses: `${profile.antagonistName}不知道主角已经保存${profile.clueTwo}，也不知道她不再需要被接纳。`,
    revealTiming: `第四个场景揭示${profile.clueThree}里的原因，第五个场景在${profile.publicStage}公开证据。`,
    payoff: `读者既得到「${profile.reversal}」的真相反转，也看到主角主动完成自我确认。`
  };
}

function makeCharacters(base: ReturnType<typeof normalizeInput>, profile: NarrativeProfile): CharacterCard[] {
  return [
    {
      id: "character-1",
      name: profile.protagonistName,
      role: "主角",
      personality: "安静、能忍、观察力强，真正觉醒后行动很稳。",
      background: `${profile.protagonistRole}，被卷入「${base.inspiration}」这条故事线。`,
      desire: "被公平对待，但最后学会先把自己放回人生中心。",
      fear: "害怕自己永远只是被选择时排在最后的人。",
      relationNotes: `和${profile.antagonistName}之间存在长期压迫，和${profile.mirrorName}围绕${profile.resource}形成对照。`
    },
    {
      id: "character-2",
      name: profile.antagonistName,
      role: profile.antagonistRole,
      personality: "体面、控制欲强，习惯用牺牲一个人维持家庭表面平衡。",
      background: `把${profile.setting}里的秩序看得比主角的真实感受更重要。`,
      desire: `维持${profile.publicStage}前的体面。`,
      fear: "旧事被翻出，自己多年的选择被否定。",
      relationNotes: "她的偏心是故事最主要的情绪压迫源。"
    },
    {
      id: "character-3",
      name: profile.mirrorName,
      role: profile.mirrorRole,
      personality: "外表柔弱，擅长让别人替她承担后果。",
      background: `长期享受${profile.resource}带来的保护，害怕失去位置。`,
      desire: "继续拥有所有人的保护。",
      fear: "被发现自己并不无辜。",
      relationNotes: "和主角形成镜像：一个被迫懂事，一个被纵容脆弱。"
    }
  ];
}

function makeSceneCards(profile: NarrativeProfile): SceneCard[] {
  return [
    {
      id: "scene-1",
      index: 1,
      title: profile.key === "realistic" ? "家宴上的空座位" : `${profile.setting}里的第一处异常`,
      goal: "用一个具体场面建立主角被忽视的处境。",
      protagonistWant: `守住${profile.resource}，不再被卷入旧规则。`,
      obstacle: `${profile.antagonistName}当众要求主角退让。`,
      conflictUpgrade: `${profile.resource}从小事升级为人生机会被夺走。`,
      informationGap: `${profile.mirrorName}为什么非要这个资源暂时不说透。`,
      emotion: "压抑、委屈",
      keyAction: `${profile.protagonistName}把手停在${profile.clueOne}旁边，却没有立刻抬头。`,
      keyDialogue: "“反正你从小就懂事，这次也一样。”",
      hook: `${profile.protagonistName}在角落里看见被藏起来的${profile.clueOne}。`,
      estimatedWords: 1200,
      relatedCharacters: [profile.protagonistName, profile.antagonistName, profile.mirrorName],
      relatedForeshadows: uniqueItems([profile.clueOne, profile.resource])
    },
    {
      id: "scene-2",
      index: 2,
      title: `被删除的${profile.clueTwo}`,
      goal: "让主角获得第一枚反击证据。",
      protagonistWant: "弄清楚自己为什么被逼退让。",
      obstacle: "身边人统一口径说她想太多。",
      conflictUpgrade: "从被忽视变成被污名化。",
      informationGap: `读者知道${profile.clueTwo}很重要，但不知道完整内容。`,
      emotion: "怀疑、孤立",
      keyAction: `${profile.protagonistName}把${profile.clueTwo}备份到三个地方。`,
      keyDialogue: `“你只要承认是你弄丢的，${profile.mirrorName}就不会受影响。”`,
      hook: `${profile.clueTwo}里出现了一个不该出现的名字。`,
      estimatedWords: 1300,
      relatedCharacters: [profile.protagonistName, profile.antagonistName],
      relatedForeshadows: [profile.clueTwo, "陌生名字"]
    },
    {
      id: "scene-3",
      index: 3,
      title: `${profile.key === "ancient" ? "雪夜账房" : profile.key === "urban" ? "凌晨办公室" : profile.key === "suspense" ? "旧监控室" : profile.key === "romance" ? "雨夜便利店" : "雨夜医院"}`,
      goal: "把情绪推到崩溃点，同时补上人味细节。",
      protagonistWant: "确认当年的旧事。",
      obstacle: `${profile.clueThree}缺失，知情人不愿多说。`,
      conflictUpgrade: "表层争执连接到真实伤害。",
      informationGap: `知情人认出${profile.protagonistName}，却先问她这些年过得好不好。`,
      emotion: "痛、清醒",
      keyAction: `${profile.protagonistName}在${profile.clueThree}前站了很久。`,
      keyDialogue: "“这件事，从一开始就不是你的错。”",
      hook: `${profile.clueThree}里压着一份并不属于她的记录。`,
      estimatedWords: 1400,
      relatedCharacters: [profile.protagonistName, "知情人"],
      relatedForeshadows: [profile.clueThree, "旧记录"]
    },
    {
      id: "scene-4",
      index: 4,
      title: "真相的反面",
      goal: "揭示核心信息差，让主角完成觉醒。",
      protagonistWant: "知道自己到底是谁。",
      obstacle: "真相会让她失去最后一点家庭幻想。",
      conflictUpgrade: `从争${profile.resource}变成身份和责任被错置。`,
      informationGap: "读者和主角同步知道她一直替别人挡责。",
      emotion: "冷、稳",
      keyAction: `${profile.protagonistName}把所有材料按时间线排在桌上。`,
      keyDialogue: "“不是他们不要我，是他们一直需要我替别人承担后果。”",
      hook: `${profile.protagonistName}收到了${profile.publicStage}的邀请。`,
      estimatedWords: 1300,
      relatedCharacters: [profile.protagonistName],
      relatedForeshadows: ["时间线", profile.publicStage]
    },
    {
      id: "scene-5",
      index: 5,
      title: `一场体面的${profile.publicStage}`,
      goal: "让主角用克制方式完成反击。",
      protagonistWant: "公开真相，结束被定义的人生。",
      obstacle: `${profile.antagonistName}试图用旧关系逼她收手。`,
      conflictUpgrade: "所有压迫者在公开场合失去控制权。",
      informationGap: "反派不知道证据已经同步给关键人。",
      emotion: "克制的爽",
      keyAction: `${profile.protagonistName}把证据往前推了半寸。`,
      keyDialogue: profile.keyLine,
      hook: "直播结束后，主角没有回头看任何人。",
      estimatedWords: 1500,
      relatedCharacters: [profile.protagonistName, profile.antagonistName, profile.mirrorName],
      relatedForeshadows: [profile.clueTwo, profile.clueThree, profile.publicStage]
    },
    {
      id: "scene-6",
      index: 6,
      title: profile.finalObject,
      goal: "完成情绪落点，给读者后劲。",
      protagonistWant: "重新安排自己的生活。",
      obstacle: "旧关系开始道歉和挽留。",
      conflictUpgrade: "外部冲突结束，内部选择开始。",
      informationGap: "读者以为主角会彻底报复，实际主角选择不再纠缠。",
      emotion: "释然、回味",
      keyAction: `${profile.protagonistName}把${profile.finalObject}放进抽屉最深处。`,
      keyDialogue: "“我可以原谅，但不会再回去了。”",
      hook: `窗外天亮，${profile.protagonistName}第一次给自己留下一份${profile.warmObject}。`,
      estimatedWords: 1000,
      relatedCharacters: [profile.protagonistName],
      relatedForeshadows: [profile.finalObject, profile.warmObject]
    }
  ];
}

function sceneDraftBody(scene: SceneCard, style: string, learningFocus: string) {
  const protagonist = scene.relatedCharacters[0] ?? "主角";
  const opponent = scene.relatedCharacters[1] ?? "对手";
  const clue = scene.relatedForeshadows[0] ?? "那件关键物";
  const secondClue = scene.relatedForeshadows[1] ?? "另一条线索";
  const cameraLine = style === "电影感" ? "镜头像慢慢推近，光停在主角发白的指节和那件证据的边缘。" : "那一瞬间很安静，安静到主角能听见自己把话咽回去的声音。";
  const focusLine = learningFocus ? `这一次，${protagonist}记得那条写作经验：${learningFocus}，所以没有等谁替自己出头，只把证据和情绪都攥在自己手里。` : "";
  const openingByIndex: Record<number, string> = {
    1: `${scene.title}开始时，空气里有一种被提前安排好的沉默。${protagonist}站在原地，明明只想${scene.protagonistWant}，却发现所有人的目光都已经替${protagonist}判好了位置。${scene.obstacle}，这句话落下来时，${protagonist}先看见的不是对方的脸，而是${clue}上那一点不合时宜的痕迹。`,
    2: `${secondClue}被藏在很不起眼的地方，像一段不该被听见的呼吸。${protagonist}没有急着打开灯，也没有急着质问任何人，只是把门反锁，按时间把前一场留下的${clue}和眼前这条线索放在一起。`,
    3: `到了${scene.title}，故事里的冷意才真正落到皮肤上。${protagonist}原本以为自己只是来确认一件旧事，可${scene.obstacle}让她意识到，有人不只想让她退让，还想让她永远不知道自己为什么要退。`,
    4: `真相不是突然砸下来的。它更像一张被反复折过的纸，摊开时每一道折痕都指向同一个答案。${protagonist}把${scene.relatedForeshadows.join("、") || "所有证据"}排在桌上，终于看清自己过去承受的不是偶然。`,
    5: `${scene.title}比她想象中更安静。越是公开的场合，越没有人敢先承认自己害怕。${protagonist}走进去时，没有哭，也没有把声音抬高，她知道这一场不靠吵赢，而靠把证据放到所有人面前。`,
    6: `${scene.title}还留着旧日子的温度。${protagonist}把它拿在手里时，才发现自己已经没有那么想赢了。她真正想要的，是把人生从旧关系里拿回来，重新放到自己的桌面上。`
  };
  const focusParagraph = focusLine ? `\n\n${focusLine}` : "";

  return `${openingByIndex[scene.index] ?? `${scene.title}里，${protagonist}遇到了新的阻碍。`}

${scene.keyAction}${cameraLine}${scene.keyDialogue}这句话没有立刻炸开，却像一枚很小的钉子，把所有人装出来的体面钉在原地。${opponent}以为${protagonist}还会像过去一样解释、退让、把责任往自己身上揽，可这一次，${protagonist}只是把${clue}收好。

本场真正的暗线是：${scene.informationGap}。读者此时会知道这件事没有表面那么简单，但还不能一次性看见全部答案。${protagonist}也没有马上赢，只是第一次意识到，所谓懂事并不是美德，而是别人用来让自己闭嘴的绳子。${focusParagraph}

冲突因此升级为「${scene.conflictUpgrade}」。${protagonist}开始把${clue}、${secondClue}和每一句漏洞放到同一条线上，像在黑暗里摸到一根细线。线的另一端牵着旧事，也牵着过去很多次没有说出口的委屈。

这一场不能只靠情绪撑住，所以${protagonist}做了一个很具体的动作：把证据复制、标注、保存，或者把能证明自己的东西放进随身包里。动作很轻，却让主角从被安排的人变成开始安排下一步的人。${style === "短剧感" ? "如果拍成短剧，这里适合用近景切到手部动作，再切到对方突然僵住的表情。" : "这一段的力量不在吵闹，而在主角终于没有把疼痛解释成自己的错。"}

结尾时，${scene.hook}这个钩子把读者往下一场带，也把${protagonist}推到更清醒的位置。主角还没有完全胜利，但已经不再站在原来的地方。`;
}

export function createSceneDrafts(sceneCards: SceneCard[], style: string, learningFocus = ""): SceneDraft[] {
  return sceneCards.map((scene) => {
    const text = sceneDraftBody(scene, style, learningFocus);
    const qualityScore = Math.min(96, 82 + scene.index + (scene.index === 1 || scene.index === sceneCards.length ? 3 : 0));

    return {
      id: `draft-${scene.id}`,
      sceneId: scene.id,
      index: scene.index,
      title: scene.title,
      wordTarget: scene.estimatedWords,
      text,
      qualityScore,
      readerNotes: [
        `本场完成目标：${scene.goal}`,
        `读者钩子：${scene.hook}`,
        scene.index === 1 ? "开头有具体物件和压迫场面，适合继续保留。" : `下一轮可继续强化「${scene.emotion}」的体感。`
      ],
      revisionFocus: scene.index === 1 ? "开头 300 字内保留压迫、物件和主角沉默反应。" : `检查本场是否真正推进了「${scene.conflictUpgrade}」。`
    };
  });
}

export function assembleStoryDraft(sceneDrafts: SceneDraft[]): string {
  return sceneDrafts.map((scene) => `【场景${scene.index}：${scene.title}】\n${scene.text}`).join("\n\n");
}

export function createScenePrompts(
  sceneCards: SceneCard[],
  options: {
    platform?: string;
    genre?: string;
    style?: string;
    selectedTopic?: TopicCard;
    characters?: CharacterCard[];
    informationGap?: InformationGap;
  } = {}
): ScenePrompt[] {
  return sceneCards.map((scene) => {
    const relatedCharacters = scene.relatedCharacters.length
      ? scene.relatedCharacters.join("、")
      : options.characters?.map((character) => character.name).join("、") || "主角与关键配角";
    const topicHook = options.selectedTopic?.hook || "用强情绪开头和清晰钩子推进短篇阅读。";

    return {
      id: `prompt-${scene.id}`,
      sceneId: scene.id,
      index: scene.index,
      title: scene.title,
      objective: `写出第 ${scene.index} 场「${scene.title}」：${scene.goal}`,
      context: `平台：${options.platform ?? "番茄短故事"}；题材：${options.genre ?? "女性成长"}；文风：${options.style ?? "现实质感"}。本场人物：${relatedCharacters}。总钩子：${topicHook}`,
      writingPrompt: `请按短篇小说正文方式写第 ${scene.index} 场。主角想要「${scene.protagonistWant}」，但遇到「${scene.obstacle}」。冲突必须升级为「${scene.conflictUpgrade}」，情绪要落在「${scene.emotion}」。结尾必须留下钩子：「${scene.hook}」。`,
      mustInclude: [
        scene.keyAction,
        scene.keyDialogue,
        `信息差：${scene.informationGap}`,
        `关联伏笔：${scene.relatedForeshadows.join("、") || options.informationGap?.payoff || "本场核心伏笔"}`
      ],
      avoid: [
        "不要直接解释主题，要用动作和对话推进。",
        "不要让外部强者替主角解决核心冲突。",
        "不要复制热门作品桥段或套用现成角色名。"
      ]
    };
  });
}

function makeReaderReport(profile?: NarrativeProfile): ReaderReport {
  const topicLabel = profile?.themePair ?? "亲情冲突 + 克制反击";
  const clueOne = profile?.clueOne ?? "缴费单";
  const clueTwo = profile?.clueTwo ?? "旧手机语音";
  const clueThree = profile?.clueThree ?? "医院档案";

  return {
    openingScore: 86,
    empathyScore: 82,
    emotionScore: 89,
    reversalScore: 84,
    closureScore: 90,
    platformFitScore: 88,
    samenessRisk: "中",
    problems: [
      `「${topicLabel}」容易同质化，需要更多只属于本篇的现实细节支撑。`,
      "第二、三场景都在追查真相，注意避免信息重复。",
      "反派人物可以保留一点自我合理化，降低脸谱感。"
    ],
    suggestions: [
      `开头 300 字内保留强压迫场景，同时给出${clueOne}钩子。`,
      `中段用${clueTwo}、${clueThree}和公开场合邀请三个具体物件推进。`,
      "结尾不要喊口号，用一个生活动作完成情绪释放。"
    ]
  };
}

function qualityStatus(score: number): StoryQualityCheck["status"] {
  if (score >= 85) {
    return "通过";
  }

  if (score >= 72) {
    return "注意";
  }

  return "高风险";
}

function readinessFromScore(score: number): StoryQualityReport["publishReadiness"] {
  if (score >= 85) {
    return "可进入精修";
  }

  if (score >= 72) {
    return "需要重点修改";
  }

  return "暂不建议发布";
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));

  if (!usable.length) {
    return 0;
  }

  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

export function createStoryQualityReport(plan: Pick<
  StoryPlan,
  "readerReport" | "sceneDrafts" | "sceneCards" | "informationGap" | "selectedTopic"
>): StoryQualityReport {
  const sceneScores = plan.sceneDrafts.map((scene) => scene.qualityScore);
  const middleScenes = plan.sceneDrafts.filter((scene) => scene.index > 1 && scene.index < plan.sceneDrafts.length);
  const lowestScenes = [...plan.sceneDrafts].sort((a, b) => a.qualityScore - b.qualityScore).slice(0, 2);
  const hasConcreteHooks = plan.sceneCards.filter((scene) => scene.hook || scene.relatedForeshadows.length).length;
  const hookScore = Math.round((plan.readerReport.openingScore + Math.min(100, (hasConcreteHooks / Math.max(1, plan.sceneCards.length)) * 100)) / 2);
  const middleScore = average([plan.readerReport.emotionScore, average(middleScenes.map((scene) => scene.qualityScore))]);
  const informationGapScore = plan.informationGap.payoff.trim() && plan.informationGap.revealTiming.trim() ? 88 : 62;
  const sceneDriveScore = average([average(sceneScores), Math.min(100, (hasConcreteHooks / Math.max(1, plan.sceneCards.length)) * 100)]);
  const originalityScore = plan.readerReport.samenessRisk === "低" ? 90 : plan.readerReport.samenessRisk === "中" ? 78 : 64;
  const closureScore = plan.readerReport.closureScore;

  const checks: StoryQualityCheck[] = [
    {
      id: "opening-hook",
      label: "开头钩子",
      score: hookScore,
      status: qualityStatus(hookScore),
      evidence: `开头评分 ${plan.readerReport.openingScore}，场景卡里有 ${hasConcreteHooks} 个物件/信息钩子。`,
      fix: "开头 300 字内必须同时出现压迫场面、具体物件和主角反应，避免只用背景解释开场。",
      relatedScenes: [1]
    },
    {
      id: "middle-drag",
      label: "中段拖沓",
      score: middleScore,
      status: qualityStatus(middleScore),
      evidence: `中段场景平均分 ${average(middleScenes.map((scene) => scene.qualityScore))}，测试读者情绪分 ${plan.readerReport.emotionScore}。`,
      fix: "第二到四场每场都要新增一条证据、一个阻碍或一次关系变化，删掉重复追查和空泛内心独白。",
      relatedScenes: middleScenes.map((scene) => scene.index)
    },
    {
      id: "information-gap",
      label: "信息差回收",
      score: informationGapScore,
      status: qualityStatus(informationGapScore),
      evidence: `揭示时机：${plan.informationGap.revealTiming || "未填写"}；回收方式：${plan.informationGap.payoff || "未填写"}。`,
      fix: "提前埋下读者能记住的线索，第四或第五场再揭示真相，不要靠结尾一句解释补全。",
      relatedScenes: [4, 5].filter((index) => index <= plan.sceneDrafts.length)
    },
    {
      id: "scene-drive",
      label: "场景推进",
      score: sceneDriveScore,
      status: qualityStatus(sceneDriveScore),
      evidence: lowestScenes.length
        ? `最需要复查：${lowestScenes.map((scene) => `场景${scene.index}「${scene.title}」${scene.qualityScore}分`).join("、")}。`
        : "分场正文暂未生成评分。",
      fix: "每场至少保留一个动作推进、一个冲突升级和一个结尾钩子；低分场景优先重写。",
      relatedScenes: lowestScenes.map((scene) => scene.index)
    },
    {
      id: "originality-risk",
      label: "套路化风险",
      score: originalityScore,
      status: qualityStatus(originalityScore),
      evidence: `选题同质化风险为「${plan.selectedTopic.samenessRisk}」，测试读者同质化风险为「${plan.readerReport.samenessRisk}」。`,
      fix: "保留题材情绪优势，但更换人物关系、职业场景、关键物件和反转方式，避免复刻热门套路。",
      relatedScenes: plan.sceneDrafts.map((scene) => scene.index)
    },
    {
      id: "ending-aftertaste",
      label: "结尾后劲",
      score: closureScore,
      status: qualityStatus(closureScore),
      evidence: `闭环评分 ${closureScore}，结尾场景为「${plan.sceneDrafts.at(-1)?.title ?? "未生成"}」。`,
      fix: "结尾用一个生活动作落地，不要只喊口号或只让反派道歉；让主角的选择成为最后的余味。",
      relatedScenes: plan.sceneDrafts.at(-1)?.index ? [plan.sceneDrafts.at(-1)!.index] : []
    }
  ];
  const overallScore = average(checks.map((check) => check.score));
  const riskyLabels = checks.filter((check) => check.status !== "通过").map((check) => check.label);

  return {
    overallScore,
    publishReadiness: readinessFromScore(overallScore),
    summary: riskyLabels.length
      ? `整体可继续推进，但「${riskyLabels.join("、")}」需要先改，再进入细修。`
      : "整体结构完整，已经适合进入人工精修和正文润色。",
    checks,
    guardrails: [
      "AI 生成内容仅供创作参考，发布前请人工编辑、补原创细节并检查平台规范。",
      "学习热门作品时只学习结构、节奏和读者反馈，不复制原文、人物名或关键桥段。",
      "不生成低质批量水文，不提供绕过审核、绕过检测或规避平台规则的建议。"
    ]
  };
}

function riskFromSameness(risk: "低" | "中" | "高") {
  return risk;
}

function highestRisk(risks: Array<StoryOriginalityCheck["riskLevel"]>): StoryOriginalityCheck["riskLevel"] {
  if (risks.includes("高")) {
    return "高";
  }

  if (risks.includes("中")) {
    return "中";
  }

  return "低";
}

function originalityScoreForRisk(risk: StoryOriginalityCheck["riskLevel"]) {
  return risk === "低" ? 92 : risk === "中" ? 78 : 58;
}

function originalityRiskFromScore(score: number): StoryOriginalityReport["riskLevel"] {
  if (score >= 85) {
    return "低";
  }

  if (score >= 72) {
    return "中";
  }

  return "高";
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.filter((item) => item.trim())));
}

export function createStoryOriginalityReport(plan: Pick<
  StoryPlan,
  "selectedTopic" | "readerReport" | "sceneCards" | "scenePrompts" | "characters" | "informationGap"
>): StoryOriginalityReport {
  const topicRisk = highestRisk([riskFromSameness(plan.selectedTopic.samenessRisk), riskFromSameness(plan.readerReport.samenessRisk)]);
  const allSceneIndexes = plan.sceneCards.map((scene) => scene.index);
  const characterSummary = plan.characters.map((character) => `${character.name}（${character.role}）`).join("、") || "暂未生成人物关系";
  const hookSummary =
    plan.sceneCards
      .slice(0, 3)
      .map((scene) => `场景${scene.index}「${scene.title}」钩子：${scene.hook}`)
      .join("；") || "暂未生成场景钩子";
  const promptAvoids = uniqueItems(plan.scenePrompts.flatMap((prompt) => prompt.avoid)).slice(0, 3);
  const missingForeshadowScenes = plan.sceneCards.filter((scene) => scene.relatedForeshadows.length === 0).map((scene) => scene.index);

  const checks: StoryOriginalityCheck[] = [
    {
      id: "topic-distance",
      label: "题材套路距离",
      riskLevel: topicRisk,
      evidence: `选题同质化风险为「${plan.selectedTopic.samenessRisk}」，测试读者同质化风险为「${plan.readerReport.samenessRisk}」。原创空间：${plan.selectedTopic.originalitySpace}`,
      learnFrom: "可以学习热门题材的情绪承诺、开篇压力和反转节奏。",
      avoidCopy: "不要照搬热门作品的身份谜底、认亲方式、替身关系或完整反击桥段。",
      rewriteAction: `保留「${plan.selectedTopic.genre}」的读者爽点，但把人物关系、职业场景和关键物件改成自己的细节：${plan.selectedTopic.originalitySpace}`,
      relatedScenes: allSceneIndexes
    },
    {
      id: "character-relation",
      label: "人物与关系原创度",
      riskLevel: plan.characters.length >= 3 ? "中" : "高",
      evidence: `当前人物关系：${characterSummary}。`,
      learnFrom: "可以学习人物欲望互相冲突的结构，比如主角要自救、对手要掩盖、旁观者要自保。",
      avoidCopy: "不要沿用热门作品里一模一样的姓名、家庭排序、真假身份组合和道歉方式。",
      rewriteAction: "给每个关键人物补一个只属于这篇故事的现实理由，例如欠款、工作机会、病历、旧物或地方人情。",
      relatedScenes: allSceneIndexes.slice(0, 4)
    },
    {
      id: "bridge-replacement",
      label: "关键桥段替换",
      riskLevel: missingForeshadowScenes.length ? "中" : "低",
      evidence: hookSummary,
      learnFrom: "可以学习“压迫开场 → 证据出现 → 公开反击 → 生活落点”的结构顺序。",
      avoidCopy: "不要复制热门作品的具体场面、台词爆点、公开打脸方式或证据出现时机。",
      rewriteAction: "逐场替换桥段里的地点、物件和动作：同样是反击，也要换成这篇人物真的会做的动作。",
      relatedScenes: missingForeshadowScenes.length ? missingForeshadowScenes : allSceneIndexes
    },
    {
      id: "information-gap-originality",
      label: "信息差原创空间",
      riskLevel: plan.informationGap.payoff && plan.informationGap.revealTiming ? "低" : "高",
      evidence: `揭示时机：${plan.informationGap.revealTiming || "未填写"}；回收方式：${plan.informationGap.payoff || "未填写"}。`,
      learnFrom: "可以学习先让读者知道一部分、再让主角追上真相的阅读快感。",
      avoidCopy: "不要复用已有作品的秘密内容、证据载体和结尾解释方式。",
      rewriteAction: "把真相证据绑定到本篇专属物件或场景，例如账单、语音、病历、店铺记录、旧钥匙。",
      relatedScenes: [4, 5].filter((index) => index <= plan.sceneCards.length)
    },
    {
      id: "thin-content-risk",
      label: "水文与空话风险",
      riskLevel: plan.readerReport.problems.length > 2 ? "中" : "低",
      evidence: `测试读者指出 ${plan.readerReport.problems.length} 个主要问题；提示词避开项：${promptAvoids.join("；") || "暂无"}`,
      learnFrom: "可以学习平台短篇的高密度推进方式，让每场都有新信息、新阻碍或新情绪。",
      avoidCopy: "不要用空泛独白、重复追查、万能道歉和口号式结尾填字数。",
      rewriteAction: "检查每 500 字是否有一个动作、一个阻碍或一个信息变化；没有推进的段落优先删改。",
      relatedScenes: allSceneIndexes
    }
  ];
  const originalityScore = average(checks.map((check) => originalityScoreForRisk(check.riskLevel)));
  const riskLevel = originalityRiskFromScore(originalityScore);

  return {
    originalityScore,
    riskLevel,
    verdict:
      riskLevel === "低"
        ? "原创边界清楚，可以进入人工精修。"
        : riskLevel === "中"
          ? "可以继续推进，但发布前要先完成桥段、人物和细节的原创化替换。"
          : "原创风险偏高，建议先重做选题或重拆关键桥段。",
    learningPoints: uniqueItems(checks.map((check) => check.learnFrom)),
    avoidCopyPoints: uniqueItems(checks.map((check) => check.avoidCopy)),
    rewriteActions: uniqueItems(checks.map((check) => check.rewriteAction)),
    checks
  };
}

export function createStoryContinuityMemory(plan: Pick<
  StoryPlan,
  "characters" | "sceneCards" | "sceneDrafts" | "emotionalCurve" | "informationGap"
>): StoryContinuityMemory {
  const sceneCount = Math.max(1, plan.sceneCards.length);
  const revealStart = Math.max(4, Math.ceil(sceneCount * 0.65));
  const allForeshadows = uniqueItems(plan.sceneCards.flatMap((scene) => scene.relatedForeshadows));
  const sceneMemories = plan.sceneCards.map((scene) => {
    const draft = plan.sceneDrafts.find((item) => item.sceneId === scene.id || item.index === scene.index);
    const beat = plan.emotionalCurve.find((item) => item.scene.includes(scene.title) || item.stage.includes(String(scene.index)));
    const paidForeshadows = scene.index >= revealStart ? scene.relatedForeshadows : [];

    return {
      sceneId: scene.id,
      index: scene.index,
      title: scene.title,
      emotionalState: beat?.emotion ?? scene.emotion,
      characterState: `${scene.relatedCharacters.join("、") || "主角"}在本场要从「${scene.protagonistWant}」推进到「${scene.keyAction}」。`,
      relationshipChange: scene.conflictUpgrade,
      plantedForeshadows: scene.relatedForeshadows,
      paidForeshadows,
      nextContinuityNote: draft?.revisionFocus
        ? `改本场时先守住：${draft.revisionFocus}`
        : `改本场时先守住目标「${scene.goal}」和钩子「${scene.hook}」。`
    };
  });
  const characterMemories = plan.characters.map((character) => {
    const relatedScenes = plan.sceneCards.filter((scene) => scene.relatedCharacters.includes(character.name));
    const lastScene = relatedScenes.at(-1);

    return {
      characterId: character.id,
      name: character.name,
      role: character.role,
      currentState: `${character.desire}；当前恐惧是「${character.fear}」。`,
      relationshipShift: lastScene?.conflictUpgrade ?? character.relationNotes,
      nextUse: lastScene
        ? `后续使用这个人物时，要承接场景 ${lastScene.index}「${lastScene.title}」里的关系变化。`
        : `后续使用这个人物时，要承接人物卡里的关系备注：${character.relationNotes}`
    };
  });
  const foreshadowMemories = allForeshadows.map((clue, index) => {
    const plantedInScenes = plan.sceneCards.filter((scene) => scene.relatedForeshadows.includes(clue)).map((scene) => scene.index);
    const explicitPayoffScenes = plan.sceneCards
      .filter(
        (scene) =>
          scene.index >= revealStart &&
          (scene.relatedForeshadows.includes(clue) || scene.informationGap.includes(clue) || scene.hook.includes(clue) || scene.conflictUpgrade.includes(clue))
      )
      .map((scene) => scene.index);
    const payoffInScenes = explicitPayoffScenes.length ? explicitPayoffScenes : plan.informationGap.payoff.includes(clue) ? [Math.min(sceneCount, revealStart)] : [];
    const status: StoryContinuityMemory["foreshadowMemories"][number]["status"] = payoffInScenes.length ? "已回收" : "待回收";

    return {
      id: `foreshadow-${index + 1}`,
      clue,
      plantedInScenes,
      payoffInScenes,
      status,
      note:
        status === "已回收"
          ? `已在第 ${payoffInScenes.join("、")} 场附近回收，精修时注意前后说法一致。`
          : "后续改稿时要安排明确回收，不要让读者记住了却没有结果。"
    };
  });

  return {
    summary: `这份作品记忆记录 ${plan.characters.length} 个关键人物、${allForeshadows.length} 条伏笔和 ${sceneMemories.length} 个场景的连续性状态。`,
    characterMemories,
    foreshadowMemories,
    sceneMemories,
    nextWritingNotes: [
      "单场重写后，先检查人物目标、关系变化和上一场钩子是否仍然接得上。",
      `信息差揭示要承接：${plan.informationGap.revealTiming || "已设定的揭示时机"}；最终回收要服务：${plan.informationGap.payoff || "主角主动完成选择"}`,
      "精修时不要只润色句子，要同步检查已埋伏笔、已回收伏笔和情绪曲线是否被改断。",
      "保存或导出作品前，先看这份作品记忆，确认人物、伏笔、情绪线没有互相打架。"
    ]
  };
}

function summarizeMemory(memory: NonNullable<GeneratePlanInput["memoryHints"]>[number]) {
  return `${memory.genre}：${memorySourceLabel(memory.sourceType)}：${memory.rule}${memory.matchReason ? `（${memory.matchReason}）` : ""}`;
}

function memorySuggestions(memoryHints: NonNullable<GeneratePlanInput["memoryHints"]>) {
  return memoryHints
    .slice(0, 2)
    .map((memory) =>
      memory.sourceType === "review"
        ? `优先执行复盘记忆「${memory.rule}」，本次生成要保留有效经验，同时更换具体场景和人物关系。`
        : `结合写作记忆「${memory.rule}」，本次生成要保留有效经验，同时更换具体场景和人物关系。`
    );
}

function summarizeStrategy(strategy: NonNullable<GeneratePlanInput["strategyHints"]>[number]) {
  return `${strategy.genre}：${strategySourceLabel(strategy.sourceType)}：${strategy.rule}${strategy.matchReason ? `（${strategy.matchReason}）` : ""}`;
}

function strategySuggestions(strategyHints: NonNullable<GeneratePlanInput["strategyHints"]>) {
  return strategyHints
    .slice(0, 2)
    .map((strategy) =>
      strategy.sourceType === "review"
        ? `优先执行复盘策略「${strategy.rule}」，本次执行重点是：${strategy.action}`
        : `结合个人策略「${strategy.rule}」，本次执行重点是：${strategy.action}`
    );
}

function evidenceSourceTypeFromMemory(sourceType: WritingMemory["sourceType"]): StoryLearningBasis["evidenceCards"][number]["sourceType"] {
  if (sourceType === "platform_result") return "user_authorized_data";
  if (sourceType === "review") return "review_memory";

  return "writing_memory";
}

function evidenceSourceTypeFromStrategy(sourceType: PersonalStrategy["sourceType"]): StoryLearningBasis["evidenceCards"][number]["sourceType"] {
  if (sourceType === "platform_result") return "user_authorized_data";
  if (sourceType === "review") return "review_strategy";

  return "personal_strategy";
}

function evidenceTitleFromMemory(memory: NonNullable<GeneratePlanInput["memoryHints"]>[number]) {
  if (memory.sourceType === "platform_result") return `${memory.genre}用户授权后台表现：${evidenceTitleSignal(memory.rule)}`;
  if (memory.sourceType === "review") return `${memory.genre}复盘记忆`;

  return `${memory.genre}写作记忆`;
}

function evidenceTitleFromStrategy(strategy: NonNullable<GeneratePlanInput["strategyHints"]>[number]) {
  if (strategy.sourceType === "platform_result") return `${strategy.genre}用户授权后台策略：${evidenceTitleSignal(strategy.rule || strategy.action)}`;
  if (strategy.sourceType === "review") return `${strategy.genre}复盘策略`;

  return `${strategy.genre}个人策略`;
}

function evidenceTitleSignal(text: string) {
  const signal =
    /读者对(.+?)反馈/u.exec(text)?.[1] ||
    /优先验证(.+?)(?:，|。|$)/u.exec(text)?.[1] ||
    /：(.+?)(?:，|。|$)/u.exec(text)?.[1] ||
    text;

  return signal.replace(/\s+/gu, " ").trim().slice(0, 18) || "表现信号";
}

function memorySourceLabel(sourceType: WritingMemory["sourceType"]) {
  if (sourceType === "platform_result") return "授权数据";
  if (sourceType === "review") return "复盘记忆";

  return "写作记忆";
}

function strategySourceLabel(sourceType: PersonalStrategy["sourceType"]) {
  if (sourceType === "platform_result") return "授权策略";
  if (sourceType === "review") return "复盘策略";

  return "个人策略";
}

function evidenceWeightFromMemory(memory: NonNullable<GeneratePlanInput["memoryHints"]>[number]) {
  const baseWeight = memory.matchScore ?? memory.confidence;

  if (memory.sourceType === "review") return { weight: Math.min(240, baseWeight + 30), weightLabel: "复盘优先" };
  if (memory.sourceType === "platform_result") return { weight: Math.min(230, baseWeight + 25), weightLabel: "授权数据优先" };

  return { weight: baseWeight };
}

function evidenceWeightFromStrategy(strategy: NonNullable<GeneratePlanInput["strategyHints"]>[number]) {
  const baseWeight = strategy.matchScore ?? strategy.confidence;

  if (strategy.sourceType === "review") return { weight: Math.min(240, baseWeight + 30), weightLabel: "复盘优先" };
  if (strategy.sourceType === "platform_result") return { weight: Math.min(230, baseWeight + 25), weightLabel: "授权数据优先" };

  return { weight: baseWeight };
}

function evidenceQualityFromMemory(memory: NonNullable<GeneratePlanInput["memoryHints"]>[number]) {
  if (memory.sourceType === "platform_result") {
    return {
      sourceLabel: "用户授权后台数据",
      qualityLabel: memory.confidence >= 85 ? "高质量授权信号" : "授权信号需复核",
      qualityNotes: ["来自用户授权可见页或导入的作品表现", "优先于普通公开趋势", "只学习表现、题材和反馈结构"]
    };
  }

  if (memory.sourceType === "review") {
    return {
      sourceLabel: "复盘记忆",
      qualityLabel: "复盘优先",
      qualityNotes: ["来自已完成作品复盘", "优先转成下一篇执行约束"]
    };
  }

  return {
    sourceLabel: "写作记忆",
    qualityLabel: "个人经验",
    qualityNotes: ["来自本地写作记忆库"]
  };
}

function evidenceQualityFromStrategy(strategy: NonNullable<GeneratePlanInput["strategyHints"]>[number]) {
  if (strategy.sourceType === "platform_result") {
    return {
      sourceLabel: "用户授权后台数据",
      qualityLabel: strategy.confidence >= 85 ? "高质量授权策略" : "授权策略需复核",
      qualityNotes: ["来自用户授权可见页或导入的作品表现", "进入写作前检查项", "不复制原文和具体桥段"]
    };
  }

  if (strategy.sourceType === "review") {
    return {
      sourceLabel: "复盘策略",
      qualityLabel: "复盘优先",
      qualityNotes: ["来自作品复盘后的个人策略", "优先影响修订建议和下一篇策略"]
    };
  }

  return {
    sourceLabel: "个人策略",
    qualityLabel: "本地策略",
    qualityNotes: ["来自个人策略库"]
  };
}

type LearningEvidenceSourceType = StoryLearningBasis["evidenceCards"][number]["sourceType"];

const learningSourcePriority: Record<LearningEvidenceSourceType, number> = {
  user_authorized_data: 0,
  review_memory: 1,
  review_strategy: 2,
  user_requirement: 3,
  platform_trend: 4,
  writing_memory: 5,
  personal_strategy: 6
};

function basisSourceLabel(sourceType: LearningEvidenceSourceType) {
  const labels: Record<LearningEvidenceSourceType, string> = {
    user_requirement: "参数",
    platform_trend: "趋势",
    user_authorized_data: "授权数据",
    review_memory: "复盘记忆",
    review_strategy: "复盘策略",
    writing_memory: "写作记忆",
    personal_strategy: "个人策略"
  };

  return labels[sourceType];
}

function prioritizeEvidenceForStage(
  evidenceCards: StoryLearningBasis["evidenceCards"],
  sourceTypes: LearningEvidenceSourceType[]
) {
  const sourceSet = new Set(sourceTypes);

  return evidenceCards
    .filter((card) => sourceSet.has(card.sourceType))
    .sort((a, b) => learningSourcePriority[a.sourceType] - learningSourcePriority[b.sourceType] || (b.weight ?? b.confidence) - (a.weight ?? a.confidence));
}

function buildStageInfluences(evidenceCards: StoryLearningBasis["evidenceCards"]): StoryLearningBasis["stageInfluences"] {
  const stages: Array<{ stage: string; sourceTypes: LearningEvidenceSourceType[]; fallback: string }> = [
    { stage: "选题卡", sourceTypes: ["user_authorized_data", "platform_trend", "user_requirement"], fallback: "根据本次参数和平台题材方向生成候选选题。" },
    { stage: "情绪曲线", sourceTypes: ["review_memory", "writing_memory", "personal_strategy", "user_requirement"], fallback: "根据情绪方向和题材模板安排情绪起伏。" },
    { stage: "冲突阶梯", sourceTypes: ["review_memory", "review_strategy", "personal_strategy", "user_authorized_data"], fallback: "根据题材和主角目标递进冲突。" },
    { stage: "信息差", sourceTypes: ["user_authorized_data", "review_strategy", "personal_strategy"], fallback: "根据反转要求设计读者、主角和对手的信息差。" },
    { stage: "人物卡", sourceTypes: ["user_requirement", "writing_memory", "review_memory"], fallback: "根据主角类型和题材关系生成角色动机。" },
    { stage: "场景卡", sourceTypes: ["user_authorized_data", "review_memory", "personal_strategy", "writing_memory"], fallback: "按冲突阶梯拆成有目标、阻碍和钩子的场景。" },
    { stage: "场景提示", sourceTypes: ["writing_memory", "personal_strategy", "review_strategy"], fallback: "把场景卡转成逐场可执行提示词。" },
    { stage: "分场正文", sourceTypes: ["writing_memory", "review_memory", "personal_strategy", "user_requirement"], fallback: "正文 Agent 只按场景提示逐段生成，不直接黑盒生成全文。" },
    { stage: "测试读者", sourceTypes: ["platform_trend", "user_authorized_data", "review_strategy"], fallback: "按平台适配、情绪强度和节奏风险做读者评审。" },
    { stage: "修改建议", sourceTypes: ["review_memory", "review_strategy", "personal_strategy"], fallback: "把测试读者问题转成下一轮可执行修改清单。" }
  ];

  return stages.map((stage) => {
    const matched = prioritizeEvidenceForStage(evidenceCards, stage.sourceTypes).slice(0, 3);
    const sourceTypes = Array.from(new Set(matched.map((card) => card.sourceType)));
    const summary = matched.length
      ? matched.map((card) => `${basisSourceLabel(card.sourceType)}：${card.title}`).join("；")
      : stage.fallback;

    return {
      stage: stage.stage,
      sourceTypes: sourceTypes.length ? sourceTypes : ["user_requirement"],
      evidenceIds: matched.map((card) => card.id),
      summary
    };
  });
}

function stageInfluenceSummary(learningBasis: StoryLearningBasis | undefined, stage: string) {
  return learningBasis?.stageInfluences?.find((item) => item.stage === stage)?.summary;
}

function importantAvoidRules(
  memoryHints: NonNullable<GeneratePlanInput["memoryHints"]>,
  strategyHints: NonNullable<GeneratePlanInput["strategyHints"]>
) {
  const learnedAvoids = [
    ...memoryHints.map((memory) => memory.negativeExample),
    ...memoryHints.map((memory) => memory.rule),
    ...strategyHints.map((strategy) => strategy.rule),
    ...strategyHints.map((strategy) => strategy.evidence),
    ...strategyHints.map((strategy) => strategy.action)
  ].filter((item) => /不要|避免|少写|降低|狗血|套路|同质|水文|解释|替.*解决|拖慢|拖沓|节奏慢|无效铺垫/u.test(item));

  return uniqueItems([
    ...learnedAvoids,
    "不要复制热门作品原文、人物名或完整桥段。",
    "不要让外部强者替主角完成核心反击。",
    "不要用空泛解释填充正文。"
  ]).slice(0, 6);
}

function buildLearningBasis({
  base,
  memoryHints,
  strategyHints,
  selectedTopic,
  profile
}: {
  base: ReturnType<typeof normalizeInput>;
  memoryHints: NonNullable<GeneratePlanInput["memoryHints"]>;
  strategyHints: NonNullable<GeneratePlanInput["strategyHints"]>;
  selectedTopic: TopicCard;
  profile: NarrativeProfile;
}): StoryLearningBasis {
  const authorizedMemoryCount = memoryHints.filter((memory) => memory.sourceType === "platform_result").length;
  const authorizedStrategyCount = strategyHints.filter((strategy) => strategy.sourceType === "platform_result").length;
  const reviewMemoryCount = memoryHints.filter((memory) => memory.sourceType === "review").length;
  const reviewStrategyCount = strategyHints.filter((strategy) => strategy.sourceType === "review").length;
  const authorizedCount = authorizedMemoryCount + authorizedStrategyCount;
  const reviewCount = reviewMemoryCount + reviewStrategyCount;
  const ordinaryMemoryCount = memoryHints.length - authorizedMemoryCount - reviewMemoryCount;
  const ordinaryStrategyCount = strategyHints.length - authorizedStrategyCount - reviewStrategyCount;
  const sourceSummaryParts = [
    "本次读取用户参数与平台题材方向",
    authorizedCount ? `召回 ${authorizedCount} 条用户授权后台经验` : "",
    reviewCount ? `召回 ${reviewCount} 条复盘结论` : "",
    ordinaryMemoryCount ? `召回 ${ordinaryMemoryCount} 条写作记忆` : "",
    ordinaryStrategyCount ? `召回 ${ordinaryStrategyCount} 条个人策略` : ""
  ].filter(Boolean);
  const evidenceCards: StoryLearningBasis["evidenceCards"] = [
    {
      id: "basis-user-requirement",
      sourceType: "user_requirement",
      title: "本次创作参数",
      detail: `${base.platform} / ${selectedTopic.genre} / ${base.length} / ${base.emotion} / ${base.protagonist} / ${base.style}`,
      confidence: 100,
      weight: 100,
      sourceLabel: "用户本次参数",
      qualityLabel: "强约束",
      qualityNotes: ["本次创作必须遵守的用户输入"]
    },
    {
      id: "basis-platform-direction",
      sourceType: "platform_trend",
      title: "平台题材方向",
      detail: `采用「${selectedTopic.genre} + ${profile.themePair}」，读者承诺是：${selectedTopic.reader}`,
      confidence: selectedTopic.recommendationScore,
      weight: selectedTopic.recommendationScore,
      weightLabel: "公开趋势参考",
      sourceLabel: "平台公开趋势",
      qualityLabel: "普通公开趋势",
      qualityNotes: ["只作为题材方向参考", "会排在合格授权数据之后"]
    },
    ...memoryHints.map((memory) => ({
      id: `basis-memory-${memory.id}`,
      sourceType: evidenceSourceTypeFromMemory(memory.sourceType),
      title: evidenceTitleFromMemory(memory),
      detail: `${memory.rule}${memory.matchReason ? `；${memory.matchReason}` : ""}`,
      confidence: memory.confidence,
      ...evidenceWeightFromMemory(memory),
      ...evidenceQualityFromMemory(memory)
    })),
    ...strategyHints.map((strategy) => ({
      id: `basis-strategy-${strategy.id}`,
      sourceType: evidenceSourceTypeFromStrategy(strategy.sourceType),
      title: evidenceTitleFromStrategy(strategy),
      detail: `${strategy.rule}${strategy.action ? `；执行：${strategy.action}` : ""}${strategy.matchReason ? `；${strategy.matchReason}` : ""}`,
      confidence: strategy.confidence,
      ...evidenceWeightFromStrategy(strategy),
      ...evidenceQualityFromStrategy(strategy)
    }))
  ];
  const reviewMustApply = [
    ...strategyHints.filter((strategy) => strategy.sourceType === "review").map((strategy) => strategy.action || strategy.rule),
    ...memoryHints.filter((memory) => memory.sourceType === "review").map((memory) => memory.rule)
  ];
  const mustApply = uniqueItems([
    ...reviewMustApply,
    ...strategyHints.map((strategy) => strategy.action || strategy.rule),
    ...memoryHints.map((memory) => memory.rule),
    `围绕「${selectedTopic.protagonist}」设计一次由主角主动完成的关键选择。`,
    `用${profile.clueOne}、${profile.clueTwo}、${profile.clueThree}承接信息差和反转。`
  ]).slice(0, 6);

  return {
    sourceSummary: `${sourceSummaryParts.join("，")}。${reviewCount ? "复盘结论会优先转成下一篇的执行约束；" : ""}${authorizedCount ? "合格授权数据会优先于普通公开趋势；" : ""}空采集、登录页和字段不足内容不会进入创作依据。授权后台经验只作为你自己的表现信号使用，不复制任何作品内容。`,
    evidenceCards,
    stageInfluences: buildStageInfluences(evidenceCards),
    mustApply,
    avoid: importantAvoidRules(memoryHints, strategyHints),
    structureSuggestion: [`${profile.themePair}`, "压迫开场", "证据追查", "公开反击", "生活落点"].slice(0, 5),
    generationReason: `选择《${selectedTopic.title}》，是因为它同时满足「${selectedTopic.reader}」和「${selectedTopic.originalitySpace}」，能把平台方向、个人经验和原创边界合在同一套分场结构里。`
  };
}

export function createAgentTrace(input: {
  source: string;
  platform: string;
  genre: string;
  topicCards: TopicCard[];
  selectedTopic: TopicCard;
  emotionalCurve: EmotionalBeat[];
  conflictLadder: ConflictStep[];
  informationGap: InformationGap;
  characters: CharacterCard[];
  sceneCards: SceneCard[];
  scenePrompts: ScenePrompt[];
  sceneDrafts: SceneDraft[];
  readerReport: ReaderReport;
  learningBasis?: StoryLearningBasis;
  memoryUsed?: string[];
}): AgentTraceStep[] {
  return [
    {
      id: "trace-controller",
      order: 1,
      agent: "主控 Agent",
      role: "判断任务并安排子 Agent",
      input: `灵感/参数：${input.source}`,
      output: `确定平台「${input.platform}」、题材「${input.genre}」，只负责调度和校验，不直接黑盒写完整正文。`,
      handoff: "交给风向分析 Agent 判断赛道机会，再按场景提示逐段进入正文。",
      status: "done"
    },
    {
      id: "trace-trend",
      order: 2,
      agent: "风向分析 Agent",
      role: "匹配平台趋势和合规边界",
      input: `平台：${input.platform}；题材：${input.genre}`,
      output: input.memoryUsed?.length
        ? `参考 ${input.memoryUsed.length} 条写作记忆/个人策略，同时保留原创边界。${stageInfluenceSummary(input.learningBasis, "选题卡") ?? ""}`
        : `使用当前平台和题材方向，不复制热门作品桥段。${stageInfluenceSummary(input.learningBasis, "选题卡") ?? ""}`,
      handoff: "交给选题 Agent 生成可选题材卡。",
      status: "done"
    },
    {
      id: "trace-topic",
      order: 3,
      agent: "选题 Agent",
      role: "生成并推荐选题卡",
      input: `候选方向来自「${input.genre}」赛道。${stageInfluenceSummary(input.learningBasis, "选题卡") ?? ""}`,
      output: `生成 ${input.topicCards.length} 张选题卡，当前采用《${input.selectedTopic.title}》。`,
      handoff: "交给结构 Agent 设计情绪曲线、冲突阶梯和信息差。",
      status: "done"
    },
    {
      id: "trace-structure",
      order: 4,
      agent: "结构 Agent",
      role: "搭建短篇骨架",
      input: `选题：《${input.selectedTopic.title}》；核心冲突：${input.selectedTopic.conflict}`,
      output: `完成 ${input.emotionalCurve.length} 段情绪曲线、${input.conflictLadder.length} 级冲突阶梯、信息差和 ${input.characters.length} 张人物卡。依据：${stageInfluenceSummary(input.learningBasis, "冲突阶梯") ?? "本次参数和题材模板"}`,
      handoff: "交给场景卡 Agent 拆成可写场景。",
      status: "done"
    },
    {
      id: "trace-scene-card",
      order: 5,
      agent: "场景卡 Agent",
      role: "拆分场景和钩子",
      input: `信息差回收：${input.informationGap.payoff}；${stageInfluenceSummary(input.learningBasis, "场景卡") ?? "按结构拆场"}`,
      output: `拆成 ${input.sceneCards.length} 张场景卡，每场都有目标、阻碍、冲突升级和结尾钩子。`,
      handoff: "交给提示词 Agent 为每场组装写作提示。",
      status: "done"
    },
    {
      id: "trace-prompt",
      order: 6,
      agent: "提示词 Agent",
      role: "把结构转成可执行提示",
      input: `${input.sceneCards.length} 张场景卡和人物/信息差设定。${stageInfluenceSummary(input.learningBasis, "场景提示") ?? ""}`,
      output: `生成 ${input.scenePrompts.length} 条分场提示词，明确必须包含和需要避免的内容。`,
      handoff: "交给正文 Agent 按场景写正文草稿。",
      status: "done"
    },
    {
      id: "trace-draft",
      order: 7,
      agent: "正文 Agent",
      role: "逐场生成草稿",
      input: `${input.scenePrompts.length} 条场景提示词。${stageInfluenceSummary(input.learningBasis, "分场正文") ?? ""}`,
      output: `按场景提示生成 ${input.sceneDrafts.length} 段分场正文，再由系统合并为整篇草稿；不跳过场景直接生成全文。`,
      handoff: "交给测试读者 Agent 做质量评审。",
      status: "done"
    },
    {
      id: "trace-reader",
      order: 8,
      agent: "测试读者 Agent",
      role: "模拟平台读者反馈",
      input: `整篇草稿、分场正文和平台题材。${stageInfluenceSummary(input.learningBasis, "测试读者") ?? ""}`,
      output: `给出开头 ${input.readerReport.openingScore}、情绪 ${input.readerReport.emotionScore}、平台适配 ${input.readerReport.platformFitScore} 的评审。`,
      handoff: "交给编辑改稿 Agent 整理修订建议。",
      status: "done"
    },
    {
      id: "trace-editing",
      order: 9,
      agent: "编辑改稿 Agent",
      role: "整理修订建议",
      input: `测试读者问题、优化建议和分场小评审。${stageInfluenceSummary(input.learningBasis, "修改建议") ?? ""}`,
      output: `整理 ${input.readerReport.suggestions.length} 条优先修订建议，并保留每场的下一轮修改重点。`,
      handoff: "交给复盘沉淀 Agent，等待作品保存和发布后数据。",
      status: "done"
    },
    {
      id: "trace-review-memory",
      order: 10,
      agent: "复盘沉淀 Agent",
      role: "沉淀写作记忆并等待发布后数据",
      input: "测试读者报告、后续导入的阅读/收益/评论数据。",
      output: "保存作品时先沉淀测试读者建议；发布后可在复盘分析里继续沉淀个人策略。",
      handoff: "下一篇写作时由主控 Agent 自动读取相关经验。",
      status: "waiting"
    }
  ];
}

export type StoryWorkflowValidation = {
  ok: boolean;
  problems: string[];
  stageOrder: string[];
};

export function validateStoryWorkflow(plan: StoryPlan): StoryWorkflowValidation {
  const problems: string[] = [];

  if (plan.topicCards.length < 1) {
    problems.push("缺少选题卡。");
  }

  if (plan.emotionalCurve.length < 1) {
    problems.push("缺少情绪曲线。");
  }

  if (plan.conflictLadder.length < 1) {
    problems.push("缺少冲突阶梯。");
  }

  if (!plan.informationGap.payoff.trim()) {
    problems.push("缺少信息差回收设计。");
  }

  if (plan.characters.length < 1) {
    problems.push("缺少人物卡。");
  }

  if (plan.sceneCards.length < 1) {
    problems.push("缺少场景卡。");
  }

  for (const scene of plan.sceneCards) {
    const prompt = plan.scenePrompts.find((item) => item.sceneId === scene.id && item.index === scene.index);
    const draft = plan.sceneDrafts.find((item) => item.sceneId === scene.id && item.index === scene.index);

    if (!prompt) {
      problems.push(`第 ${scene.index} 场缺少同 sceneId 的场景提示词。`);
    }

    if (!draft) {
      problems.push(`第 ${scene.index} 场缺少同 sceneId 的分场正文。`);
    }
  }

  if (plan.scenePrompts.length !== plan.sceneCards.length) {
    problems.push("场景提示词数量必须和场景卡数量一致。");
  }

  if (plan.sceneDrafts.length !== plan.sceneCards.length) {
    problems.push("分场正文数量必须和场景卡数量一致。");
  }

  if (normalizeDraftText(plan.draft) !== normalizeDraftText(assembleStoryDraft(plan.sceneDrafts))) {
    problems.push("整篇正文 draft 必须由 sceneDrafts 按顺序合并而来。");
  }

  if (!plan.qualityReport?.checks?.length) {
    problems.push("缺少质量体检报告。");
  }

  if (!plan.originalityReport?.checks?.length) {
    problems.push("缺少原创边界报告。");
  }

  if (!plan.continuityMemory?.sceneMemories?.length) {
    problems.push("缺少作品连续性记忆。");
  }

  const stageOrder = plan.agentTrace?.map((step) => step.agent) ?? [];

  if (stageOrder.length && normalizeStageOrder(stageOrder).join("|") !== storyWorkflowAgentOrder.join("|")) {
    problems.push("Agent 调度轨迹必须按主控、风向、选题、结构、场景卡、提示词、正文、测试读者、编辑改稿、复盘沉淀的顺序。");
  }

  return {
    ok: problems.length === 0,
    problems,
    stageOrder
  };
}

export function enforceStoryWorkflow(plan: StoryPlan, fallbackPlan?: StoryPlan): StoryPlan {
  const topicCards = plan.topicCards.length ? plan.topicCards : fallbackPlan?.topicCards ?? [];
  const selectedTopic =
    topicCards.find((topic) => topic.id === plan.selectedTopic?.id) ??
    fallbackPlan?.selectedTopic ??
    topicCards[0] ??
    plan.selectedTopic;
  const emotionalCurve = plan.emotionalCurve.length ? plan.emotionalCurve : fallbackPlan?.emotionalCurve ?? [];
  const conflictLadder = plan.conflictLadder.length ? plan.conflictLadder : fallbackPlan?.conflictLadder ?? [];
  const informationGap = plan.informationGap?.payoff ? plan.informationGap : fallbackPlan?.informationGap ?? plan.informationGap;
  const characters = plan.characters.length ? plan.characters : fallbackPlan?.characters ?? [];
  const sceneCards = plan.sceneCards.length ? plan.sceneCards : fallbackPlan?.sceneCards ?? [];
  const generatedPrompts = createScenePrompts(sceneCards, {
    platform: plan.platform,
    genre: plan.genre,
    style: plan.tags[3] ?? "现实质感",
    selectedTopic,
    characters,
    informationGap
  });
  const scenePrompts = sceneCards.map((scene, index) => {
    const prompt = plan.scenePrompts.find((item) => item.sceneId === scene.id || item.index === scene.index) ?? generatedPrompts[index];

    return {
      ...prompt,
      id: prompt.id || `prompt-${scene.id}`,
      sceneId: scene.id,
      index: scene.index,
      title: scene.title
    };
  });
  const generatedDrafts = createSceneDrafts(sceneCards, plan.tags[3] ?? "现实质感", plan.memoryUsed?.[0] ?? "");
  const sceneDrafts = sceneCards.map((scene, index) => {
    const draft = plan.sceneDrafts.find((item) => item.sceneId === scene.id || item.index === scene.index) ?? generatedDrafts[index];

    return {
      ...draft,
      id: draft.id || `draft-${scene.id}`,
      sceneId: scene.id,
      index: scene.index,
      title: scene.title,
      wordTarget: draft.wordTarget || scene.estimatedWords,
      text: draft.text?.trim() ? draft.text : generatedDrafts[index]?.text ?? ""
    };
  });
  const learningBasis = plan.learningBasis ?? fallbackPlan?.learningBasis;
  const readerReport = plan.readerReport ?? fallbackPlan?.readerReport ?? makeReaderReport();
  const qualityReport =
    plan.qualityReport ??
    fallbackPlan?.qualityReport ??
    createStoryQualityReport({
      readerReport,
      sceneDrafts,
      sceneCards,
      informationGap,
      selectedTopic
    });
  const originalityReport =
    plan.originalityReport ??
    fallbackPlan?.originalityReport ??
    createStoryOriginalityReport({
      selectedTopic,
      readerReport,
      sceneCards,
      scenePrompts,
      characters,
      informationGap
    });
  const continuityMemory =
    plan.continuityMemory ??
    fallbackPlan?.continuityMemory ??
    createStoryContinuityMemory({
      characters,
      sceneCards,
      sceneDrafts,
      emotionalCurve,
      informationGap
    });
  const agentTrace = createAgentTrace({
    source: plan.source,
    platform: plan.platform,
    genre: plan.genre,
    topicCards,
    selectedTopic,
    emotionalCurve,
    conflictLadder,
    informationGap,
    characters,
    sceneCards,
    scenePrompts,
    sceneDrafts,
    readerReport,
    learningBasis,
    memoryUsed: plan.memoryUsed
  });

  return {
    ...plan,
    topicCards,
    selectedTopic,
    emotionalCurve,
    conflictLadder,
    informationGap,
    characters,
    sceneCards,
    scenePrompts,
    sceneDrafts,
    learningBasis,
    draft: assembleStoryDraft(sceneDrafts),
    readerReport,
    qualityReport,
    originalityReport,
    continuityMemory,
    agentTrace
  };
}

function normalizeDraftText(value: string) {
  return value.replace(/\s+/g, "");
}

function normalizeStageOrder(stages: string[]) {
  return stages.map((stage) => stage.trim()).filter(Boolean);
}

export function generateStoryPlan(input: GeneratePlanInput = {}): StoryPlan {
  const base = normalizeInput(input);
  const memoryHints = (input.memoryHints ?? []).filter((memory) => memory.rule).slice(0, 5);
  const strategyHints = (input.strategyHints ?? []).filter((strategy) => strategy.rule).slice(0, 5);
  const memoryUsed = [...memoryHints.map(summarizeMemory), ...strategyHints.map(summarizeStrategy)];
  const topicCards = makeTopicCards(base);
  const selectedTopic = topicCards.find((topic) => topic.id === input.selectedTopicId) ?? topicCards[0];
  const profile = createNarrativeProfile({ ...base, genre: selectedTopic.genre, protagonist: selectedTopic.protagonist });
  const emotionalCurve = makeEmotionalCurve(profile);
  const conflictLadder = makeConflictLadder(profile);
  const informationGap = makeInformationGap(profile);
  const characters = makeCharacters(base, profile);
  const learningBasis = buildLearningBasis({
    base,
    memoryHints,
    strategyHints,
    selectedTopic,
    profile
  });
  const sceneCards = makeSceneCards(profile);
  const scenePrompts = createScenePrompts(sceneCards, {
    platform: base.platform,
    genre: selectedTopic.genre,
    style: base.style,
    selectedTopic,
    characters,
    informationGap
  });
  const learningFocus = strategyHints[0]?.action || strategyHints[0]?.rule || memoryHints[0]?.rule || "";
  const sceneDrafts = createSceneDrafts(sceneCards, base.style, learningFocus);
  const draft = assembleStoryDraft(sceneDrafts);
  const readerReport = makeReaderReport(profile);
  const memoryReaderSuggestions = memorySuggestions(memoryHints);
  const strategyReaderSuggestions = strategySuggestions(strategyHints);
  const readerReportWithLearning = {
    ...readerReport,
    suggestions: [...memoryReaderSuggestions, ...strategyReaderSuggestions, ...readerReport.suggestions]
  };
  const qualityReport = createStoryQualityReport({
    readerReport: readerReportWithLearning,
    sceneDrafts,
    sceneCards,
    informationGap,
    selectedTopic
  });
  const originalityReport = createStoryOriginalityReport({
    selectedTopic,
    readerReport: readerReportWithLearning,
    sceneCards,
    scenePrompts,
    characters,
    informationGap
  });
  const continuityMemory = createStoryContinuityMemory({
    characters,
    sceneCards,
    sceneDrafts,
    emotionalCurve,
    informationGap
  });
  const learningSteps = [
    ...(memoryHints.length ? ["写作记忆 Agent 注入个人经验"] : []),
    ...(strategyHints.length ? ["个人策略库 Agent 注入复盘策略"] : [])
  ];

  return {
    id: `plan-${Date.now()}`,
    title: selectedTopic.title,
    providerMode: "mock",
    providerNotice: "当前使用本地模拟写作内核。配置 Kimi、DeepSeek 或 OpenAI API Key 后，后端会优先尝试真实 AI。",
    memoryUsed,
    learningBasis,
    source: base.inspiration,
    platform: base.platform,
    genre: selectedTopic.genre,
    topicJudgement: `这个灵感适合走「${selectedTopic.genre} + ${profile.themePair}」路线。第一版建议把重点放在主角主动拿回人生控制权，并用${profile.clueOne}、${profile.clueTwo}、${profile.clueThree}承接反转。${memoryUsed.length ? `本次还参考了 ${memoryUsed.length} 条个人经验：${memoryUsed.join("；")}。` : ""}`,
    topicCards,
    selectedTopic,
    emotionalCurve,
    conflictLadder,
    informationGap,
    characters,
    sceneCards,
    scenePrompts,
    sceneDrafts,
    synopsis: profile.synopsis,
    tags: [selectedTopic.genre, ...profile.themePair.split(" + "), base.style, base.ending],
    draft,
    readerReport: readerReportWithLearning,
    qualityReport,
    originalityReport,
    continuityMemory,
    agentSteps: learningSteps.length ? [...agentSteps.slice(0, -1), ...learningSteps, agentSteps.at(-1) ?? "复盘沉淀 Agent 写入记忆"] : agentSteps,
    agentTrace: createAgentTrace({
      source: base.inspiration,
      platform: base.platform,
      genre: selectedTopic.genre,
      topicCards,
      selectedTopic,
      emotionalCurve,
      conflictLadder,
      informationGap,
      characters,
      sceneCards,
      scenePrompts,
      sceneDrafts,
      readerReport: readerReportWithLearning,
      learningBasis,
      memoryUsed
    })
  };
}

export function rewriteMarkedText(markId: string, selectedText: string, feedback: string): RewriteSuggestion {
  const cleanFeedback = feedback.trim() || "降低夸张感，让人物反应更真实。";
  const newText = `${selectedText.replace(/[。！？]$/u, "")}。她没有把话说满，只是把手里的纸慢慢放平。那一刻的安静比争吵更锋利，也更像她终于替自己站稳了一次。`;

  return {
    markId,
    providerMode: "mock",
    providerNotice: "当前使用本地模拟改稿内核。配置 Kimi、DeepSeek 或 OpenAI API Key 后，后端会优先尝试真实 AI。",
    understanding: `你希望这段不要只靠情绪爆炸，而是更真实、更克制地完成力量变化。反馈重点是：${cleanFeedback}`,
    strategy: "保留原段落的冲突方向，减少夸张台词，增加动作细节和沉默压力。",
    newText,
    changeNotes: "新版把外放冲突改成内在决心，用动作承接情绪，适合现实女性成长赛道。",
    memoryImpact: ["用户偏好：克制反击", "人物状态：主角从忍让进入主动", "情绪弧线：压抑到觉醒"]
  };
}

export function reviseSceneDraft(input: ReviseSceneDraftInput): SceneDraftRevision {
  const cleanFeedback = input.feedback?.trim() || "加强本场的情绪压力和动作细节。";
  const scene = input.sceneDraft;
  const promptFocus = input.scenePrompt?.writingPrompt ?? scene.revisionFocus;
  const paragraphs = scene.text.split(/\n{2,}/u).filter(Boolean);
  const pressureLine = `修订后，本场把「${cleanFeedback}」落到更具体的动作里：主角先停住，没有急着解释，只把眼前那件能证明真相的东西收好。读者能看见主角不是突然变强，而是在一点点把主动权拿回来。`;
  const closingLine = `这一版继续遵守本场提示：${promptFocus}结尾仍然把钩子留住，但让主角的选择更清楚。`;
  const nextText = [paragraphs[0] ?? scene.text, pressureLine, ...paragraphs.slice(1, 4), closingLine].join("\n\n");
  const qualityScore = Math.min(98, Math.max(scene.qualityScore + 4, scene.qualityScore));

  return {
    ...scene,
    text: nextText,
    qualityScore,
    readerNotes: [
      `已根据反馈重写：${cleanFeedback}`,
      "本场保留原来的场景目标和结尾钩子。",
      "新版增加了动作承压和主角主动选择，方便继续进入正文编辑器细改。"
    ],
    revisionFocus: "下一轮重点检查：新增细节是否自然，是否仍然服务本场冲突升级。",
    providerMode: "mock",
    providerNotice: "当前使用本地模拟单场重写内核。配置 Kimi、DeepSeek 或 OpenAI API Key 后，后端会优先尝试真实 AI。",
    changeNotes: [
      "保留原场景结构，没有影响其他场景。",
      "强化了动作细节和主角主动性。",
      "提高本场小评分，便于继续筛查薄弱场景。"
    ]
  };
}
