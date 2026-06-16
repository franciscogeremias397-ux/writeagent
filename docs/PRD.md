# 《神笔马良短篇小说 Agent》需求开发文档

版本：v2.0
产品形态：网页端 AI 创作工作台，个人自用，本地运行版
用途：发给 Codex / 开发者进行产品开发
产品类型：自用型 AI 短篇小说创作 Agent
融合内容：原产品方案 + 本地运行版架构 + `awesome-novel-skill` 写作内核借鉴方案
核心目标：通过平台数据学习、趋势分析、多 Agent 写作流水线、正文标记改稿、作品复盘和个人创作策略库，形成从选题到发布后优化的完整闭环。

---

# 0. 项目一句话

「神笔马良短篇小说 Agent」是一个**本地运行的网页端 AI 创作工作台**，面向中国短篇小说平台创作者，帮助用户从一个灵感或一个赛道方向，生成可编辑、可复盘、可持续优化的短篇小说作品。

它不是简单的 AI 写作壳子，而是一个完整创作系统：

> 平台数据采集 → 热门赛道分析 → 题材机会判断 → 选题卡 → 情绪曲线 → 冲突阶梯 → 信息差设计 → 场景卡 → 正文生成 → 测试读者评审 → 人工标记改稿 → 发布数据回收 → 自动复盘 → 个人策略沉淀 → 反哺下一篇创作。

用户通过浏览器访问本地服务，例如：

```txt
http://localhost:3000
```

第一阶段不做移动 App，不做桌面客户端，不做浏览器插件，不做 SaaS 多用户平台。

---

# 1. 产品形态

## 1.1 已确定形态

本产品第一阶段形态为：

> **网页端 AI 创作工作台，个人自用，本地运行版。**

具体组成：

1. 前端 Web 工作台
2. 后端 API 服务
3. AI Agent 工作流
4. 数据采集任务
5. 本地数据库
6. 本地向量知识库
7. 本地文件存储
8. 后台任务队列
9. 本地作品工程目录
10. 个人创作策略库

## 1.2 使用方式

用户在自己的电脑上启动项目：

```bash
pnpm dev
```

然后通过浏览器打开：

```txt
http://localhost:3000
```

进入「神笔马良短篇小说 Agent」工作台。

## 1.3 部署方式

第一阶段支持：

1. 本地运行
2. 本地数据库
3. 本地任务队列
4. 本地文件存储
5. 用户自行配置 AI API Key
6. 本地数据备份和恢复

不要求：

1. 云服务器部署
2. 多用户账号系统
3. 在线支付
4. SaaS 管理后台
5. 移动端适配
6. 应用商店打包
7. 桌面客户端安装包

---

# 2. 产品定位

## 2.1 产品名称

神笔马良短篇小说 Agent

## 2.2 产品定位

短篇小说创作副驾驶 + 平台趋势分析助手 + 商业化作品复盘系统 + 个人写作记忆库。

## 2.3 目标用户

主要面向希望在番茄小说、短故事、网文平台等渠道发布短篇小说并获得收益的个人创作者。

第一阶段只服务单个用户，也就是产品拥有者本人。

## 2.4 核心价值

1. 帮用户判断当前平台适合写什么。
2. 帮用户从 0 到 1 生成短篇小说。
3. 帮用户把小说从“能写出来”提升为“结构完整、情绪有效、适合平台”。
4. 帮用户编辑、标记、局部重写正文。
5. 帮用户从真实平台表现中复盘。
6. 让 Agent 越写越懂用户账号的内容方向。
7. 把每次写作经验沉淀为可复用策略。

---

# 3. 借鉴 `awesome-novel-skill` 后的产品升级点

## 3.1 可借鉴的核心思想

`awesome-novel-skill` 的价值不在于 UI，而在于小说写作流程设计。它证明了 AI 写小说不能只靠一个 Prompt，而应该靠：

1. 多 Agent 分工
2. 总控 Agent 调度
3. 分阶段写作
4. 结构化文件/项目记忆
5. 动态更新人物、伏笔、情绪线
6. 每章/每段完成后归档
7. 用户反馈沉淀成写作记忆

本产品应吸收这些思想，但不照搬其终端交互和长篇卷章体系。

## 3.2 不直接照搬的地方

1. 不做终端型工具，而做网页端工作台。
2. 不照搬长篇“卷纲/章节”结构，而改成短篇“结构块/场景卡”。
3. 不复制其规则库、提示词库和原文内容，避免授权风险。
4. 不只追求“写完一本小说”，而是追求“平台趋势 + 商业结果 + 复盘闭环”。
5. 不让用户靠命令行操作，而是通过网页界面、编辑器、看板、书架完成流程。

## 3.3 融合后的核心升级

原方案中的 8 个子 Agent 升级为 10 个 Agent：

| Agent | 作用 |
|---|---|
| 主控 Agent | 调度流程，不直接写正文 |
| 风向分析 Agent | 分析榜单、活动、热门赛道 |
| 选题 Agent | 生成短篇选题卡 |
| 结构 Agent | 设计情绪曲线、冲突阶梯、信息差 |
| 场景卡 Agent | 把短篇拆成 5-8 个场景 |
| 提示词 Agent | 为每个场景生成写作提示词 |
| 正文 Agent | 分段生成正文 |
| 测试读者 Agent | 从平台读者角度评审 |
| 编辑改稿 Agent | 根据标记局部重写 |
| 复盘沉淀 Agent | 根据数据更新个人策略库 |

---

# 4. 合规与边界要求

本产品可以做：

1. 分析公开榜单、公开活动、公开作品简介、公开标签、公开评论摘要。
2. 分析用户本人授权提供的作者后台数据。
3. 支持 CSV、截图、手动粘贴、手动导入。
4. 建立趋势库、作品库、评论库、复盘库。
5. 用 AI 辅助原创创作、改稿、复盘。
6. 检查文本质量、原创性、套路化、空话、水文、逻辑问题。
7. 学习优秀作品的结构、节奏、题材趋势、评论反馈和可借鉴模式。
8. 生成“可学习点”和“避免复制点”。

本产品不做：

1. 不实现破解登录、绕过验证码、绕过平台风控。
2. 不实现规避平台 AI 检测、伪装 AI 内容来源等功能。
3. 不复制热门作品原文。
4. 不批量生成低质水文。
5. 不做未经授权的敏感数据抓取。
6. 不自动发布作品到平台，除非后续存在官方授权 API 或用户明确授权的合规方式。
7. 不内置任何“绕检测”“伪人类”“规避平台识别”的功能描述。

产品中应保留低调提示：

> AI 生成内容仅供创作参考，请结合人工编辑、原创设定与平台规范后再发布。

---

# 5. 产品原型设计方向

## 5.1 已确定视觉风格

用户倾向于方案一：黑白极简、Notion 风、高级、干净、留白充足、轻文艺、专业创作工具感。

## 5.2 Logo 方向

用户已有 Logo 参考：黑白极简书本 + 羽毛笔/笔锋元素。

视觉要求：

