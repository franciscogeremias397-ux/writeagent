import { redirect } from "next/navigation";

export default function Page({ params }: { params: { id: string } }) {
  redirect(`/editor?workId=${encodeURIComponent(params.id)}`);
}
