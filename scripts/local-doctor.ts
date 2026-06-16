import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Check = {
  label: string;
  ok: boolean;
  detail: string;
  nextStep?: string;
};

type RuntimeHealthItem = {
  ok: boolean;
  label: string;
  detail: string;
  nextStep?: string;
};

type SettingsPayload = {
  launchEntries?: Array<RuntimeHealthItem & { fileName?: string }>;
  runtimeHealth?: {
    database?: RuntimeHealthItem;
    knowledge?: RuntimeHealthItem;
  };
};

const projectRoot = process.cwd();
const env = loadLocalEnv(projectRoot);
const checks: Check[] = [];
const requiredEnvTemplateKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "OPENAI_API_KEY",
  "AI_PROVIDER",
  "OPENAI_TEXT_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "APP_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "CRAWLER_CONCURRENCY",
  "LOCAL_STORAGE_DIR",
  "WORKSPACE_DIR",
  "LOG_DIR"
];

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "本地体检失败。");
  process.exit(1);
});

async function main() {
  ensureDirectory("storage");
  ensureDirectory("workspace/works");
  ensureDirectory("logs");

  checks.push(checkEnvFile(projectRoot));
  checks.push(checkEnvTemplate(projectRoot));
  checks.push(checkEnvPrivacy(projectRoot));
  checks.push(checkNodeRuntime());
  checks.push(checkPackageRuntime(projectRoot));
  checks.push(checkNativeDependencyQuarantine(projectRoot));
  checks.push(checkOpenAiKey(env));
  checks.push(checkDocker());
  checks.push(await checkTcp("PostgreSQL", "localhost", 5432, "docker compose up -d 启动后，再运行 pnpm db:migrate。"));
  checks.push(await checkTcp("Redis", "localhost", 6379, "docker compose up -d 启动后，公开网页采集会优先进入本地队列。"));
  checks.push(await checkEndpoint("前端页面", "http://localhost:3000", "运行 pnpm dev 或双击“启动神笔马良.command”后再检查。", "神笔马良短篇小说"));
  checks.push(await checkEndpoint("后端接口", "http://localhost:3001/api/settings", "运行 pnpm dev 或双击“启动神笔马良.command”后再检查。", "aiProvider"));
  checks.push(...(await checkSettingsRuntime("http://localhost:3001/api/settings")));

  printReport(checks);
}

function ensureDirectory(relativePath: string) {
  mkdirSync(resolve(projectRoot, relativePath), { recursive: true });
}

function checkEnvTemplate(root: string): Check {
  const templatePath = resolve(root, ".env.example");

  if (!existsSync(templatePath)) {
    return {
      label: "配置样板",
      ok: false,
      detail: "没有找到 .env.example。",
      nextStep: "重新拉取项目文件，或补回 .env.example 后再复制成本机配置。"
    };
  }

  const values = readEnvFile(templatePath);
  const missingKeys = requiredEnvTemplateKeys.filter((key) => !(key in values));

  if (missingKeys.length > 0) {
    return {
      label: "配置样板",
      ok: false,
      detail: `.env.example 少了 ${missingKeys.join(", ")}。`,
      nextStep: "先补齐这些配置项，再运行 cp .env.example .env。"
    };
  }

  return {
    label: "配置样板",
    ok: true,
    detail: `.env.example 已包含 ${requiredEnvTemplateKeys.length} 个关键配置项。`
  };
}