1. 保留黑白极简。
2. 保留书本/文稿/羽毛笔的写作意象。
3. 不要花哨渐变。
4. 不要卡通化过度。
5. 适合放在左侧导航顶部和应用图标中。
6. 整体接近 Notion 式图标气质：线条简洁、辨识度高、文艺但克制。

## 5.3 首页原型已确认

首页应是“创作驾驶舱”，不是正文编辑器。

首页必须包含：

1. 左侧导航。
2. 顶部品牌区与用户头像。
3. 主标题：从一个灵感，到一篇能发布的故事。
4. 灵感写作入口卡片。
5. 自动写作入口卡片。
6. 数据概览。
7. 今日风向标推荐。
8. 作品专栏预览。
9. 今日/本周创作进度。
10. 今日灵感或轻量提示。

首页禁止出现：

1. 正文编辑器。
2. 标记改稿。
3. 大段正文。
4. AI 局部重写面板。
5. 复杂人物关系图谱。

## 5.4 整体页面风格

1. 白底。
2. 黑色主按钮。
3. 浅灰分割线。
4. 卡片圆角但不过度。
5. 细线图标。
6. 字体层级清晰。
7. 图表以黑、灰为主，可以少量使用浅黄色作为“标记文本”背景色。
8. 页面不要太拥挤，强调创作工具的高级感。

---

# 6. 本地运行架构

## 6.1 总体架构

```txt
用户浏览器
   ↓
Next.js Web 工作台
   ↓
NestJS API 服务
   ↓
PostgreSQL 本地数据库
Redis 本地队列
pgvector 本地向量库
本地文件目录
AI Provider
数据采集任务
作品工程目录
```

## 6.2 本地服务组成

第一阶段本地运行时包含：

1. Web 前端：Next.js
2. API 后端：NestJS
3. 数据库：PostgreSQL
4. 向量能力：pgvector
5. 队列服务：Redis + BullMQ
6. 数据采集：Playwright + Cheerio
7. AI 调用：OpenAI API 或可替换模型供应商
8. 本地文件存储：`/storage`
9. 日志目录：`/logs`
10. 作品工程目录：`/workspace/works`

## 6.3 本地配置文件

