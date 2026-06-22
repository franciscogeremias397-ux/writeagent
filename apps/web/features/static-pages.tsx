import { trends, works, writingMemories } from "@shenbi/shared";
import { Card, CardHeader } from "@/components/ui";
import { BackupPanel } from "@/components/backup-panel";
import { DataDashboardWorkspace } from "@/components/data-dashboard-workspace";
import { AiSettingsPanel } from "@/components/ai-settings-panel";
import { MemoryLibrary } from "@/components/memory-library";
import { RuntimeSettingsPanel } from "@/components/runtime-settings-panel";
import { StrategyLibrary } from "@/components/strategy-library";
import { WorksShelf } from "@/components/works-shelf";

export function WorksPage() {
  return (
    <PageFrame eyebrow="作品专栏" title="像书架一样管理所有短篇作品">
      <WorksShelf fallbackWorks={works} />
    </PageFrame>
  );
}

export function DataDashboardPage() {
  return (
    <PageFrame eyebrow="数据看板" title="同时看平台风向和自己作品表现">
      <DataDashboardWorkspace fallbackWorks={works} fallbackTrends={trends} />
    </PageFrame>
  );
}

export function MemoryPage() {
  return (
    <PageFrame eyebrow="写作记忆库" title="让 Agent 越写越懂你的账号">
      <MemoryLibrary fallbackMemories={writingMemories} />
      <StrategyLibrary />
    </PageFrame>
  );
}

export function SettingsPage() {
  return (
    <PageFrame eyebrow="设置中心" title="先接模型，再检查本地运行">
      <AiSettingsPanel />

      <details>
        <summary className="cursor-pointer rounded-lg border border-line bg-white px-5 py-4 text-base font-semibold text-ink">本地运行诊断</summary>
        <div className="mt-5">
          <RuntimeSettingsPanel />
        </div>
      </details>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="隐私与安全" />
          <div className="grid gap-3 p-5">
            {["作品正文默认本地保存", "API Key 不提交到仓库", "不做绕过登录或验证码", "不提供规避 AI 检测功能"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-line bg-white p-3">
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <BackupPanel />
      </section>
    </PageFrame>
  );
}

function PageFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">{eyebrow}</p>
        <h1 className="text-3xl font-semibold">{title}</h1>
      </section>
      {children}
    </div>
  );
}
