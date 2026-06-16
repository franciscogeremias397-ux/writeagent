import { InspirationWorkspace } from "@/features/inspiration-workspace";

export default function Page({ searchParams }: { searchParams?: { idea?: string | string[] } }) {
  const initialIdea = Array.isArray(searchParams?.idea) ? searchParams.idea[0] : searchParams?.idea;

  return <InspirationWorkspace initialIdea={initialIdea} />;
}