需要提供 `.env.example`：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shenbi_agent
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=
AI_PROVIDER=openai
APP_URL=http://localhost:3000
LOCAL_STORAGE_DIR=./storage
WORKSPACE_DIR=./workspace
LOG_DIR=./logs
```

## 6.4 本地启动方式

建议提供：

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

## 6.5 Docker Compose

需要提供 `docker-compose.yml`，至少包含：

1. PostgreSQL
2. Redis

可选包含：

1. pgAdmin
2. Adminer

## 6.6 数据隐私

因为是个人自用本地运行版，默认要求：

1. 作品正文存储在本地数据库。
2. 导入数据存储在本地数据库。
3. 上传截图、CSV 存储在本地 `/storage` 目录。
4. 作品工程文件存储在 `/workspace/works`。
5. 不上传用户作品到非必要第三方服务。
6. AI 调用时仅发送当前任务所需上下文。
7. 提供清空本地数据的功能。
8. 提供本地备份和恢复功能。

---

# 7. 信息架构

左侧导航建议：

1. 首页
2. 灵感写作
3. 自动写作
4. 风向标
5. 作品专栏
6. 正文编辑器
7. 数据看板
8. 复盘分析
9. 写作记忆库
10. 数据源管理
11. 设置中心

MVP 阶段实现：

1. 首页
2. 灵感写作
3. 自动写作
4. 风向标
5. 作品专栏
6. 正文编辑器 / 标记改稿
7. 数据看板
8. 复盘分析
9. 数据源管理
10. 设置中心

---

# 8. 核心用户流程

## 8.1 灵感写作流程

1. 用户进入灵感写作页。
2. 输入一个灵感，例如：“一个被全家嫌弃的女孩，其实是失踪多年的豪门真千金。”
3. 主控 Agent 调度风向分析 Agent，判断该灵感适合的赛道。
4. 选题 Agent 生成 3-5 个选题卡。
5. 用户选择或修改选题。
6. 结构 Agent 生成情绪曲线、冲突阶梯、信息差设计。
7. 场景卡 Agent 生成 5-8 张场景卡。
8. 提示词 Agent 为每个场景生成写作提示词。
9. 正文 Agent 分段生成正文。
10. 测试读者 Agent 进行评分和问题诊断。
11. 用户进入正文编辑器。
12. 用户标记问题段落，提出修改意见。
13. 编辑改稿 Agent 根据标记局部重写。
14. 用户确认版本。
15. 复盘沉淀 Agent 更新作品记忆。
16. 作品进入作品专栏。
17. 发布后导入平台数据。
18. 复盘沉淀 Agent 生成复盘报告并沉淀个人策略。

## 8.2 自动写作流程

1. 用户进入自动写作页。
2. 用户选择平台、赛道、篇幅、情绪方向、主角类型、结局类型、文风。
3. 右侧显示风向标建议。
4. 选题 Agent 生成 3-5 个选题卡。
5. 用户选择一个选题。
6. 结构 Agent 生成情绪曲线、冲突阶梯、信息差。
7. 场景卡 Agent 生成 5-8 张场景卡。
8. 提示词 Agent 生成每个场景的写作提示词。
9. 正文 Agent 按场景分段生成正文。
10. 测试读者 Agent 评审。
11. 用户选择继续优化或进入编辑器。
12. 完成后进入作品专栏。
13. 发布后回收数据进行复盘。

## 8.3 数据学习闭环

1. 用户启动本地服务。
2. 数据采集任务根据配置拉取公开数据或读取导入文件。
3. 系统结构化拆解热门作品。
4. 风向分析 Agent 生成风向标报告。
5. 风向标指导下一次选题。
6. 用户作品发布后导入表现数据。
7. 复盘沉淀 Agent 分析表现。
8. 系统将经验写入个人创作策略库。
9. 下一篇写作时，主控 Agent 自动读取相关策略库和写作记忆库。

---

# 9. 页面需求

## 9.1 首页

### 页面目标

让用户快速进入创作、查看趋势、查看作品状态、查看核心数据。

### 主要模块

#### 1. 左侧导航

展示 Logo、产品名、导航入口、今日创作进度。

#### 2. 顶部区域

标题：

> 从一个灵感，到一篇能发布的故事。

副标题：

> 专为番茄等平台打造的短篇小说创作工作台。

#### 3. 灵感写作卡片

内容：

- 图标：灯泡/灵感
- 标题：灵感写作
- 描述：从灵感到故事设定，AI 帮你打开高潜力开篇。
- 功能点：灵感发散、故事设定、开篇生成、人设卡片
- 按钮：开始灵感写作

#### 4. 自动写作卡片

内容：

- 图标：羽毛笔
- 标题：自动写作
- 描述：选择赛道、篇幅、风格，一键生成短篇草稿。
- 功能点：题材机会、场景卡、正文生成、测试读者评审
- 按钮：开始自动写作

#### 5. 数据概览

显示：

- 阅读量
- 订阅量
- 收益
- 完读率
- 昨日变化

#### 6. 风向标推荐

展示今日推荐赛道：

- 女性成长
- 悬疑惊悚
- 宫斗宅斗
- 现言甜宠
- 男频脑洞

每个卡片展示热度。

#### 7. 作品专栏预览

展示最近作品卡片：

- 封面
- 作品名
- 赛道标签
- 字数
- 阅读量
- 收益
- 更新状态

#### 8. 今日灵感

展示一句可用灵感，按钮“换一个灵感”。

---

## 9.2 灵感写作页

### 页面目标

用户输入一个灵感，系统生成完整短篇的基础方案。

### 页面结构

左侧：导航
中间：灵感输入与生成结果
右侧：风向参考 / 生成步骤 / Agent 流程状态

### 模块

#### 1. 灵感输入框

输入提示：

> 写下你的灵感，比如一个人设、一个冲突、一个画面、一个反转。

支持：

- 普通文本输入
- 字数统计
- 清空
- 保存为灵感
- 一键生成

#### 2. 灵感增强选项

可选：

- 平台：番茄短故事 / 其他
- 目标赛道
- 情绪方向
- 篇幅
- 结局偏好
- 写作模式：步步确认 / 快速生成

#### 3. Agent 生成流程展示

展示当前执行步骤：

1. 灵感分析
2. 选题卡生成
3. 结构设计
4. 场景卡生成
5. 提示词组装
6. 正文生成
7. 测试读者评审
8. 保存作品

#### 4. 生成结果

包含：

1. 选题判断
2. 适合平台
3. 推荐赛道
4. 故事标题
5. 人物关系
6. 情绪曲线
7. 冲突阶梯
8. 信息差设计
9. 爽点/泪点/反转点
10. 场景卡
11. 可发布简介
12. 标签建议

#### 5. 生成正文按钮

按钮：

> 生成完整短篇

点击后进入正文生成流程，生成后进入正文编辑器。

---

## 9.3 自动写作页

### 页面目标

用户通过选择参数，快速生成短篇小说。

### 页面结构

左侧：导航
中间：写作参数表单
右侧：风向标建议与推荐赛道

### 表单字段

1. 平台
   - 番茄短故事
   - 番茄小说
   - 其他平台

2. 赛道
   - 女性成长
   - 现言甜宠
   - 悬疑惊悚
   - 宫斗宅斗
   - 古言甜宠
   - 男频脑洞
   - 都市逆袭
   - 现实情感

3. 篇幅
   - 3000 字
   - 8000 字
   - 1.5 万字
   - 3 万字

4. 情绪方向
   - 爽
   - 虐
   - 甜
   - 燃
   - 反转
   - 后劲大

5. 主角类型
   - 真千金
   - 小人物逆袭
   - 重生女主
   - 县城女性
   - 赘婿
   - 落魄贵女
   - 普通打工人

6. 结局类型
   - 大团圆
   - 反杀
   - 开放式
   - 意难平
   - 逆袭成功

7. 文风
   - 口语化
   - 电影感
   - 强情绪
   - 短剧感
   - 文艺克制
   - 现实质感

8. 生成模式
   - 步步确认
   - 快速生成

### 右侧风向标建议

显示：

1. 今日 TOP 赛道
2. 推荐理由
3. 同质化风险提醒
4. 适合篇幅
5. 适合人群
6. 参考结构
7. 近期不建议重复写的套路

### 输出流程

点击“开始自动生成”后：

1. 生成选题卡。
2. 用户选定选题。
3. 生成情绪曲线。
4. 生成冲突阶梯。
5. 生成信息差设计。
6. 生成场景卡。
7. 生成人物卡。
8. 生成正文。
9. 生成测试读者评审。
10. 跳转正文编辑器。

---

## 9.4 风向标页

### 页面目标

分析平台热门趋势，给出创作方向建议。

### 数据来源

1. 平台公开榜单。
2. 平台公开热门作品。
3. 平台活动/征文方向。
4. 用户个人作品表现数据。
5. 用户导入的 CSV / 截图 / 手动数据。

### 页面模块

#### 1. 今日热门赛道

展示：

- 赛道名称
- 热度
- 增长趋势
- 推荐指数
- 同质化风险

#### 2. 热度趋势图

展示近 7 天 / 30 天 / 90 天不同赛道热度变化。

#### 3. 榜单作品拆解

展示：

- 榜单排名
- 作品标题
- 标签
- 简介
- 热度
- 可学习点
- 避免复制点
- 开篇方式
- 冲突模式
- 情绪曲线
- 反转方式

#### 4. 题材机会卡

每张机会卡包含：

- 题材名
- 推荐理由
- 主角设定
- 核心冲突
- 爽点
- 人味细节
- 适合篇幅
- 推荐指数
- 同质化风险
- 可生成按钮

#### 5. 风险提醒

展示：

- 同质化严重赛道
- 平台可能疲劳题材
- 近期不建议重复写的套路
- 内容水化风险

---

## 9.5 作品专栏页

### 页面目标

以书架形式管理所有作品。作品数据应优先来自用户在平台上的真实作品数据，而不是只来自 Agent 写作历史。

### 页面布局

1. 顶部筛选：
   - 全部作品
   - 草稿
   - 已发布
   - 连载中
   - 已完结

2. 搜索：
   - 按作品名
   - 按赛道
   - 按标签

3. 书架卡片：
   - 封面
   - 作品名称
   - 赛道/风格标签
   - 篇幅长度
   - 状态
   - 阅读量
   - 收益
   - 完读率
   - 最近更新时间

### 作品详情页

点击作品进入详情页。

详情页 Tab：

1. 数据表现
2. 故事梗概
3. 人物卡片
4. 人物关系图谱
5. 情绪曲线
6. 场景卡
7. 正文
8. 测试读者报告
9. 复盘报告
10. 写作记忆

### 作品详情字段

1. 作品名称
2. 作品封面
3. 赛道/风格标签
4. 篇幅长度
5. 故事梗概
6. 主要人物卡片
7. 故事人物关系图谱
8. 情绪曲线
9. 冲突阶梯
10. 信息差设计
11. 场景卡
12. 短篇正文
13. 平台表现数据
14. 测试读者评审
15. 自动复盘报告
16. 经验沉淀记录

---

## 9.6 正文编辑器 / 标记改稿页

### 页面目标

用户在正文中标记问题，提交修改意见，Agent 进行局部优化。

### 页面结构

左侧：章节/结构块目录 / 场景卡 / 人物卡 / 剧情节点
中间：正文编辑器
右侧：标记列表 / AI 建议 / 对话框 / 测试读者反馈

### 功能要求

#### 1. 正文编辑

支持：

- 直接编辑正文
- 基础排版
- 保存草稿
- 字数统计
- 版本历史
- 自动保存
- 按场景卡定位正文片段

#### 2. 选中标记

用户选中文本后，可以点击“添加标记”。

标记要求：

- 被标记文字显示浅黄色背景。
- 标记自动编号，例如：标记1、标记2。
- 标记支持类型：
  - 删除
  - 优化
  - 重写
  - 逻辑问题
  - 情绪问题
  - 节奏问题
  - 人物问题
  - 信息差问题
  - 场景目标问题

#### 3. 删除标记

每个标记右侧有删除按钮。

删除后：

- 取消正文背景色。
- 从标记列表中移除。
- 不影响正文原文。

#### 4. @标记 反馈

右侧对话框支持输入：

> @标记1 这段情节太狗血了，降低夸张感，改成更真实的家庭冲突。
> @标记2 我希望男主在这里反击，但不要像霸总，要更克制、更聪明。

输入框输入 @ 时，应弹出标记选择列表。

#### 5. AI 局部重写

编辑改稿 Agent 返回：

1. 对用户反馈的理解。
2. 修改策略。
3. 新版片段。
4. 改动说明。
5. 是否影响人物关系/伏笔/情绪曲线。
6. 按钮：应用修改。
7. 按钮：重新生成。
8. 按钮：放弃。

#### 6. 一键替换

用户点击“应用修改”后，将新版片段替换原标记文本。

#### 7. 版本管理

每次应用修改生成一个版本记录。

版本记录包含：

- 时间
- 操作类型
- 标记编号
- 原文
- 新文
- 修改原因
- 影响到的场景卡
- 是否更新作品记忆

#### 8. 作品记忆更新

每次应用修改后，系统应提示是否更新：

- 人物状态
- 人物关系
- 已埋伏笔
- 已兑现伏笔
- 情绪弧线
- 用户偏好
- 后续写作注意事项

---

## 9.7 数据看板页

### 页面目标

展示平台趋势数据和用户自己作品表现数据。

### 模块 A：平台风向数据

1. 番茄短故事榜单
2. 热门赛道分布
3. 新书趋势
4. 高完读作品拆解
5. 高收益作品拆解
6. 活动/征文日历
7. 题材机会卡表现

### 模块 B：自己作品数据

1. 总阅读量
2. 总订阅量
3. 总收益
4. 平均完读率
5. 单作品收益排行
6. 评论关键词
7. 章节/场景流失点
8. 标签表现
9. 发布时间表现
10. 不同赛道收益对比

---

## 9.8 复盘分析页

### 页面目标

基于作品发布后的真实表现数据，生成复盘报告，沉淀到个人创作策略库。

### 复盘报告结构

1. 基础表现
   - 阅读量
   - 收益
   - 完读率
   - 评论反馈
   - 排名变化
   - 推荐量变化

2. 内容表现判断
   - 开头是否抓人
   - 中段是否拖沓
   - 高潮是否有效
   - 结尾是否完成情绪释放
   - 人物是否有记忆点
   - 场景卡是否有效
   - 信息差是否发挥作用
   - 冲突阶梯是否逐步升级

3. 优点总结

4. 问题总结

5. 下一篇创作建议

6. 经验沉淀

示例：

> 对该账号而言，“现实女性成长 + 亲情冲突 + 反击结尾”的表现优于“纯霸总甜宠”。

---

## 9.9 写作记忆库页

### 页面目标

展示和管理系统沉淀下来的写作记忆、个人偏好、策略规则。

### 记忆类型

1. 用户反馈记忆
2. 平台表现记忆
3. 复盘经验记忆
4. 赛道偏好记忆
5. 人物塑造偏好
6. 避免使用的套路
7. 高表现结构模式
8. 低表现问题模式

### 页面字段

每条记忆包含：

- 记忆来源
- 适用赛道
- 规则内容
- 正向例子
- 反向例子
- 置信度
- 关联作品
- 创建时间
- 最近更新时间
- 是否启用

---

## 9.10 数据源管理页

### 页面目标

管理本地数据来源、采集任务、导入文件、采集日志。

### 页面模块

1. 数据源列表
   - 番茄公开榜单
   - 番茄活动页
   - 作品链接
   - CSV 导入
   - 截图导入
   - 手动录入

2. 新增数据源
   - 名称
   - 类型
   - URL 或文件
   - 更新频率
   - 是否启用

3. 采集任务列表
   - 任务名
   - 状态
   - 最近运行时间
   - 成功数量
   - 失败原因
   - 日志入口

4. CSV 导入
   - 上传文件
   - 字段映射
   - 预览数据
   - 确认导入

5. 截图导入
   - 上传截图
   - OCR 识别占位
   - 手动校正
   - 确认导入

---

## 9.11 设置中心

### 页面目标

管理本地运行配置、AI API Key、数据存储、隐私和清理。

### 页面模块

1. AI 设置
   - Provider
   - API Key
   - 模型选择
   - Embedding 模型
   - 测试连接

2. 本地存储
   - 数据库状态
   - 文件存储目录
   - 作品工程目录
   - 日志目录
   - 清理缓存
   - 导出全部数据

3. 采集设置
   - 默认采集频率
   - 任务并发数
   - 超时时间
   - 是否启用定时任务

4. 隐私设置
   - 清空作品正文
   - 清空导入数据
   - 清空 AI 历史
   - 完整备份
   - 完整恢复

---

# 10. 核心写作内核设计

## 10.1 主控 Agent

主控 Agent 是总指挥，不直接写正文。

职责：

1. 判断当前用户请求属于灵感写作、自动写作、改稿还是复盘。
2. 选择调用哪些子 Agent。
3. 控制步骤顺序。
4. 管理上下文。
5. 在关键节点要求用户确认。
6. 将结果写入数据库和作品工程目录。
7. 遇到失败时回滚或重试。

## 10.2 选题卡

每个选题卡字段：

```txt
选题标题
一句话卖点
目标平台
目标赛道
目标读者
主角设定
核心冲突
情绪卖点
反转点
适合篇幅
平台适配度
同质化风险
原创空间
推荐指数
```

## 10.3 情绪曲线

示例：

```txt
压抑 → 误解 → 崩溃 → 觉醒 → 反击 → 爽感释放 → 后劲回味
```

字段：

1. 阶段名称
2. 情绪状态
3. 对应场景
4. 读者预期
5. 情绪释放点

## 10.4 冲突阶梯

示例：

```txt
被轻视 → 被夺走资源 → 被公开羞辱 → 真相暴露 → 正面反击 → 彻底反转
```

字段：

1. 冲突等级
2. 冲突事件
3. 谁和谁冲突
4. 冲突代价
5. 推动剧情的作用

## 10.5 信息差设计

字段：

1. 读者知道什么
2. 主角知道什么
3. 反派不知道什么
4. 什么时候揭示
5. 揭示后产生什么爽点或反转

## 10.6 场景卡

短篇正文不直接生成全文，应先生成 5-8 张场景卡。

每张场景卡字段：

```txt
场景编号
场景标题
场景目标
主角想要什么
阻碍是什么
冲突如何升级
信息差是什么
情绪是什么
关键动作
关键对白
结尾钩子
预计字数
关联人物
关联伏笔
```

## 10.7 提示词组装

提示词 Agent 根据以下内容组装每个场景的写作提示词：

1. 选题卡
2. 情绪曲线
3. 冲突阶梯
4. 信息差设计
5. 人物卡
6. 场景卡
7. 用户文风偏好
8. 平台风向
9. 个人策略库
10. 前文摘要

## 10.8 正文分段生成

正文 Agent 按场景逐段生成，不一次性生成全文。

流程：

1. 生成场景 1 正文
2. 测试读者 Agent 评审
3. 需要时自动轻量优化
4. 保存
5. 进入场景 2
6. 重复直到全篇完成

## 10.9 测试读者 Agent

测试读者 Agent 从平台读者角度评审作品。

评分维度：

```txt
开头抓人程度
人物代入感
情绪推进
中段拖沓风险
反转有效性
短篇闭环完整度
平台适配度
同质化风险
人味细节
评论区话题潜力
```

输出示例：

```txt
开头抓人程度：82
人物代入感：76
情绪推进：88
中段拖沓风险：中
反转有效性：强
短篇闭环完整度：90
平台适配度：84
同质化风险：偏高

