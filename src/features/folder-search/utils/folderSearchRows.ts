import type { SearchMatchContext } from "@/features/editor";
import { getPathIdentityKey, getRelativePath, type PathSet } from "@/lib/path";

import type { FolderSearchMatch, FolderSearchResults } from "../services/folderSearchEngine";
import { getMatchIdentity, type FolderSearchMatchKey } from "../stores/folderSearch";

interface FolderSearchRowBase {
  key: string;
  path: string;
  posInSet: number;
  setSize: number;
}

export interface FolderSearchFileRow extends FolderSearchRowBase {
  kind: "file";
  name: string;
  /** The folder holding the file, relative to the searched folder, or empty at its root. */
  directory: string;
  relativePath: string;
  matchCount: number;
  clipped: boolean;
  expanded: boolean;
  /** Whether the planned replacement writes the file as a save writes it. */
  rewritesOtherText: boolean;
}

export interface FolderSearchMatchRow extends FolderSearchRowBase {
  kind: "match";
  match: FolderSearchMatch;
  parentIndex: number;
  chosen: boolean;
  unavailable: boolean;
}

export type FolderSearchRow = FolderSearchFileRow | FolderSearchMatchRow;

interface GetFolderSearchRowsOptions {
  chosenMatch: FolderSearchMatchKey | null;
  collapsedPaths: PathSet;
  results: FolderSearchResults;
  unavailableMatches: ReadonlySet<string>;
}

// Shown as the navigator copies a relative path: with the separator the folder's own path uses.
const getDisplayPath = (folderPath: string, path: string) => {
  const relativePath = getRelativePath(folderPath, path) ?? path;

  return folderPath.includes("\\") ? relativePath.replaceAll("/", "\\") : relativePath;
};

const splitDisplayPath = (relativePath: string) => {
  const separatorIndex = Math.max(relativePath.lastIndexOf("/"), relativePath.lastIndexOf("\\"));

  return {
    directory: separatorIndex === -1 ? "" : relativePath.slice(0, separatorIndex),
    name: relativePath.slice(separatorIndex + 1),
  };
};

export const getFolderSearchRows = ({
  chosenMatch,
  collapsedPaths,
  results,
  unavailableMatches,
}: GetFolderSearchRowsOptions): FolderSearchRow[] => {
  const rows: FolderSearchRow[] = [];
  const chosenIdentity = chosenMatch && getMatchIdentity(chosenMatch);

  results.files.forEach((file, fileIndex) => {
    const pathKey = getPathIdentityKey(file.path);
    const relativePath = getDisplayPath(results.folderPath, file.path);
    const expanded = !collapsedPaths.has(file.path);
    const parentIndex = rows.length;

    rows.push({
      kind: "file",
      key: `file:${pathKey}`,
      path: file.path,
      ...splitDisplayPath(relativePath),
      relativePath,
      matchCount: file.matches.length,
      clipped: file.clipped,
      expanded,
      rewritesOtherText: file.replacement?.source === "disk" && file.replacement.rewritesOtherText,
      posInSet: fileIndex + 1,
      setSize: results.files.length,
    });

    if (!expanded) {
      return;
    }

    for (const match of file.matches) {
      const identity = getMatchIdentity({ path: file.path, ordinal: match.ordinal });

      rows.push({
        kind: "match",
        key: `match:${identity}`,
        path: file.path,
        match,
        parentIndex,
        chosen: identity === chosenIdentity,
        unavailable: unavailableMatches.has(identity),
        posInSet: match.ordinal + 1,
        setSize: file.matches.length,
      });
    }
  });

  return rows;
};

// The text before a match is cut to this many characters, so the match stays in view in a narrow
// sidebar; the text after it is cut by the row's width.
const SNIPPET_LEAD_LENGTH = 24;

/**
 * The line of a match's context that holds it, as a row shows it. A run can span lines, as code and
 * frontmatter do, and a row holds one; the ends are marked clipped only where the line goes on.
 */
export const getMatchSnippet = ({
  after,
  before,
  clippedAfter,
  clippedBefore,
  match,
}: SearchMatchContext): SearchMatchContext => {
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = after.indexOf("\n");
  const lineBefore = Array.from(before.slice(lineStart));
  const lead = lineBefore.slice(-SNIPPET_LEAD_LENGTH);

  return {
    before: lead.join(""),
    match,
    after: lineEnd === -1 ? after : after.slice(0, lineEnd),
    clippedBefore: lead.length < lineBefore.length || (lineStart === 0 && clippedBefore),
    clippedAfter: lineEnd === -1 && clippedAfter,
  };
};

export type FolderSearchTraversalAction =
  | { type: "activateMatch"; index: number }
  | { type: "focusRow"; index: number }
  | { type: "toggleFile"; path: string };

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

export const isFolderSearchTraversalKey = (key: string) => TRAVERSAL_KEYS.has(key);

const focusRowAt = (index: number, rows: readonly FolderSearchRow[]) =>
  index >= 0 && index < rows.length ? ({ type: "focusRow", index } as const) : null;

export const getFolderSearchTraversalAction = (
  rows: readonly FolderSearchRow[],
  focusedIndex: number,
  key: string,
): FolderSearchTraversalAction | null => {
  const row = rows[focusedIndex];

  if (!row) {
    return null;
  }

  switch (key) {
    case " ":
    case "Enter":
      return row.kind === "file"
        ? { type: "toggleFile", path: row.path }
        : { type: "activateMatch", index: focusedIndex };
    case "ArrowDown":
      return focusRowAt(focusedIndex + 1, rows);
    case "ArrowUp":
      return focusRowAt(focusedIndex - 1, rows);
    case "Home":
      return focusRowAt(0, rows);
    case "End":
      return focusRowAt(rows.length - 1, rows);
    case "ArrowRight":
      if (row.kind !== "file") {
        return null;
      }

      return row.expanded
        ? focusRowAt(focusedIndex + 1, rows)
        : { type: "toggleFile", path: row.path };
    case "ArrowLeft":
      if (row.kind === "file") {
        return row.expanded ? { type: "toggleFile", path: row.path } : null;
      }

      return { type: "focusRow", index: row.parentIndex };
    default:
      return null;
  }
};
