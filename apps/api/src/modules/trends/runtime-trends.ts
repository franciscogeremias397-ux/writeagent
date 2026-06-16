import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { trends as seedTrends, type Trend } from "@shenbi/shared";
import { cleanTrendGenre } from "./trend-cleaning.js";

const runtimeTrends: Trend[] = [];

export function addRuntimeTrends(items: Trend[]) {
  runtimeTrends.unshift(...normalizeTrends(items));
}

export async function persistRuntimeTrends(items: Trend[]) {
  const localTrends = await readLocalTrendsFile();
  const nextTrends = uniqueTrends([...normalizeTrends(items), ...localTrends]);

  replaceRuntimeTrends(nextTrends);
  await writeLocalTrendsFile(nextTrends);
}

export async function listRuntimeTrends() {
  const localTrends = await readLocalTrendsFile();
  const currentTrends = localTrends.length ? localTrends : runtimeTrends;

  replaceRuntimeTrends(uniqueTrends(currentTrends));
  return uniqueTrends([...currentTrends, ...seedTrends]);
}

async function readLocalTrendsFile(): Promise<Trend[]> {
  try {
    const parsed = JSON.parse(await readFile(localTrendsFilePath(), "utf8")) as { trends?: Partial<Trend>[] };
    return (parsed.trends ?? []).map((trend) => normalizeTrend(trend)).filter((trend): trend is Trend => Boolean(trend));
  } catch {
    return [];
  }
}

async function writeLocalTrendsFile(trends: Trend[]) {
  const filePath = localTrendsFilePath();

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        app: "神笔马良短篇小说 Agent",
        updatedAt: new Date().toISOString(),
        trends: uniqueTrends(trends)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function normalizeTrend(trend: Partial<Trend>): Trend | null {
  if (!trend.genre?.trim()) {
    return null;
  }

  return {
    id: trend.id ?? `local-trend-${Date.now()}`,
    platform: trend.platform ?? "手动导入",
    genre: cleanTrendGenre(trend.genre),
    heat: trend.heat ?? 72,
    growthRate: trend.growthRate ?? 0,
    opportunityScore: trend.opportunityScore ?? trend.heat ?? 72,
    saturationScore: trend.saturationScore ?? 58,
    reason: trend.reason ?? "来自本地导入数据。",
    tags: trend.tags ?? [],
    sourceLabel: trend.sourceLabel,
    sourceDetail: trend.sourceDetail,
    createdAt: trend.createdAt ?? new Date().toISOString().slice(0, 10)
  };
}

function normalizeTrends(trends: Partial<Trend>[]) {
  return trends.map((trend) => normalizeTrend(trend)).filter((trend): trend is Trend => Boolean(trend));
}

function uniqueTrends(trends: Trend[]) {
  const seen = new Set<string>();

  return trends.filter((trend) => {
    const key = `${trend.platform}-${trend.genre}-${trend.createdAt}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function replaceRuntimeTrends(trends: Trend[]) {
  runtimeTrends.splice(0, runtimeTrends.length, ...trends);
}

function localTrendsFilePath() {
  const cwd = process.cwd();
  const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "trends.json");
}
