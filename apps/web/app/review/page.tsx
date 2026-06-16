import { works } from "@shenbi/shared";
import { ReviewWorkspace } from "@/components/review-workspace";

export default function Page({ searchParams }: { searchParams?: { workId?: string | string[] } }) {
  const workId = Array.isArray(searchParams?.workId) ? searchParams?.workId[0] : searchParams?.workId;

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">复盘分析</p>
        <h1 className="text-3xl font-semibold">把发布表现变成下一篇的策略</h1>
      </section>
      <ReviewWorkspace fallbackWorks={works} initialWorkId={workId} />
    </div>
  );
}
