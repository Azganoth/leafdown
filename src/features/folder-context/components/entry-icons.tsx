import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { FileIconKind, FileIconStyle } from "../utils/fileIcons";

// Shapes follow Lucide's 24-unit grid and stroke so they sit beside the app's other icons.
const PAGE =
  "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z";
const PAGE_FOLD = "M14 2v5a1 1 0 0 0 1 1h5";
const PAGE_TOP = "M4 10V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v2";
const FOLDER =
  "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z";
const OPEN_FOLDER =
  "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2";
const OPEN_FOLDER_BACK =
  "M4 20a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2H9.24a2 2 0 0 0-1.74 1.1Z";
const OPEN_FOLDER_FRONT =
  "M3.7 19.6 7.5 11.1A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4Z";
const NEUTRAL_FOLDER_FILL_OPACITY = 0.32;

const FILE_GLYPHS: Record<FileIconKind, ReactNode> = {
  article: <path d="M10 9H8M16 13H8M16 17H8" />,
  image: (
    <>
      <circle cx="10" cy="12" r="2" />
      <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22" />
    </>
  ),
  video: (
    <path d="M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z" />
  ),
  audio: (
    <>
      <circle cx="9" cy="17" r="2" />
      <path d="M11 17v-7l3 1.474" />
    </>
  ),
  code: <path d="M10 12.5 8 15l2 2.5m4-5 2 2.5-2 2.5" />,
  data: (
    <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" />
  ),
  spreadsheet: <path d="M8 13h2M14 13h2M8 17h2M14 17h2" />,
  archive: (
    <>
      <circle cx="10" cy="17" r="2" />
      <path d="M10 4v1M10 8v1M10 12v1" />
    </>
  ),
  pdf: (
    <path d="M3 22v-8h2.5a2.5 2.5 0 0 1 0 5H3M10 22v-8h1.5a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3ZM17 22v-8h4M17 18h3" />
  ),
  document: <path d="M11 18h2M12 12v6M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5" />,
  other: null,
};

const MUTED_COLOR = "text-muted-foreground";
const NEUTRAL_ARTICLE_COLOR = "text-foreground/70 dark:text-foreground/85";

const COLORED_FILE_COLORS: Record<FileIconKind, string> = {
  article: "text-green-600 dark:text-green-400",
  image: "text-violet-600 dark:text-violet-400",
  video: "text-fuchsia-600 dark:text-fuchsia-400",
  audio: "text-cyan-600 dark:text-cyan-400",
  code: "text-blue-600 dark:text-blue-400",
  data: "text-orange-600 dark:text-orange-400",
  spreadsheet: "text-teal-600 dark:text-teal-400",
  archive: "text-stone-500 dark:text-stone-400",
  pdf: "text-red-600 dark:text-red-400",
  document: "text-slate-500 dark:text-slate-400",
  other: MUTED_COLOR,
};

const getFileColor = (appearance: FileIconStyle, kind: FileIconKind) => {
  if (appearance === "colored") {
    return COLORED_FILE_COLORS[kind];
  }

  return kind === "article" ? NEUTRAL_ARTICLE_COLOR : MUTED_COLOR;
};

type EntryIconProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Without a style, the icon draws in the current text color, as an action's icon does. */
  appearance?: FileIconStyle;
};

interface FileEntryIconProps extends EntryIconProps {
  kind: FileIconKind;
}

export function FileEntryIcon({ appearance, className, kind, ...props }: FileEntryIconProps) {
  return (
    <EntryIconSvg
      className={cn(appearance && getFileColor(appearance, kind), className)}
      data-entry-icon={kind}
      {...props}
    >
      <path d={kind === "pdf" ? `${PAGE_TOP}${PAGE_FOLD}` : `${PAGE}${PAGE_FOLD}`} />
      {FILE_GLYPHS[kind]}
    </EntryIconSvg>
  );
}

interface FolderEntryIconProps extends EntryIconProps {
  open?: boolean;
}

export function FolderEntryIcon({
  appearance,
  className,
  open = false,
  ...props
}: FolderEntryIconProps) {
  const isColored = appearance === "colored";
  const fillProps = isColored
    ? { className: "fill-amber-300 dark:fill-amber-400" }
    : { className: "fill-current", fillOpacity: NEUTRAL_FOLDER_FILL_OPACITY };

  return (
    <EntryIconSvg
      className={cn(
        appearance && (isColored ? "text-amber-600 dark:text-amber-300" : MUTED_COLOR),
        className,
      )}
      data-entry-icon={open ? "open-folder" : "folder"}
      {...props}
    >
      {open ? (
        <>
          {isColored && (
            <path
              className="fill-amber-500 dark:fill-amber-600"
              d={OPEN_FOLDER_BACK}
              stroke="none"
            />
          )}
          <path d={OPEN_FOLDER_FRONT} stroke="none" {...fillProps} />
          <path d={OPEN_FOLDER} />
        </>
      ) : (
        <path d={FOLDER} {...fillProps} />
      )}
    </EntryIconSvg>
  );
}

function EntryIconSvg({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      {...props}
    />
  );
}
