import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, sep } from "node:path";

const cwd = process.cwd();
const projectRoot = cwd.endsWith(`${sep}apps${sep}api`) ? resolve(cwd, "../..") : cwd;

for (const fileName of [".env", ".env.local"]) {
  const filePath = resolve(projectRoot, fileName);

  if (!existsSync(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (parsed) {
      process.env[parsed.key] ??= parsed.value;
    }
  }
}

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/shenbi_agent";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("缺少 Prisma 命令。");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);

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
