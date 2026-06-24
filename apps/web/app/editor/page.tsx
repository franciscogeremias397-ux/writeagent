import { Suspense } from "react";
import { EditorWorkspace } from "@/features/editor-workspace";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EditorWorkspace />
    </Suspense>
  );
}
