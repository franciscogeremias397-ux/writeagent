# 本地启动说明

## 最简单的打开方式

在 Mac 上，可以直接双击项目根目录里的：

```txt
启动神笔马良.command
```

它会自动准备本地目录、安装依赖、在 Docker 可用时启动 PostgreSQL 和 Redis，并打开：

```txt
http://localhost:3000
```

停止时双击：

```txt
停止神笔马良.command
```

想检查本地环境时双击：

```txt
体检神笔马良.command
```

如果系统第一次提示不允许打开，可以右键文件，选择“打开”。启动窗口不要关闭，关闭后本地服务也会停止。

## 命令行启动方式

## 1. 安装 pnpm

如果电脑没有 pnpm：

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## 2. 安装依赖

```bash
pnpm install
```

## 3. 复制本地配置

```bash
cp .env.example .env
```

按需填写：

```env
AI_PROVIDER=kimi
MOONSHOT_API_KEY=
KIMI_TEXT_MODEL=kimi-k2.6
KIMI_BASE_URL=https://api.moonshot.ai/v1
DEEPSEEK_API_KEY=
DEEPSEEK_TEXT_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 4. 启动数据库和 Redis

```bash
docker compose up -d
```

如果提示找不到 `docker`，需要先安装并打开 Docker Desktop。没有 Docker 时也能先体验页面和模拟写作，但作品不会真正写入 PostgreSQL。

## 5. 应用数据库表结构

```bash
pnpm db:migrate
```

这个命令会读取 `.env` / `.env.local`。如果没有配置文件，也会先使用本项目默认的本地数据库地址。它会先准备数据库客户端，再把项目自带的表结构应用到本机 PostgreSQL；一般不会要求你回答命令行问题。

## 6. 启动项目

```bash
pnpm dev
```

打开：

```txt
http://localhost:3000
```

## 7. 本地体检

```bash
pnpm local:doctor
```

它会检查配置文件、配置样板、密钥保护、AI Key、Docker、PostgreSQL、数据库表结构、pgvector 知识库、Redis、前端页面和后端接口。如果某项不可用，会直接显示下一步该做什么。

如果你想确认“自动写作 → 保存作品 → 复盘预览”这条主流程有没有坏，可以在项目启动后运行：

```bash
pnpm local:smoke
```

它会走真实自动写作链路，检查写作记忆/个人策略召回、保存作品和复盘预览；检查完成后会自动删除临时作品和临时记忆，不会留在作品专栏。

不想碰命令时，也可以打开「设置中心」，在「写作主流程检查」里点击「检查主流程」。

没有填写 Kimi、DeepSeek 或 OpenAI API Key 时，写作接口会使用本地模拟内核。填写后，灵感写作、自动写作和局部改稿会优先尝试真实 AI。你也可以直接在「设置中心」里选择供应商、保存 API Key、写作模型和 Base URL，系统会写入本机 `.env.local`，不用手动改文件。

作品保存、编辑器标记、版本历史、复盘报告、写作记忆、个人策略、数据源、采集日志和趋势数据已经接入 PostgreSQL 或本地兜底文件。数据库未启动时会临时兜底，不会影响页面使用；其中作品和改稿后的正文全文会保存到 `storage/local-data/works.json`，编辑器标记和版本历史会保存到 `storage/local-data/editor.json`，复盘报告会保存到 `storage/local-data/reviews.json`，写作记忆会保存到 `storage/local-data/writing-memories.json`，个人策略会保存到 `storage/local-data/personal-strategies.json`，写作记忆和个人策略的轻量知识库索引会保存到 `storage/local-data/knowledge-index.json`，数据源和采集日志会保存到 `storage/local-data/datasources.json`，CSV、公开网页、平台文字粘贴和截图识别/校正文字生成的趋势会保存到 `storage/local-data/trends.json`，截图原图会保存到 `storage/uploads/screenshots`，重启后仍能读取。数据库启动并完成迁移后会优先读写本地 PostgreSQL/pgvector；灵感写作和自动写作会读取已启用的写作记忆和个人策略。没有 Kimi/OpenAI Key 时，截图会先保存并等待手动校正；DeepSeek 当前只用于文本写作和分析。