主要问题：
1. 女主反击动机明确，但中段有两处冲突重复。
2. 男主存在感偏工具人。
3. 结尾爽点释放足够，但余味不足。

优化建议：
1. 删除第二次重复争吵。
2. 增加一个女主独立解决问题的动作。
3. 结尾增加一句克制但有后劲的动作描写。
```

## 10.10 作品记忆更新器

每次完成一个场景、应用一次改稿、完成一篇作品后，系统应自动更新作品记忆。

更新内容：

1. 人物状态
2. 人物关系变化
3. 已埋伏笔
4. 已兑现伏笔
5. 情绪弧线
6. 用户修改偏好
7. 后续写作注意事项
8. 高表现写法
9. 低表现问题

---

# 11. 数据采集需求

## 11.1 数据来源

### 公开数据

1. 平台公开榜单
2. 平台公开热门作品
3. 平台公开活动/征文
4. 公开作品标题、简介、标签、排名、热度
5. 公开评论摘要

### 用户授权数据

1. 作者主页作品数据
2. 作者后台截图
3. 用户手动导入 CSV
4. 用户手动输入收益、阅读量、完读率
5. 用户粘贴作品链接

## 11.2 技术方式

1. Playwright：用于用户授权页面、可视化自动化、截图解析辅助。
2. Cheerio：用于公开网页 HTML 解析。
3. CSV 导入：用于用户导出的数据。
4. 截图 OCR：作为备用方式，但不要作为主要方式。
5. 定时任务：用于榜单与趋势更新。
6. 失败重试与任务日志。

## 11.3 数据采集边界

禁止：

1. 绕过登录。
2. 破解接口。
3. 绕过验证码。
4. 绕过反爬。
5. 未授权抓取用户后台数据。

允许：

1. 用户登录后授权自己的数据。
2. 用户手动上传截图或 CSV。
3. 分析公开页面。
4. 记录采集日志和失败原因。

---

# 12. 本地作品工程目录设计

借鉴 `awesome-novel-skill` 的结构化文件思想，本产品虽然以数据库为主，但每部作品也应支持导出为本地工程目录。

## 12.1 目录结构

```txt
workspace/
  works/
    离婚后我在县城开早餐店/
      story.md
      outline.md
      characters.md
      emotional_curve.md
      conflict_ladder.md
      information_gap.md
      scene_cards.md
      draft.md
      marks.md
      reader_report.md
      review.md
      writing_memory.md
      strategy.md
      exports/
