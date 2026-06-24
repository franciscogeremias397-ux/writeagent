import { Card, CardHeader } from "@/components/ui";
import { BackupPanel } from "@/components/backup-panel";
import { AiSettingsPanel } from "@/components/ai-settings-panel";
import { RuntimeSettingsPanel } from "@/components/runtime-settings-panel";
import { WorksShelf } from "@/components/works-shelf";

export function WorksPage() {
  return (
    <PageFrame eyebrow="作品" title="打开一篇，继续修改">
      <WorksShelf />
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

      <Card>
        <CardHeader title="隐私与安全" />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {["作品正文默认本地保存", "API Key 不提交到仓库", "不做绕过登录或验证码", "不提供规避 AI 检测功能"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-md border border-line bg-white p-3">
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </Card>

      <details>
        <summary className="cursor-pointer rounded-lg border border-line bg-white px-5 py-4 text-base font-semibold text-ink">高级维护</summary>
        <div className="mt-5">
          <BackupPanel />
        </div>
      </details>
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
