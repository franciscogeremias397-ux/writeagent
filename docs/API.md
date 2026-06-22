# API 设计

后端服务默认运行在：

```txt
http://localhost:3001/api
```

## Writing

```txt
POST /api/writing/inspiration
POST /api/writing/auto
POST /api/writing/rewrite-mark
POST /api/writing/revise-scene
```

## Works

```txt
GET  /api/works
GET  /api/works/:id
POST /api/works
PATCH /api/works/:id
DELETE /api/works/:id
POST /api/works/from-plan
POST /api/works/:id/full-text
POST /api/works/:id/export-workspace
```

## Editor

```txt
GET    /api/works/:id/marks
POST   /api/marks
DELETE /api/marks/:id
GET    /api/works/:id/versions
POST   /api/editor/apply-rewrite
```

`POST /api/editor/apply-rewrite` 除了保存原文、新文和版本说明，也支持传入 `impactNotes` 和 `updateMemory`。当 `updateMemory` 为 `false` 时，只保存版本历史和正文，不把本次改稿写入写作记忆；当它为 `true` 或省略时，会把前端已勾选的 `impactNotes` 沉淀为写作记忆。

## Trends

```txt
GET  /api/trends
GET  /api/trends/today
GET  /api/trends/chart
POST /api/trends/analyze
```

## Review

```txt
GET  /api/review/work/:id
POST /api/review/work/:id
```

`POST /api/review/work/:id` 会保存复盘报告，并保留当次录入的阅读量、收益、完读率、排名变化、推荐量变化、评论反馈和内容维度诊断。阅读量、收益、完读率和评论反馈也会同步更新到作品库，方便数据看板、作品详情和作品工程导出继续使用同一份表现数据。

## Memory

```txt
GET   /api/memory
POST  /api/memory
PATCH /api/memory/:id
DELETE /api/memory/:id
```

## Personal Strategies

```txt
GET   /api/strategies
POST  /api/strategies
PATCH /api/strategies/:id
DELETE /api/strategies/:id
```

## Writing Assets

```txt
GET    /api/writing-assets
POST   /api/writing-assets/inspirations
POST   /api/writing-assets/presets
DELETE /api/writing-assets/:id
```

## Data Sources

```txt
GET  /api/datasources
POST /api/datasources
POST /api/datasources/import-csv
POST /api/datasources/import-text
POST /api/datasources/import-public-page
POST /api/datasources/import-screenshot
POST /api/datasources/authorized-capture
POST /api/datasources/browser-capture-sessions
GET  /api/datasources/browser-capture-sessions/:id
POST /api/datasources/browser-capture-sessions/:id/open
POST /api/datasources/browser-capture-sessions/:id/read-visible-page
POST /api/datasources/browser-capture-sessions/:id/visible-text
GET  /api/crawler/jobs
GET  /api/crawler/jobs/:id
POST /api/crawler/jobs/:id/screenshot-correction
POST /api/crawler/jobs/:id/retry
POST /api/crawler/jobs
```

`POST /api/datasources/import-screenshot` 会保存截图原图，并可接收 `recognizedText`。传入 `recognizedText` 时，系统会把这段 OCR 或手动校正文字解析成题材趋势和作品表现数据；只传截图时，系统会在配置了 Kimi 或 OpenAI Key 的情况下读取图片文字，再进入同一套解析流程。DeepSeek 当前只用于文本写作和分析；没有可读图 Key、识别失败或图片里没有可用文字时，则登记为等待校正的采集任务。

`POST /api/crawler/jobs/:id/screenshot-correction` 用于给等待校正的截图任务补充文字。传入 `recognizedText` 后，系统会更新原任务状态，解析题材趋势、作品阅读、收益、完读率、评论反馈和评论关键词，并回写风向标与作品库。

`POST /api/crawler/jobs/:id/retry` 用于重试公开网页采集任务。系统会从任务日志里保留的公开网址重新发起采集；如果 Redis 可用会走本地队列，否则走直接处理兜底。

`POST /api/datasources/import-csv` 可接收 `fieldMappings`，用于把不标准 CSV 表头映射成系统字段。例如 `{ "作品名": "书名列", "阅读量": "播放", "收益": "稿费" }`。如果同时传入 `fileName`，系统会把 CSV 原件保存到 `storage/uploads/csv`，并把原件路径写入采集日志；导入时系统会按映射补齐标准字段，再写入趋势数据和作品表现。

`POST /api/datasources/browser-capture-sessions` 会创建一个用户授权的本地浏览器采集会话；`POST /api/datasources/browser-capture-sessions/:id/open` 会在本机打开临时浏览器窗口。用户自行登录、处理验证码和平台确认后，`POST /api/datasources/browser-capture-sessions/:id/read-visible-page` 会读取当前页面已经显示的文字并入库。执行器不保存账号、密码或 Cookie；关闭本次浏览器后登录态结束。`POST /api/datasources/browser-capture-sessions/:id/visible-text` 是执行器不可用时的可见文字兜底回填。

数据源导入返回值里的 `learningCreated` 会说明本次是否自动沉淀了写作记忆和个人策略。授权可见页、CSV、截图校正和手动粘贴只要识别到作品表现或评论反馈，就会尝试生成 `platform_result` 来源的记忆/策略；同题材同规则已存在时会跳过，避免重复沉淀。公开网页榜单只进入趋势数据，不会冒充用户后台经验。

## Settings

```txt
GET   /api/settings
PATCH /api/settings
POST  /api/settings/test-ai
POST  /api/settings/export-data
POST  /api/settings/clear-cache
POST  /api/settings/clear-logs
```