```

## 12.2 文件说明

| 文件 | 作用 |
|---|---|
| story.md | 作品总索引 |
| outline.md | 故事大纲 |
| characters.md | 人物卡 |
| emotional_curve.md | 情绪曲线 |
| conflict_ladder.md | 冲突阶梯 |
| information_gap.md | 信息差设计 |
| scene_cards.md | 场景卡 |
| draft.md | 正文草稿 |
| marks.md | 标记改稿记录 |
| reader_report.md | 测试读者报告 |
| review.md | 发布后复盘 |
| writing_memory.md | 本作品写作记忆 |
| strategy.md | 经验沉淀 |

## 12.3 作用

1. 方便备份。
2. 方便迁移。
3. 方便用户直接查看和修改。
4. 方便 Codex 读取作品项目。
5. 不让作品数据完全锁在数据库里。

---

# 13. 技术架构建议

## 13.1 前端

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- lucide-react
- Zustand
- TanStack Query
- React Hook Form
- Zod
- TipTap
- React Flow
- Recharts

## 13.2 后端

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- pgvector
- Redis
- BullMQ
- Playwright
- Cheerio

## 13.3 AI

- OpenAI API
- Embeddings
- RAG
- Prompt pipeline
- Structured output
- Agent workflow orchestration
- AI Provider 抽象层

## 13.4 推荐项目结构

```txt
shenbi-agent/
  apps/
    web/
      app/
      components/
      features/
      lib/
      styles/
    api/
      src/
        modules/
          works/
          trends/
          writing/
          editor/
          review/
          crawler/
          datasource/
          ai/
          settings/
          memory/
          workspace/
        prisma/
  packages/
    shared/
      types/
      schemas/
      prompts/
  workspace/
    works/
  storage/
    uploads/
    exports/
    screenshots/
  logs/
  docs/
    PRD.md
    AGENTS.md
    API.md
    LOCAL_SETUP.md
  docker-compose.yml
  .env.example
  README.md
