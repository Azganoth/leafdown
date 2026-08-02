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

export const ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS = 1000;

// Space activates the focused row, except mid-search, where it is an ordinary
// character in a file name.
export const isArticleNavigatorTypeaheadKey = (key: string, typeaheadBuffer: string) =>
  key.length === 1 && (key !== " " || typeaheadBuffer !== "");

interface GetArticleNavigatorTypeaheadIndexOptions {
  focusedIndex: number;
  rows: ArticleNavigatorRow[];
  typeaheadBuffer: string;
}

export const getArticleNavigatorTypeaheadIndex = ({
  focusedIndex,
  rows,
  typeaheadBuffer,
}: GetArticleNavigatorTypeaheadIndexOptions) => {
  // A repeated character cycles through the rows starting with it, rather than
  // searching for a name made of it.
  const query = (
    isRepeatedCharacter(typeaheadBuffer) ? typeaheadBuffer[0] : typeaheadBuffer
  ).toLowerCase();

  if (!query) {
    return null;
  }

  const searchOrder = rows
    .map((_, offset) => (focusedIndex + offset) % rows.length)
    // A single character always advances, so the row already focused cannot answer it.
    .filter((index) => query.length > 1 || index !== focusedIndex);

  return searchOrder.find((index) => rows[index].name.toLowerCase().startsWith(query)) ?? null;
};

const isRepeatedCharacter = (value: string) =>
  value.length > 1 && value === value[0].repeat(value.length);

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
