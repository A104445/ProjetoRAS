"use client";

import { LayoutGrid, GalleryHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function ViewToggle() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();

  // Preserve all existing params when switching views
  const createUrl = (newView: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", mode);
    params.set("view", newView);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="flex items-center gap-0.5 p-0.5 border rounded-lg">
      <Button
        variant={view === "grid" ? "default" : "secondary"}
        size="icon"
        onClick={() => router.push(createUrl("grid"))}
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        className="size-8"
        title="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant={view === "carousel" ? "default" : "secondary"}
        size="icon"
        onClick={() => router.push(createUrl("carousel"))}
        aria-label="Carousel view"
        aria-pressed={view === "carousel"}
        className="size-8"
        title="Carousel view"
      >
        <GalleryHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
