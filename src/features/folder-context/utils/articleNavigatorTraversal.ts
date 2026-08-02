import { isSameOrParentPath, isSamePath } from "@/lib/path";

import type { ArticleNavigatorRow } from "./articleNavigatorRows";

export type ArticleNavigatorTraversalAction =
  | { type: "activateRow"; index: number }
  | { type: "focusRow"; index: number }
  | { type: "toggleDirectory"; path: string };

const TRAVERSAL_KEYS = new Set([
  " ",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Enter",
  "Home",
]);

export const isArticleNavigatorTraversalKey = (key: string) => TRAVERSAL_KEYS.has(key);

interface GetArticleNavigatorTraversalActionOptions {
  focusedIndex: number;
  key: string;
  rows: ArticleNavigatorRow[];
}

export const getArticleNavigatorTraversalAction = ({
  focusedIndex,
  key,
  rows,
}: GetArticleNavigatorTraversalActionOptions): ArticleNavigatorTraversalAction | null => {
  const row = rows[focusedIndex];

  if (!row) {
    return null;
  }

  const isExpandableDirectory = row.kind === "directory" && row.hasChildren;

  switch (key) {
    case " ":
    case "Enter":
      return { type: "activateRow", index: focusedIndex };
    case "ArrowDown":
      return focusRowAt(focusedIndex + 1, rows);
    case "ArrowUp":
      return focusRowAt(focusedIndex - 1, rows);
    case "Home":
      return focusRowAt(0, rows);
    case "End":
      return focusRowAt(rows.length - 1, rows);
    case "ArrowRight":
      if (!isExpandableDirectory) {
        return null;
      }

      return row.isExpanded
        ? focusRowAt(focusedIndex + 1, rows)
        : { type: "toggleDirectory", path: row.path };
    case "ArrowLeft":
      if (isExpandableDirectory && row.isExpanded) {
        return { type: "toggleDirectory", path: row.path };
      }

      return row.parentIndex === null ? null : { type: "focusRow", index: row.parentIndex };
    default:
      return null;
  }
};

export const getArticleNavigatorFocusedIndex = (
  rows: ArticleNavigatorRow[],
  focusedPath: string | null,
) => {
  if (focusedPath === null) {
    return Math.max(
      rows.findIndex((row) => row.kind === "file" && row.isActive),
      0,
    );
  }

  const focusedIndex = rows.findIndex((row) => isSamePath(row.path, focusedPath));

  if (focusedIndex >= 0) {
    return focusedIndex;
  }

  // A collapsed directory takes its descendants with it, so focus falls back to
  // the deepest ancestor that survived.
  return Math.max(
    rows.findLastIndex((row) => isSameOrParentPath(row.path, focusedPath)),
    0,
  );
};

const focusRowAt = (
  index: number,
  rows: ArticleNavigatorRow[],
): ArticleNavigatorTraversalAction | null =>
  index >= 0 && index < rows.length ? { type: "focusRow", index } : null;