```

---

# 14. 数据库模型建议

## 14.1 Work

```ts
type Work = {
  id: string;
  title: string;
  cover: string;
  status: "draft" | "published" | "serializing" | "finished";
  platform: string;
  platformUrl?: string;
  genreTags: string[];
  styleTags: string[];
  wordCount: number;
  summary: string;
  fullText?: string;
  readCount: number;
  subscriptionCount: number;
  revenue: number;
  completionRate: number;
  updatedAt: string;
  createdAt: string;
};
```

## 14.2 Character

```ts
type Character = {
  id: string;
  workId: string;
  name: string;
  avatar: string;
  role: string;
  personality: string;
  background: string;
  desire: string;
  fear: string;
  relationNotes: string;
};
```

## 14.3 Mark

```ts
type Mark = {
  id: string;
  workId: string;
  sceneCardId?: string;
  chapterId?: string;
  index: number;
  selectedText: string;
  comment?: string;
  type: "delete" | "optimize" | "rewrite" | "logic" | "emotion" | "rhythm" | "character" | "information_gap" | "scene_goal";
  startOffset: number;
  endOffset: number;
  createdAt: string;
};
```

## 14.4 Trend

```ts
type Trend = {
  id: string;
  platform: string;
  genre: string;
  heat: number;
  growthRate: number;
  opportunityScore: number;
  saturationScore: number;
  reason: string;
  tags: string[];
  createdAt: string;
};
```

## 14.5 PlatformWork

```ts
type PlatformWork = {
  id: string;
  platform: string;
  title: string;
  author?: string;
  genreTags: string[];
  summary: string;
  rank?: number;
  heatScore?: number;
  sourceUrl: string;
  collectedAt: string;
};
```

## 14.6 WorkAnalysis

```ts
type WorkAnalysis = {
  id: string;
  platformWorkId: string;
  openingStyle: string;
  mainConflict: string;
  protagonistType: string;
  emotionalCurve: string;
  plotStructure: string;
  reversalPoints: string[];
  endingType: string;
  readerFeedbackSummary: string;
  learnablePatterns: string[];
  avoidCopyingElements: string[];
};
```

## 14.7 SceneCard

```ts
type SceneCard = {
  id: string;
  workId: string;
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
  relatedCharacterIds: string[];
  relatedForeshadows: string[];
};
```

## 14.8 ReaderReport

```ts
type ReaderReport = {
  id: string;
  workId: string;
  openingScore: number;
  empathyScore: number;
  emotionScore: number;
  reversalScore: number;
  closureScore: number;
  platformFitScore: number;
  samenessRisk: string;
  problems: string[];
  suggestions: string[];
  createdAt: string;
};
```

## 14.9 ReviewReport

```ts
type ReviewReport = {
  id: string;
  workId: string;
  performanceSummary: string;
  strengths: string[];
  weaknesses: string[];
  nextWritingAdvice: string[];
  strategyLessons: string[];
  createdAt: string;
};
```

## 14.10 WritingMemory

```ts
type WritingMemory = {
  id: string;
  sourceType: "user_feedback" | "review" | "platform_result" | "manual_rule" | "reader_report";
  genre?: string;
  rule: string;
  positiveExample?: string;
  negativeExample?: string;
  confidence: number;
  relatedWorkIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

## 14.11 PersonalStrategy

```ts
type PersonalStrategy = {
  id: string;
  rule: string;
  evidenceWorkIds: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
};
```

## 14.12 AppSetting

```ts
type AppSetting = {
  id: string;
  key: string;
  value: string;
  encrypted: boolean;
  updatedAt: string;
};
```

---

# 15. API 设计建议

## 15.1 Works

```txt
GET    /api/works
GET    /api/works/:id
POST   /api/works
PATCH  /api/works/:id
DELETE /api/works/:id
POST   /api/works/:id/export-workspace
```

## 15.2 Trends

```txt
GET    /api/trends
GET    /api/trends/today
GET    /api/trends/opportunities
POST   /api/trends/analyze
```

## 15.3 Writing

```txt
POST /api/writing/inspiration
POST /api/writing/auto
POST /api/writing/topic-cards
POST /api/writing/structure
POST /api/writing/scene-cards
POST /api/writing/prompts
POST /api/writing/draft
POST /api/writing/reader-report
POST /api/writing/publish-package
```

## 15.4 Editor

```txt
POST   /api/marks
GET    /api/works/:id/marks
DELETE /api/marks/:id
POST   /api/editor/rewrite-mark
POST   /api/editor/apply-rewrite
GET    /api/works/:id/versions
```

## 15.5 Review

```txt
POST /api/review/work/:id
GET  /api/review/work/:id
GET  /api/strategy
```

## 15.6 Memory

```txt
GET    /api/memory
POST   /api/memory
PATCH  /api/memory/:id
DELETE /api/memory/:id
POST   /api/memory/extract-from-work/:id
```

## 15.7 Data Sources

```txt
GET    /api/datasources
POST   /api/datasources
POST   /api/datasources/import-csv
POST   /api/datasources/import-screenshot
POST   /api/crawler/jobs
GET    /api/crawler/jobs
GET    /api/crawler/jobs/:id
```

## 15.8 Settings

```txt
GET   /api/settings
PATCH /api/settings
POST  /api/settings/test-ai
POST  /api/settings/export-data
POST  /api/settings/import-data
POST  /api/settings/clear-cache
```

---

# 16. Codex 开发方式

## 16.1 建议第一条 Codex 指令

```txt
请先阅读本需求文档，并进入计划模式。
不要立刻写代码。
请先输出：
1. 你理解的产品目标
2. 本地运行版建议架构
3. 借鉴 awesome-novel-skill 后的写作内核设计
4. 工程结构
5. 里程碑拆分
6. 第一次提交要完成的文件列表
7. 你需要我补充确认的问题
```

## 16.2 第二条 Codex 指令

```txt
请按照本需求文档创建项目骨架。

产品形态：
网页端 AI 创作工作台，个人自用，本地运行版。

要求：
1. 使用 monorepo 结构。
2. 前端使用 Next.js + TypeScript + Tailwind CSS + shadcn/ui。
3. 后端使用 NestJS + TypeScript。
4. 数据库使用 PostgreSQL + Prisma。
5. 使用 Docker Compose 启动 PostgreSQL 和 Redis。
6. 预留 pgvector、Redis、BullMQ。
7. 创建 docs/PRD.md、docs/AGENTS.md、docs/API.md、docs/LOCAL_SETUP.md。
8. 创建 .env.example。
9. 创建 storage/、workspace/、logs/ 目录。
10. 实现基础 Layout、左侧导航、首页。
11. 建立 mock 数据。
12. 建立 Work、SceneCard、WritingMemory、ReaderReport 等核心类型。
13. 不要实现真实平台抓取，先实现数据采集任务框架和 mock 数据源。
14. 完成后运行 lint、typecheck、build。
```

注意：第 13 条不是说最终不做抓取，而是第一步先搭好采集框架，避免一开始卡在平台数据接入上。

---

# 17. AGENTS.md 建议内容

请在项目根目录创建 `AGENTS.md`：

```md
# AGENTS.md

## Project
神笔马良短篇小说 Agent

## Product Shape
This is a local-first Web App for personal use.

The user runs the project locally and opens:
http://localhost:3000

Do not build:
- SaaS multi-user platform
- Mobile app
- Desktop app
- Browser extension

## Goal
Build a self-use AI short-story writing workspace for Chinese web fiction creators.

The product must support:
- Platform trend data collection
- Trend analysis
- Inspiration writing
- Automatic story generation
- Topic cards
- Emotional curve
- Conflict ladder
- Information gap design
- Scene cards
- Test reader report
- Workshelf
- Editor with marked rewrite
- Data dashboard
- Review analysis
- Writing memory
- Personal writing strategy memory
- Local data storage

## Design Style
- Black and white minimal UI
- Notion-inspired
- Use the provided logo as visual reference
- Clean, spacious, high-end, literary
- Home page is a creative cockpit
- Do not put marked rewrite or long editor on the home page

## Writing Core
The writing system must use a main controller agent and sub-agent workflow.

Agents:
- Controller Agent
- Trend Analysis Agent
- Topic Agent
- Structure Agent
- Scene Card Agent
- Prompt Agent
- Draft Agent
- Test Reader Agent
- Editing Agent
- Review Memory Agent

The Controller Agent should not directly write the full text. It coordinates the workflow.

## Short Story Structure
Do not generate the full story directly.
Generate in this order:
1. Topic cards
2. Emotional curve
3. Conflict ladder
4. Information gap
5. Character cards
6. Scene cards
7. Scene prompts
8. Draft by scene
9. Test reader review
10. Revision suggestions

## Tech Stack
Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- lucide-react
- Zustand
- TanStack Query
- React Hook Form
- Zod
- TipTap
- React Flow
- Recharts

Backend:
- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Redis
- BullMQ
- pgvector
- Playwright
- Cheerio

AI:
- OpenAI API
- Embeddings
- RAG
- Structured output
- Multi-agent workflow
- Provider abstraction

Local Runtime:
- docker-compose for PostgreSQL and Redis
- .env for API keys and local paths
- /storage for uploaded files
- /workspace for exported work projects
- /logs for logs

## Compliance Rules
Allowed:
- Public page analysis
- User-authorized data import
- CSV import
- Screenshot import
- User's own author data analysis
- Content quality improvement
- Learning structure and trends from public works

Not allowed:
- Bypassing login
- Bypassing captcha
- Bypassing platform anti-bot systems
- Bypassing AI detection
- Copying full copyrighted stories
- Generating low-quality spam content

## Home Page Requirements
Home page must include:
- Left sidebar
- Slogan: 从一个灵感，到一篇能发布的故事。
- Inspiration Writing card
- Auto Writing card
- Data overview
- Wind Vane recommendation
- Workshelf preview
- Today writing progress

Home page must NOT include:
- Long text editor
- Marked rewrite panel
- AI rewrite suggestions
- Character relationship graph

## Editor Requirements
The editor page must support:
- Chapter or scene outline
- Main document editor
- Select text and add mark
- Marked text background color
- Delete mark
- Mark list
- Chat input with @标记
- AI rewrite suggestion
- Apply rewrite
- Version history
- Update writing memory after applying changes

## Development Rules
- Use reusable components.
- Keep business logic modular.
- Keep API DTOs validated.
- Use mock data before real integration.
- Add tests for core logic.
- Run lint, typecheck, and build before summarizing.
```

---

# 18. 开发里程碑

## Milestone 1：本地项目骨架与首页

完成：

1. Monorepo 项目结构。
2. Next.js 前端。
3. NestJS 后端。
4. Docker Compose。
5. PostgreSQL。
6. Redis。
7. `.env.example`。
8. `storage/`、`workspace/` 和 `logs/`。
9. 前端基础 Layout。
10. 左侧导航。
11. 首页。
12. mock 数据。
13. 基础类型定义。
14. docs 文档。
15. AGENTS.md。

验收：

1. 用户能本地运行。
2. 浏览器打开 `http://localhost:3000` 可以看到首页。
3. 页面风格符合方案一。
4. 首页无标记改稿。
5. lint、typecheck、build 通过。

---

## Milestone 2：数据库与后端基础

完成：

1. Prisma schema。
2. PostgreSQL 连接。
3. Works、Trends、Marks、Reviews、Settings、SceneCards、WritingMemory 基础 API。
4. Swagger 或 API 文档。
5. 本地数据备份/恢复接口占位。

验收：

1. 能创建作品。
2. 能读取作品列表。
3. 能读取趋势数据。
4. 能保存标记。
5. 能保存复盘报告。
6. 能保存场景卡。
7. 能保存写作记忆。
8. 能读取本地设置。

---

## Milestone 3：写作内核原型

完成：

1. 主控 Agent 框架。
2. 选题卡生成。
3. 情绪曲线生成。
4. 冲突阶梯生成。
5. 信息差设计。
6. 场景卡生成。
7. 测试读者报告 mock。
8. 写作记忆 mock。

验收：

1. 能从一个灵感生成选题卡。
2. 能生成场景卡。
3. 能生成测试读者报告。
4. 能保存到数据库。
5. 能在页面展示。

---

## Milestone 4：数据采集框架

完成：

1. 数据源管理页。
2. 公开页面采集任务框架。
3. CSV 导入。
4. 截图导入占位。
5. Playwright 任务框架。
6. Cheerio 解析器接口。
7. BullMQ 队列。
8. 任务日志。
9. 本地日志写入 `/logs`。

验收：

1. 能创建采集任务。
2. 能用 mock 数据源生成趋势数据。
3. 能查看任务状态。
4. 能导入 CSV 到作品数据。
5. 失败任务有日志。

---

## Milestone 5：风向标

完成：

1. 热门赛道列表。
2. 热度趋势图。
3. 题材机会卡。
4. 同质化风险评分。
5. 今日推荐。
6. 榜单作品拆解。
7. 可学习点和避免复制点。

验收：

1. 风向标可基于数据生成推荐。
2. 推荐结果可用于自动写作参数。
3. 用户能点击机会卡进入自动写作。

---

## Milestone 6：灵感写作与自动写作

完成：

1. 灵感输入。
2. 灵感分析。
3. 选题生成。
4. 自动写作参数表单。
5. 大纲生成。
6. 人物卡生成。
7. 场景卡生成。
8. 正文分段生成。
9. 测试读者评审。
10. 写作结果保存为作品。

验收：

1. 能从一个灵感生成完整方案。
2. 能从参数生成短篇草稿。
3. 能按场景生成正文。
4. 能生成测试读者报告。
5. 能保存到作品专栏。
6. 生成流程有 loading 和错误处理。

---

## Milestone 7：正文编辑器与标记改稿

完成：

1. 正文编辑器。
2. 选中文本添加标记。
3. 标记背景色。
4. 删除标记。
5. @标记 输入。
6. AI 局部重写。
7. 应用修改。
8. 版本历史。
9. 修改后更新作品记忆。

验收：

1. 标记功能可用。
2. 删除标记可用。
3. @标记 可选择。
4. AI 建议可应用。
5. 应用后正文更新。
6. 版本历史保存。
7. 写作记忆可更新。

---

## Milestone 8：作品专栏与作品详情

完成：

1. 书架列表。
2. 作品筛选。
3. 作品详情。
4. 人物卡。
5. 人物关系图谱。
6. 情绪曲线。
7. 场景卡。
8. 正文 Tab。
9. 测试读者报告 Tab。
10. 数据表现 Tab。
11. 复盘报告 Tab。
12. 写作记忆 Tab。

验收：

1. 作品列表清晰。
2. 作品详情完整。
3. 支持从作品详情进入正文编辑器。
4. 数据来自数据库或导入数据。

---

## Milestone 9：数据看板与自动复盘

完成：

1. 平台数据看板。
2. 自己作品数据看板。
3. 自动复盘生成。
4. 个人策略库。
5. 下一篇建议。
6. 写作记忆库。

验收：

1. 能根据作品表现生成复盘。
2. 能沉淀经验。
3. 下一次写作可读取个人策略。
4. 写作记忆可查看、启用、禁用。

---

## Milestone 10：本地设置与备份恢复

完成：

1. 设置中心。
2. AI API Key 配置。
3. 测试 AI 连接。
4. 本地数据导出。
5. 本地数据导入。
6. 清空缓存。
7. 清空日志。
8. 清空全部数据。
9. 导出作品工程目录。

验收：

1. 用户能配置 API Key。
2. 用户能测试模型连接。
3. 用户能导出本地数据。
4. 用户能恢复本地数据。
5. 用户能清理缓存。
6. 用户能导出单部作品工程目录。

---

# 19. 验收标准总表

## UI 验收

1. 风格符合黑白极简 Notion 风。
2. 首页是创作驾驶舱。
3. 标记改稿只出现在编辑器，不出现在首页。
4. 页面信息层级清楚。
5. 所有按钮、卡片、列表视觉统一。
6. 场景卡、测试读者报告、写作记忆要有清晰可视化。

## 本地运行验收

1. 按 README 能完成本地启动。
2. `docker compose up -d` 能启动 PostgreSQL 和 Redis。
3. `pnpm dev` 能启动前后端。
4. 浏览器能访问 `http://localhost:3000`。
5. 本地数据能持久化。
6. 停止服务后数据不丢失。

## 功能验收

1. 能输入灵感并生成故事方案。
2. 能选择参数自动生成短篇。
3. 能生成选题卡、情绪曲线、冲突阶梯、信息差、场景卡。
4. 能生成测试读者报告。
5. 能展示风向标推荐。
6. 能管理作品专栏。
7. 能进入正文编辑器。
8. 能标记正文并修改。
9. 能导入作品数据。
10. 能生成复盘报告。
11. 能沉淀写作记忆。

## 数据验收

1. 采集任务有日志。
2. 导入数据可追溯来源。
3. 趋势分析有数据依据。
4. 用户作品表现可进入复盘。
5. 个人策略库可被下一次写作读取。
6. 写作记忆可启用、禁用、编辑。

## 安全与合规验收

1. 不绕过平台登录。
2. 不绕过验证码。
3. 不绕过 AI 检测。
4. 不复制热门作品全文。
5. 不自动发布低质内容。
6. 用户数据本地或私有保存。
7. API Key 不写死在代码里。
8. `.env` 不提交到仓库。

---

# 20. 需要后续确认的问题

1. 本地数据库是否使用 Docker PostgreSQL，还是使用 SQLite 作为简化版？
2. 是否优先只支持番茄，后续再扩展其他平台？
3. 用户是否能提供番茄作者后台导出的 CSV？
4. 是否要接 OpenAI API，还是先保留模型供应商抽象层？
5. 正文编辑器使用 TipTap、Lexical 还是 ProseMirror？
6. 作品封面是否需要 AI 生成？
7. 人物关系图谱使用 React Flow 还是自研 SVG？
8. 是否需要本地账号密码，还是单用户免登录？
9. 是否需要一键打包成本地可执行脚本？
10. 是否需要自动备份到本地指定文件夹？
11. 场景卡默认生成 5 张、6 张还是 8 张？
12. 测试读者 Agent 是否每个场景都评审，还是全文完成后评审？
13. 写作记忆是否允许用户手动删除？
14. 作品工程目录是否每次保存自动同步，还是手动导出？

推荐默认答案：

1. 第一版使用 Docker PostgreSQL，不用 SQLite。
2. 第一版优先支持番茄。
3. 支持 CSV、截图、手动录入三种导入方式。
4. 接 OpenAI API，同时保留 Provider 抽象层。
5. 编辑器用 TipTap。
6. 封面生成后续做。
7. 人物关系图谱用 React Flow。
8. 单用户免登录。
9. 提供启动脚本。
10. 提供本地备份功能。
11. 场景卡默认 6 张。
12. 全文完成后评审，重点场景可单独评审。
13. 允许用户手动删除或禁用。
14. 第一版手动导出，后续自动同步。

---

# 21. 推荐第一版技术选择

## 编辑器

建议优先使用 TipTap。

原因：

1. 基于 ProseMirror，适合富文本。
2. 支持 mark / highlight。
3. 可扩展 @mention。
4. 适合做标记改稿。

## 人物关系图谱

建议使用 React Flow。

## 图表

建议使用 Recharts。

## 后台任务

建议使用 BullMQ + Redis。

## 数据库

PostgreSQL + Prisma + pgvector。

## AI 调用

抽象成 Provider：

```ts
interface AIProvider {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  embed(input: EmbedInput): Promise<EmbedResult>;
}
```

后续可切换 OpenAI、国产模型或本地模型。

---

# 22. 最重要的产品原则

1. 产品形态是网页端 AI 创作工作台，个人自用，本地运行。
2. 首页保持干净，不放编辑器。
3. 写作流程要分阶段，不要一次性黑盒生成。
4. 主控 Agent 不直接写正文，只负责调度。
5. 自动写作必须先生成选题卡、结构、场景卡，再生成正文。
6. 平台数据必须结构化，不能直接丢给大模型。
7. AI 学习的是结构、趋势、用户反馈，不是复制原文。
8. 复盘能力从第一版就要设计进去。
9. 标记改稿是编辑器核心能力。
10. 数据采集要有日志、来源和失败处理。
11. 自用工具也要注意合规，避免伤害平台账号安全。
12. 产品核心不是“AI 写小说”，而是“可持续提高收益型短篇创作能力”。
13. 本地数据要可备份、可恢复、可清空。
14. AI API Key 只通过本地环境变量或设置中心配置。
15. 写作记忆库是产品越写越聪明的关键。
16. 测试读者 Agent 是保证短篇质量的重要环节。
17. 场景卡是正文稳定生成的核心中间层。

---

# 23. 给 Codex 的最终总指令

```txt
我要开发一个个人自用的 AI 短篇小说创作 Agent，名字叫「神笔马良短篇小说 Agent」。

请完整阅读 docs/PRD.md 和 AGENTS.md 后再行动。

产品形态：
网页端 AI 创作工作台，个人自用，本地运行版。
用户通过浏览器访问 http://localhost:3000 使用。
第一阶段不做移动 App、不做桌面客户端、不做 SaaS 多用户平台。

产品目标：
通过采集和分析中国网文平台的公开榜单、热门作品、趋势新书、作者本人作品数据，建立内容知识库和趋势分析系统，再通过 AI Agent 自动完成灵感写作、自动写作、正文编辑、标记改稿、作品复盘，并让后续创作越来越符合账号实际表现。

本产品融合了类似 awesome-novel-skill 的多 Agent 写作内核思想，但不照搬其终端交互和长篇卷章体系。
本产品要采用：
1. 主控 Agent 调度
2. 选题卡
3. 情绪曲线
4. 冲突阶梯
5. 信息差设计
6. 场景卡
7. 提示词组装
8. 分段正文生成
9. 测试读者 Agent
10. 写作记忆库
11. 复盘沉淀 Agent

视觉风格：
黑白极简、Notion 风、高级、干净、留白充足。首页是创作驾驶舱，不能出现标记改稿和正文编辑器。

核心模块：
1. 首页
2. 灵感写作
3. 自动写作
4. 风向标
5. 作品专栏
6. 正文编辑器
7. 标记改稿
8. 数据看板
9. 自动复盘
10. 个人创作策略库
11. 写作记忆库
12. 数据采集任务框架
13. 数据源管理
14. 设置中心
15. 本地备份与恢复
16. 本地作品工程目录导出

技术栈：
前端 Next.js + TypeScript + Tailwind CSS + shadcn/ui。
后端 NestJS + TypeScript + PostgreSQL + Prisma + Redis + BullMQ。
本地运行使用 Docker Compose 启动 PostgreSQL 和 Redis。
AI 使用 OpenAI API + Embeddings + RAG，保留模型供应商抽象层。
数据采集使用 Playwright + Cheerio，但只能做公开页面分析、用户授权数据导入、CSV/截图导入，不得实现破解、绕过登录、绕过验证码、绕过平台风控、绕过 AI 检测等功能。

第一步请先进入计划模式，不要立刻写代码。
请输出：
1. 你对项目目标的理解
2. 本地运行版的建议架构
3. 借鉴 awesome-novel-skill 后的写作内核设计
4. 工程结构
5. 里程碑拆分
6. 第一次提交要创建的文件
7. 需要我确认的问题

确认后再开始写代码。
```

---

文档结束。
