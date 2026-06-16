import { WorkDetailWorkspace } from "@/components/work-detail-workspace";

export default function Page({ params }: { params: { id: string } }) {
  return <WorkDetailWorkspace workId={decodeURIComponent(params.id)} />;
}
