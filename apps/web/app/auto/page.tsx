import { AutoWorkspace } from "@/features/auto-workspace";

export default function Page({
  searchParams
}: {
  searchParams?: {
    genre?: string;
    platform?: string;
    note?: string;
  };
}) {
  return <AutoWorkspace initialGenre={searchParams?.genre} initialPlatform={searchParams?.platform} initialNote={searchParams?.note} />;
}
