# 神笔马良短篇小说 Agent 需求说明

## 产品定位

神笔马良短篇小说 Agent 是一个本地优先的中文短篇小说创作工作台，面向个人作者自用。第一阶段只运行在本机浏览器中，不做 SaaS、多用户平台、移动 App、桌面 App 或浏览器扩展。

默认本地入口：

- Web：`http://localhost:3000`
- API：`http://localhost:3001/api`

## 核心目标

系统需要支持从平台趋势和用户授权数据中学习写作信号，再通过 Agent 工作流生成短篇故事工程，并把编辑、复盘、写作记忆和个人策略持续反哺下一篇作品。

## 核心功能

- 平台趋势数据收集
- 趋势分析
- 灵感写作
- 自动故事生成
- 选题卡
- 情绪曲线
- 冲突阶梯
- 信息差设计
- 人物卡
- 场景卡
- 场景提示词
- 分场正文
- 测试读者报告
- 修改建议
- 作品专栏
- 正文编辑器与标记改写
- 改稿版本历史
- 数据看板
- 发布后复盘分析
- 写作记忆库
- 个人写作策略库
- 本地数据存储与备份

## Agent 工作流

Controller Agent 只负责协调，不直接生成完整正文。短篇生成必须按以下顺序执行：

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

参与 Agent：

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

## 数据学习要求

允许的数据来源：

- 公开页面分析
- 用户授权可见数据导入
- CSV 导入
- 截图导入
- 用户自己的作者数据分析
- 评论反馈和作品表现分析
- 从公开作品学习结构、趋势和题材信号

禁止行为：

- 绕过登录
- 绕过验证码
- 绕过平台反爬
- 绕过 AI 检测
- 索要或保存账号、密码、Cookie、验证码
- 复制完整版权故事
- 生成低质量垃圾内容

## 本地存储要求

优先使用 PostgreSQL 和 Redis；当 Docker、PostgreSQL 或 Redis 未启用时，系统必须优雅回退到本地文件，但 UI 要明确提示这是“本地文件兜底”，不能伪装成数据库持久化。

本地路径约定：

- 存储目录：`storage`
- 作品工程：`workspace/works`
- 日志目录：`logs`

## 编辑与复盘闭环

编辑器需要支持：

- 选中文本添加标记
- 通过 `@标记` 反馈局部问题
- 生成局部改稿
- 应用改稿
- 保存版本历史
- 生成本次改稿回执
- 将确认过的改稿经验沉淀为写作记忆

复盘需要支持：

- 录入阅读、订阅、收益、完读率、评论反馈和关键词
- 生成内容诊断和下一篇建议
- 自动沉淀写作记忆
- 自动沉淀个人策略
- 在下一篇自动写作中优先召回复盘经验

## 设计要求

- 黑白极简
- Notion-inspired
- 干净、留白、文学、专业
- 首页是创作驾驶舱
- 不要把长编辑器或标记改写放在首页

## 当前验收状态

截至当前首次提交准备阶段，项目已经跑通过以下闭环：

- 授权采集本地自测
- 学习质量和权重说明
- 自动写作十步结构
- 创作依据展示授权数据和复盘来源
- 编辑器标记改写、版本历史和改稿回执
- 复盘沉淀写作记忆和个人策略
- 下一篇自动写作召回复盘优先依据
