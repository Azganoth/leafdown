import {
  CircleSlash2Icon,
  FileTextIcon,
  FolderOpenIcon,
  LinkIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";

import { useLocalization, type Translate } from "@/lib/i18n";
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
  const { t } = useLocalization();

  if (!indicator) {
    return null;
  }

  const { description, Icon, title, unavailable } = getOverlayContent(indicator, t);

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

const getOverlayContent = (
  indicator: Exclude<DroppedPathIndicator, null>,
  t: Translate,
): OverlayContent => {
  if (indicator.status === "checking") {
    return {
      description: t("session.dropOverlay.checking.description"),
      Icon: LoaderCircleIcon,
      title: t("session.dropOverlay.checking.title"),
    };
  }

  if (indicator.status === "inspectionFailed") {
    return {
      description: t("session.dropOverlay.inspectionFailed.description"),
      Icon: CircleSlash2Icon,
      title: t("session.dropOverlay.inspectionFailed.title"),
      unavailable: true,
    };
  }

  if (indicator.status === "rejected") {
    switch (indicator.reason) {
      case "missingDocument":
        return {
          description: getPathParts(indicator.droppedPath.path).name,
          Icon: CircleSlash2Icon,
          title: t("session.dropOverlay.missingDocument"),
          unavailable: true,
        };
      case "multipleItems":
        return {
          description: t("session.dropOverlay.multipleItems.description", {
            count: indicator.count,
          }),
          Icon: CircleSlash2Icon,
          title: t("session.dropOverlay.multipleItems.title"),
          unavailable: true,
        };
      case "unsupported":
        return {
          description: getPathParts(indicator.path).name,
          Icon: CircleSlash2Icon,
          title: t("session.dropOverlay.unsupported"),
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
    title: t(
      insertsLink
        ? isFolder
          ? "session.dropOverlay.insertFolderLink"
          : "session.dropOverlay.insertFileLink"
        : isFolder
          ? "session.dropOverlay.openFolder"
          : "session.dropOverlay.openMarkdownFile",
    ),
  };
};
