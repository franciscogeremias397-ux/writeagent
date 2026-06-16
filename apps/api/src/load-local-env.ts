import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = (() => {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
})();

const loadedValues = new Map<string, string>();

for (const fileName of [".env", ".env.local"]) {
  const filePath = path.join(projectRoot, fileName);

  if (!existsSync(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (parsed) {
      loadedValues.set(parsed.key, parsed.value);
    }
  }
}

for (const [key, value] of loadedValues) {
  process.env[key] ??= value;
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