function checkEnvPrivacy(root: string): Check {
  const gitignorePath = resolve(root, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return {
      label: "密钥保护",
      ok: false,
      detail: "没有找到 .gitignore，可能误把本机密钥文件提交出去。",
      nextStep: "补回 .gitignore，并确保里面包含 .env 和 .env.local。"
    };
  }

  const ignoredItems = readFileSync(gitignorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const missingItems = [".env", ".env.local"].filter((item) => !ignoredItems.includes(item));

  if (missingItems.length > 0) {
    return {
      label: "密钥保护",
      ok: false,
      detail: `.gitignore 还没有忽略 ${missingItems.join(", ")}。`,
      nextStep: "把这些文件名加入 .gitignore，避免 OpenAI Key 被误提交。"
    };
  }

  return {
    label: "密钥保护",
    ok: true,
    detail: ".env 和 .env.local 已被忽略，不会把 Key 当成项目文件提交。"
  };
}

function checkEnvFile(root: string): Check {
  const hasEnv = existsSync(resolve(root, ".env"));
  const hasLocalEnv = existsSync(resolve(root, ".env.local"));

  if (hasEnv || hasLocalEnv) {
    return {
      label: "本地配置文件",
      ok: true,
      detail: hasEnv ? "已找到 .env。" : "已找到 .env.local。"
    };
  }

  return {
    label: "本地配置文件",
    ok: false,
    detail: "还没有 .env 或 .env.local。",
    nextStep: "运行 cp .env.example .env，或在设置中心保存一次 AI 设置。"
  };
}

function checkOpenAiKey(values: Record<string, string>): Check {
  const hasKey = Boolean(values.OPENAI_API_KEY?.trim());

  return {
    label: "OpenAI Key",
    ok: hasKey,
    detail: hasKey ? "已配置，写作和截图识别会优先尝试真实 AI。" : "未配置，当前会使用本地模拟写作内核。",
    nextStep: hasKey ? undefined : "需要真实 AI 时，在设置中心填入 OpenAI API Key。"
  };
}

function checkNodeRuntime(): Check {
  const nodeVersion = spawnSync("node", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (nodeVersion.status === 0) {
    return {
      label: "Node.js",
      ok: true,
      detail: `已检测到 ${nodeVersion.stdout.trim()}。`
    };
  }

  return {
    label: "Node.js",
    ok: false,
    detail: "没有检测到 Node.js 命令。",
    nextStep: "安装 Node.js 20 或更新版本；如果只是用 Codex 启动，启动脚本会尝试使用 Codex 自带 Node.js。"
  };
}

function checkPackageRuntime(root: string): Check {
  const pnpmVersion = spawnSync("pnpm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (pnpmVersion.status === 0) {
    return {
      label: "依赖运行器",
      ok: true,
      detail: `已检测到 pnpm ${pnpmVersion.stdout.trim()}。`
    };
  }

  const localBins = [
    "node_modules/.bin/tsc",
    "apps/web/node_modules/.bin/next",
    "apps/api/node_modules/.bin/tsx"
  ];
  const missingBins = localBins.filter((item) => !existsSync(resolve(root, item)));

  if (missingBins.length === 0) {
    return {
      label: "依赖运行器",
      ok: true,
      detail: "没有检测到 pnpm，但本地 node_modules 依赖完整，双击启动脚本可以用本地依赖启动。"
    };
  }

  return {
    label: "依赖运行器",
    ok: false,
    detail: `没有检测到 pnpm，且本地依赖缺少 ${missingBins.join(", ")}。`,
    nextStep: "安装 Node.js 20+ 后运行 corepack enable 和 pnpm install。"
  };
}

function checkNativeDependencyQuarantine(root: string): Check {
  const nativeFiles = [
    "node_modules/.pnpm/@next+swc-darwin-arm64@14.2.23/node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node",
    "node_modules/.pnpm/@rollup+rollup-darwin-arm64@4.61.1/node_modules/@rollup/rollup-darwin-arm64/rollup.darwin-arm64.node"
  ];
  const existingNativeFiles = nativeFiles.map((file) => resolve(root, file)).filter((file) => existsSync(file));

  if (!existingNativeFiles.length || process.platform !== "darwin") {
    return {
      label: "搬迁依赖隔离",
      ok: true,
      detail: "没有发现需要检查的 macOS 原生依赖隔离项。"
    };
  }

  const quarantined = existingNativeFiles.filter((file) => {
    const result = spawnSync("xattr", ["-p", "com.apple.quarantine", file], {
      encoding: "utf8"
    });

    return result.status === 0;
  });

  if (quarantined.length === 0) {
    return {
      label: "搬迁依赖隔离",
      ok: true,
      detail: "Next/Rollup 原生依赖没有 quarantine 标记，可以正常加载。"
    };
  }

  return {
    label: "搬迁依赖隔离",
    ok: false,
    detail: `发现 ${quarantined.length} 个原生依赖仍带 macOS quarantine 标记，可能导致页面无法启动。`,
    nextStep: "运行 xattr -dr com.apple.quarantine node_modules apps/web/node_modules apps/api/node_modules，或重新 pnpm install。"
  };
}

function checkDocker(): Check {
  const dockerVersion = spawnSync("docker", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (dockerVersion.status !== 0) {
    return {
      label: "Docker",
      ok: false,
      detail: "没有检测到 Docker 命令。",
      nextStep: "安装并打开 Docker Desktop；没有 Docker 时也能先用本地演示兜底。"
    };
  }

  const dockerInfo = spawnSync("docker", ["info"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  return {
    label: "Docker",
    ok: dockerInfo.status === 0,
    detail: dockerInfo.status === 0 ? "Docker Desktop 正在运行。" : "已安装 Docker，但 Docker Desktop 可能还没打开。",
    nextStep: dockerInfo.status === 0 ? undefined : "打开 Docker Desktop 后运行 docker compose up -d。"
  };
}

function checkTcp(label: string, host: string, port: number, nextStep: string) {
  return new Promise<Check>((resolveCheck) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const settle = (ok: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolveCheck({
        label,
        ok,
        detail: ok ? `${host}:${port} 可以连接。` : `${host}:${port} 暂时连不上。`,
        nextStep: ok ? undefined : nextStep
      });
    };

    socket.setTimeout(1000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

async function checkEndpoint(label: string, url: string, nextStep: string, expectedText?: string): Promise<Check> {
  try {
    const response = await fetch(url);
    const text = await response.text();

    if (response.ok && expectedText && !text.includes(expectedText)) {
      return {
        label,
        ok: false,
        detail: `${url} 有响应，但内容不像神笔马良，可能是端口被其他项目占用。`,
        nextStep: "先双击“停止神笔马良.command”或关闭占用 3000/3001 的其他项目，再重新启动。"
      };
    }

    return {
      label,
      ok: response.ok,
      detail: response.ok ? `${url} 正常响应。` : `${url} 返回 ${response.status}。`,
      nextStep: response.ok ? undefined : nextStep
    };
  } catch {
    return {
      label,
      ok: false,
      detail: `${url} 暂时打不开。`,
      nextStep
    };
  }
}

async function checkSettingsRuntime(url: string): Promise<Check[]> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return [
        {
          label: "设置中心体检",
          ok: false,
          detail: `后端设置中心返回 ${response.status}，暂时读不到数据库表结构和知识库状态。`,
          nextStep: "先启动神笔马良，再重新双击体检。"
        }
      ];
    }

    const settings = (await response.json()) as SettingsPayload;
    const launchEntries = settings.launchEntries ?? [];
    const database = settings.runtimeHealth?.database;
    const knowledge = settings.runtimeHealth?.knowledge;
    const result: Check[] = [];

    result.push(
      ...launchEntries.map((entry) => ({
        label: `双击入口：${entry.label}`,
        ok: entry.ok,
        detail: entry.fileName ? `${entry.fileName}：${entry.detail}` : entry.detail,
        nextStep: entry.nextStep
      }))
    );

    if (database) {
      result.push({
        label: "数据库表结构",
        ok: database.ok,
        detail: database.detail,
        nextStep: database.nextStep
      });
    }

    if (knowledge) {
      result.push({
        label: "本地知识库",
        ok: knowledge.ok,
        detail: knowledge.detail,
        nextStep: knowledge.nextStep
      });
    } else {
      result.push({
        label: "本地知识库",
        ok: false,
        detail: "后端还没有返回本地知识库状态。",
        nextStep: "确认代码已更新后，重新启动神笔马良。"
      });
    }

    return result;
  } catch {
    return [
      {
        label: "设置中心体检",
        ok: false,
        detail: "后端设置中心暂时打不开，无法读取数据库表结构和本地知识库状态。",
        nextStep: "运行 pnpm dev 或双击“启动神笔马良.command”后再体检。"
      }
    ];
  }
}

function loadLocalEnv(root: string) {
  const values: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = resolve(root, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(values, readEnvFile(filePath));
  }

  return values;
}

function readEnvFile(filePath: string) {
  const values: Record<string, string> = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (parsed) {
      values[parsed.key] = parsed.value;
    }
  }

  return values;
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: decodeEnvValue(match[2] ?? "")
  };
}

function decodeEnvValue(value: string) {
  const trimmed = value.trim();

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function printReport(items: Check[]) {
  console.log("\n神笔马良本地体检\n");

  for (const item of items) {
    console.log(`${statusLabel(item)} ${item.label}：${item.detail}`);

    if (item.nextStep) {
      console.log(`  下一步：${item.nextStep}`);
    }
  }

  const needsWork = items.filter((item) => !item.ok);
  console.log("");

  if (needsWork.length === 0) {
    console.log("所有关键项都正常，可以打开 http://localhost:3000 使用。");
    return;
  }

  console.log("工作台仍可用；标为“本地兜底”的项目不是故障，只是还没启用真实 AI、数据库或队列能力。");
}

function statusLabel(item: Check) {
  if (item.ok) {
    return "[正常]";
  }

  return isFallbackCheck(item) ? "[本地兜底]" : "[需处理]";
}

function isFallbackCheck(item: Check) {
  return /未配置|兜底|仍可|回退写入|暂时不可用|暂时连不上|没有检测到 Docker/u.test(item.detail);
}
