import {
  CircleSlash2Icon,
  FileTextIcon,
  FolderOpenIcon,
  LinkIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";

import { getPathParts } from "@/lib/path";
import { cn } from "@/lib/utils";

import type { DroppedPathIndicator } from "../hooks/useDroppedPathListener";

interface DroppedPathOverlayProps {
  indicator: DroppedPathIndicator;
}

interface OverlayContent {
  description: string;
  Icon: LucideIcon;
  title: string;
  unavailable?: boolean;
}

export function DroppedPathOverlay({ indicator }: DroppedPathOverlayProps) {
  if (!indicator) {
    return null;
  }

  const { description, Icon, title, unavailable } = getOverlayContent(indicator);

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-2 z-[100] grid place-items-center rounded-xl border-2 border-dashed bg-background/70 backdrop-blur-[2px]",
        unavailable ? "border-muted-foreground/50" : "border-primary/70",
      )}
      role="status"
    >
      <div className="flex max-w-sm items-center gap-3 rounded-lg border bg-popover/95 px-5 py-4 text-popover-foreground shadow-lg">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-6 shrink-0",
            unavailable ? "text-muted-foreground" : "text-primary",
            indicator.status === "checking" && "animate-spin motion-reduce:animate-none",
          )}
        />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

const getOverlayContent = (indicator: Exclude<DroppedPathIndicator, null>): OverlayContent => {
  if (indicator.status === "checking") {
    return {
      description: "Leafdown is determining what the drop will do.",
      Icon: LoaderCircleIcon,
      title: "Checking dropped item",
    };
  }

  if (indicator.status === "inspectionFailed") {
    return {
      description: "Leafdown could not inspect this item.",
      Icon: CircleSlash2Icon,
      title: "Drop unavailable",
      unavailable: true,
    };
  }

  if (indicator.status === "rejected") {
    switch (indicator.reason) {
      case "missingDocument":
        return {
          description: getPathParts(indicator.droppedPath.path).name,
          Icon: CircleSlash2Icon,
          title: "Open a document to insert a link",
          unavailable: true,
        };
      case "multipleItems":
        return {
          description: `${indicator.count} items selected`,
          Icon: CircleSlash2Icon,
          title: "Drop one item at a time",
          unavailable: true,
        };
      case "unsupported":
        return {
          description: getPathParts(indicator.path).name,
          Icon: CircleSlash2Icon,
          title: "Markdown files and folders only",
          unavailable: true,
        };
    }
  }

  const isFolder = indicator.droppedPath.kind === "folder";
  const insertsLink =
    indicator.action === "insertFolderLink" || indicator.action === "insertMarkdownFileLink";

  return {
    description: getPathParts(indicator.droppedPath.path).name,
    Icon: insertsLink ? LinkIcon : isFolder ? FolderOpenIcon : FileTextIcon,
    title: insertsLink
      ? isFolder
        ? "Insert folder link"
        : "Insert file link"
      : isFolder
        ? "Open folder"
        : "Open Markdown file",
  };
};