`GET /api/settings` 会返回当前 AI 模式、本地运行体检、本地存储目录、作品工程目录、日志目录和采集默认设置。运行体检包含数据库、队列服务、文件存储、作品工程目录、日志目录的可用状态、说明和目录大小，前端设置中心会用这些信息展示“哪些服务正常”“数据放在哪里”和“采集边界是什么”。

`PATCH /api/settings` 可保存 AI 供应商、写作模型、Base URL 和对应 API Key，当前支持 `kimi`、`deepseek`、`openai`。Key 只写入本机 `.env.local` 并更新当前运行状态，接口响应只返回“已配置/未配置”，不会回传 Key 原文；传入 `clearApiKey` 可清除当前供应商的本机 Key。OpenAI 仍可额外保存 Embedding 模型。

## Backups

```txt
GET  /api/backups
POST /api/backups/export
POST /api/backups/restore-latest
POST /api/backups/clear-cache
POST /api/backups/clear-logs
POST /api/backups/cleanup-imported
POST /api/backups/reset-starter
```

写作相关接口会优先尝试已配置的真实 AI：Kimi、DeepSeek 或 OpenAI；如果没有配置对应 API Key 或调用失败，会自动返回本地模拟结果。灵感写作和自动写作的返回结果都会经过分阶段工作流合同校验：选题卡、情绪曲线、冲突阶梯、信息差、人物卡、场景卡、场景提示词、分场正文、测试读者评审和修订建议必须完整；场景卡、提示词和正文要按 sceneId 对齐；整篇 `draft` 会由 `sceneDrafts` 合并生成；Agent 调度轨迹固定为 10 步。

作品接口、标记接口、版本历史接口、复盘报告接口、写作记忆接口、趋势接口和数据源接口已优先读写 PostgreSQL；数据库不可用时会临时回退到 mock、当前会话数据或本地文件。作品会带 `fullText` 正文全文，并额外落到 `storage/local-data/works.json`；作品专栏可手动新建、编辑资料和删除作品，本地文件会记录已删除作品，避免数据库未启动时被删的示例作品反复出现。本地文件保存会保留 Agent 当次生成的 `storyPlan` 原始写作方案，方案里包含场景卡、场景提示词、分场正文 `sceneDrafts` 和合并后的正文 `draft`，`POST /api/works/:id/full-text` 可同时接收 `fullText` 和 `storyPlan`，编辑器应用改稿和作品详情单场重写都会把改完的全文回写到作品。编辑器标记和版本历史会额外落到 `storage/local-data/editor.json`，数据库可用时也会同步这份本地档案，复盘报告会额外落到 `storage/local-data/reviews.json`，写作记忆会额外落到 `storage/local-data/writing-memories.json`，个人策略会额外落到 `storage/local-data/personal-strategies.json`，保存的灵感和参数模板会落到 `storage/local-data/writing-assets.json`，数据源和采集日志会额外落到 `storage/local-data/datasources.json`，CSV、公开网页、手动粘贴平台文字和截图识别/校正文字生成的趋势会额外落到 `storage/local-data/trends.json`；新增数据源支持保存来源地址/文件说明、更新频率和启用状态，来源 URL、CSV 原件路径和截图路径会作为结构化字段写入数据源和采集日志，旧备注里的来源仍可兼容读取，公开页面数据源可按保存的来源地址再次采集；CSV 原件会保存到 `storage/uploads/csv`，截图原图会保存到 `storage/uploads/screenshots`；CSV、平台文字和截图识别/校正文字里的 `作品名`、`阅读量`、`收益`、`完读率`、`收藏`、`评论反馈`、`评论关键词` 等字段会同步更新作品库，数据库不可用时会写回 `storage/local-data/works.json`。公开网页采集会读取外部公开页面文本，提取题材、标签和热度线索，生成采集任务并追加到 `logs/crawler.log`；本机、内网和非文本页面会被拒绝。截图导入会把原图保存到 `storage/uploads/screenshots`，带 `recognizedText` 时会立刻解析趋势和作品数据；不带文字且有 Kimi/OpenAI Key 时会自动读图提取文字，没有可读图 Key 或识别不到可用文字时会登记等待校正的采集日志，重启后仍可读取。作品工程目录导出会直接写入本地 `workspace/works`，并优先导出真实正文、分场正文、每场提示词、原始方案快照 `source_plan.json`、质量体检 `quality_report.md`、原创边界 `originality_report.md`、作品记忆 `work_memory.md`、最近一次发布复盘、标记改稿记录 `marks.md`、真实写作记忆 `writing_memory.md`、个人策略 `strategy.md`、机器可读版本历史 `editor_history.json` 和记忆策略上下文 `memory_context.json`；还没生成复盘时会在 `review.md` 写出下一步提示。复盘生成后会读取作品评论反馈，并同时沉淀写作记忆和个人策略；灵感写作和自动写作会读取启用的写作记忆与个人策略作为下一篇写作参考。CSV 导入、公开网页导入、平台文字导入和截图识别/校正文字导入都会生成采集日志，并把可识别的题材热度写入趋势数据。备份接口会把当前可读取的数据写入本地 `storage/backups`；恢复接口在数据库不可用时会写回 `storage/local-data`；运行缓存清理只清理截图缓存、临时缓存和运行缓存，不删除作品和备份；日志清空只清理 `logs` 目录；清理接口会先自动备份，再清理公开网页/CSV/手动粘贴/截图导入记录、导入趋势、平台导入作品、验证数据、验证灵感模板、验证策略和截图缓存；重置接口会先自动备份，再把作品、趋势、记忆、策略、灵感模板、复盘、标记、版本和数据源恢复到初始示例状态。
