# AGENTS.md

## Project

神笔马良短篇小说 Agent

## Product Shape

This is a local-first web app for personal use. The user runs it locally and opens:

```txt
http://localhost:3000
```

Do not build a SaaS multi-user platform, mobile app, desktop app, or browser extension in the first stage.

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
- Use the provided book and feather logo
- Clean, spacious, literary, professional
- Home page is a creative cockpit
- Do not put marked rewrite or a long editor on the home page

## Writing Core

The writing system uses a main controller agent and sub-agent workflow.

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

The Controller Agent should coordinate the workflow and should not directly write the full text.

## Short Story Structure

Do not generate the full story directly. Generate in this order:

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

## Local Runtime

- Web: Next.js on port 3000
- API: NestJS on port 3001
- AI Provider: OpenAI Responses API with local mock fallback
- Database: PostgreSQL through Docker Compose
- Queue: Redis through Docker Compose
- Storage: `/storage`
- Work projects: `/workspace/works`
- Logs: `/logs`

## Persistence

Works, editor marks, rewrite version history, and writing memories are saved through Prisma/PostgreSQL when the database is available. Keep a graceful mock/session fallback for local demos when Docker or PostgreSQL is not running, but do not confuse fallback data with durable storage.

## Development Rules

- Use mock data before real integration.
- Keep the Agent workflow modular.
- Preserve the local-first privacy model.
- Keep API keys out of source code.
- Run lint, typecheck, tests, and build before summarizing major work.
