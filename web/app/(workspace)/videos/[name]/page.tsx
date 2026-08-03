"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import VideoDetailPage from "@/components/videos/VideoDetailPage";

export default function Page() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name ?? "");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[13px] text-[var(--muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <VideoDetailPage name={name} />
    </Suspense>
  );
}
