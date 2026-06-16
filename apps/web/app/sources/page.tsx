import { DatasourceWorkspace } from "@/components/datasource-workspace";

export default function Page() {
  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">数据源管理</p>
        <h1 className="text-3xl font-semibold">管理公开数据、CSV、截图和采集日志</h1>
      </section>
      <DatasourceWorkspace />
    </div>
  );
}
