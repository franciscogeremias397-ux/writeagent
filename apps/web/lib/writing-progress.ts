import type { Work } from "@shenbi/shared";
import { formatNumber } from "@/lib/format";

const weeklyWordTarget = 10000;

export type WritingProgressSummary = {
  label: string;
  progress: number;
  advice: string;
  href: string;
  action: string;
};

export function buildWeeklyWritingProgress(works: Work[]): WritingProgressSummary {
  const start = startOfWeek(new Date());
  const activeWorks = works.filter((work) => work.status === "draft" || work.status === "serializing");
  const updatedThisWeek = activeWorks.filter((work) => {
    const updatedAt = parseWorkDate(work.updatedAt);

    return updatedAt ? updatedAt >= start : false;
  });
  const wordsThisWeek = updatedThisWeek.reduce((sum, work) => sum + work.wordCount, 0);
  const latestActiveWork = [...activeWorks].sort((left, right) => compareWorkDate(right.updatedAt, left.updatedAt))[0];
  const remainingWords = Math.max(0, weeklyWordTarget - wordsThisWeek);

  if (wordsThisWeek >= weeklyWordTarget) {
    return {
      label: `${formatNumber(wordsThisWeek)} / ${formatNumber(weeklyWordTarget)} 字`,
      progress: 100,
      advice: "本周目标已完成，可以进入编辑器做标记改稿，或把已发布作品拿去复盘。",
      href: latestActiveWork ? `/editor?workId=${encodeURIComponent(latestActiveWork.id)}` : "/works",
      action: latestActiveWork ? "继续精修" : "查看作品"
    };
  }

  if (wordsThisWeek > 0) {
    return {
      label: `${formatNumber(wordsThisWeek)} / ${formatNumber(weeklyWordTarget)} 字`,
      progress: Math.round((wordsThisWeek / weeklyWordTarget) * 100),
      advice: latestActiveWork
        ? `还差 ${formatNumber(remainingWords)} 字。建议继续推进《${latestActiveWork.title}》，先补完下一场。`
        : `还差 ${formatNumber(remainingWords)} 字。建议用风向标方向生成一套 6 场景草稿。`,
      href: latestActiveWork ? `/editor?workId=${encodeURIComponent(latestActiveWork.id)}` : "/auto",
      action: latestActiveWork ? "继续写正文" : "开始自动写作"
    };
  }

  return {
    label: `0 / ${formatNumber(weeklyWordTarget)} 字`,
    progress: 0,
    advice: latestActiveWork
      ? `本周还没有更新草稿。建议先打开《${latestActiveWork.title}》，补一场关键冲突。`
      : "本周还没有写作记录。建议先用今日灵感生成一个故事骨架。",
    href: latestActiveWork ? `/editor?workId=${encodeURIComponent(latestActiveWork.id)}` : "/inspiration",
    action: latestActiveWork ? "打开编辑器" : "用今日灵感"
  };
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;

  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - diff);

  return result;
}

function parseWorkDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function compareWorkDate(left: string, right: string) {
  return (parseWorkDate(left)?.getTime() ?? 0) - (parseWorkDate(right)?.getTime() ?? 0);
}
