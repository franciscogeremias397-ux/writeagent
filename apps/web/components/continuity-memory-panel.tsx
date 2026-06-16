"use client";

import { BookMarked, GitBranch, ListChecks, UsersRound } from "lucide-react";
import { createStoryContinuityMemory, type StoryPlan } from "@shenbi/shared";
import { Badge, Card, CardHeader } from "@/components/ui";

export function ContinuityMemoryPanel({ plan }: { plan: StoryPlan }) {
  const memory = plan.continuityMemory ?? createStoryContinuityMemory(plan);

  return (
    <Card>
      <CardHeader title="作品记忆" eyebrow="人物、伏笔、情绪线连续性" action={<Badge>{memory.sceneMemories.length} 场</Badge>} />
      <div className="grid gap-4 p-5">
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <BookMarked size={17} />
            本篇连续性摘要
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">{memory.summary}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-md border border-line bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <UsersRound size={16} />
              人物状态
            </div>
            <div className="mt-3 grid gap-3">
              {memory.characterMemories.map((character) => (
                <div key={character.characterId} className="rounded-md border border-line bg-paper p-3 text-xs leading-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{character.name}</p>
                    <Badge>{character.role}</Badge>
                  </div>
                  <p className="mt-2 text-muted">当前状态：{character.currentState}</p>
                  <p className="mt-1 text-muted">关系变化：{character.relationshipShift}</p>
                  <p className="mt-1 text-ink">下次使用：{character.nextUse}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <GitBranch size={16} />
              伏笔状态
            </div>
            <div className="mt-3 grid gap-3">
              {memory.foreshadowMemories.map((item) => (
                <div key={item.id} className="rounded-md border border-line bg-paper p-3 text-xs leading-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">{item.clue}</p>
                    <Badge className={item.status === "已回收" ? "border-ink text-ink" : undefined}>{item.status}</Badge>
                  </div>
                  <p className="mt-2 text-muted">埋下：{item.plantedInScenes.length ? `第 ${item.plantedInScenes.join("、")} 场` : "待补"}</p>
                  <p className="mt-1 text-muted">回收：{item.payoffInScenes.length ? `第 ${item.payoffInScenes.join("、")} 场` : "待补"}</p>
                  <p className="mt-1 text-ink">{item.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <ListChecks size={16} />
            分场连续性
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {memory.sceneMemories.map((scene) => (
              <div key={scene.sceneId} className="rounded-md border border-line bg-paper p-3 text-xs leading-5">
                <p className="font-medium text-ink">
                  场景 {scene.index}：{scene.title}
                </p>
                <p className="mt-2 text-muted">情绪状态：{scene.emotionalState}</p>
                <p className="mt-1 text-muted">人物状态：{scene.characterState}</p>
                <p className="mt-1 text-muted">关系变化：{scene.relationshipChange}</p>
                <p className="mt-1 text-muted">埋下伏笔：{scene.plantedForeshadows.length ? scene.plantedForeshadows.join("、") : "无"}</p>
                <p className="mt-1 text-muted">回收伏笔：{scene.paidForeshadows.length ? scene.paidForeshadows.join("、") : "无"}</p>
                <p className="mt-2 rounded-md border border-line bg-white p-2 text-ink">{scene.nextContinuityNote}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-line bg-paper p-4">
          <p className="text-sm font-medium text-ink">后续写作注意</p>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
            {memory.nextWritingNotes.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}
