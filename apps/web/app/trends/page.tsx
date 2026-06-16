import { trends } from "@shenbi/shared";
import { TrendsWorkspace } from "@/components/trends-workspace";

export default function Page() {
  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">风向标</p>
        <h1 className="text-3xl font-semibold">把平台趋势拆成可写的机会卡</h1>
      </section>
      <TrendsWorkspace fallbackTrends={trends} />
    </div>
  );
}
