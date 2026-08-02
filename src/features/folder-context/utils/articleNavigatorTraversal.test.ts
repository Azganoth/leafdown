import { describe, expect, it } from "vitest";

import { createNestedArticleTree } from "@/test/factories/folderContext";
import { TEST_NESTED_DIRECTORY_PATH } from "@/test/fixtures/paths";

import { buildArticleNavigatorRows } from "./articleNavigatorRows";
import {
  getArticleNavigatorFocusedIndex,
  getArticleNavigatorTraversalAction,
  getArticleNavigatorTypeaheadIndex,
  isArticleNavigatorTraversalKey,
  isArticleNavigatorTypeaheadKey,
} from "./articleNavigatorTraversal";

const tree = createNestedArticleTree();

// readme.md, draft.markdown, docs, spec.md, empty
const expandedRows = buildArticleNavigatorRows({
  activeArticlePath: null,
  expandedDirectoryPaths: [TEST_NESTED_DIRECTORY_PATH],
  tree,
});

// readme.md, draft.markdown, docs, empty
const collapsedRows = buildArticleNavigatorRows({
  activeArticlePath: null,
  expandedDirectoryPaths: [],
  tree,
});

const actionFor = (key: string, focusedIndex: number, rows = expandedRows) =>
  getArticleNavigatorTraversalAction({ focusedIndex, key, rows });

const typeaheadIndexFor = (typeaheadBuffer: string, focusedIndex: number) =>
  getArticleNavigatorTypeaheadIndex({ focusedIndex, rows: expandedRows, typeaheadBuffer });

describe("article navigator traversal", () => {
  it("claims only the keys the tree operates on", () => {
    const traversalKeys = [
      " ",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "End",
      "Enter",
      "Home",
    ];

    expect(traversalKeys.filter(isArticleNavigatorTraversalKey)).toEqual(traversalKeys);
    expect(isArticleNavigatorTraversalKey("a")).toBe(false);
    expect(isArticleNavigatorTraversalKey("Tab")).toBe(false);
  });

  it("moves focus one row at a time and stops at both ends", () => {
    expect(actionFor("ArrowDown", 0)).toEqual({ type: "focusRow", index: 1 });
    expect(actionFor("ArrowUp", 1)).toEqual({ type: "focusRow", index: 0 });
    expect(actionFor("ArrowUp", 0)).toBeNull();
    expect(actionFor("ArrowDown", expandedRows.length - 1)).toBeNull();
  });

  it("jumps to the first and last row", () => {
    expect(actionFor("Home", 3)).toEqual({ type: "focusRow", index: 0 });
    expect(actionFor("End", 0)).toEqual({ type: "focusRow", index: expandedRows.length - 1 });
  });

  it("expands a collapsed directory before descending into it", () => {
    expect(actionFor("ArrowRight", 2, collapsedRows)).toEqual({
      type: "toggleDirectory",
      path: TEST_NESTED_DIRECTORY_PATH,
    });
    expect(actionFor("ArrowRight", 2)).toEqual({ type: "focusRow", index: 3 });
  });

  it("collapses an expanded directory before leaving it", () => {
    expect(actionFor("ArrowLeft", 2)).toEqual({
      type: "toggleDirectory",
      path: TEST_NESTED_DIRECTORY_PATH,
    });
    expect(actionFor("ArrowLeft", 3)).toEqual({ type: "focusRow", index: 2 });
  });

  it("leaves rows with nowhere to go alone", () => {
    expect(actionFor("ArrowRight", 0)).toBeNull();
    expect(actionFor("ArrowRight", 4)).toBeNull();
    expect(actionFor("ArrowLeft", 0)).toBeNull();
    expect(actionFor("Escape", 0)).toBeNull();
    expect(actionFor("ArrowDown", 0, [])).toBeNull();
  });

  it("activates the focused row on enter and space", () => {
    expect(actionFor("Enter", 3)).toEqual({ type: "activateRow", index: 3 });
    expect(actionFor(" ", 2)).toEqual({ type: "activateRow", index: 2 });
  });

  it("takes printable keys as a search, and space only while one is running", () => {
    expect(isArticleNavigatorTypeaheadKey("d", "")).toBe(true);
    expect(isArticleNavigatorTypeaheadKey("2", "")).toBe(true);
    expect(isArticleNavigatorTypeaheadKey(" ", "")).toBe(false);
    expect(isArticleNavigatorTypeaheadKey(" ", "my")).toBe(true);
    expect(isArticleNavigatorTypeaheadKey("ArrowDown", "")).toBe(false);
  });

  it("jumps to the next row whose name starts with the search", () => {
    expect(typeaheadIndexFor("d", 0)).toBe(1);
    expect(typeaheadIndexFor("DR", 0)).toBe(1);
    expect(typeaheadIndexFor("e", 0)).toBe(4);
  });

  it("keeps a growing search on the row it already matched", () => {
    expect(typeaheadIndexFor("dr", 1)).toBe(1);
    expect(typeaheadIndexFor("d", 1)).toBe(2);
  });

  it("cycles through the rows sharing a first character when it repeats", () => {
    expect(typeaheadIndexFor("d", 1)).toBe(2);
    expect(typeaheadIndexFor("dd", 2)).toBe(1);
  });

  it("wraps around and reports no match", () => {
    expect(typeaheadIndexFor("r", 3)).toBe(0);
    expect(typeaheadIndexFor("z", 0)).toBeNull();
    expect(typeaheadIndexFor("", 0)).toBeNull();
  });

  it("starts on the open document and otherwise on the first row", () => {
    const rowsWithActiveArticle = buildArticleNavigatorRows({
      activeArticlePath: `${TEST_NESTED_DIRECTORY_PATH}/spec.md`,
      expandedDirectoryPaths: [TEST_NESTED_DIRECTORY_PATH],
      tree,
    });

    expect(getArticleNavigatorFocusedIndex(rowsWithActiveArticle, null)).toBe(3);
    expect(getArticleNavigatorFocusedIndex(expandedRows, null)).toBe(0);
  });

  it("follows a focused row by path across rebuilds", () => {
    expect(getArticleNavigatorFocusedIndex(expandedRows, "c:\\notes\\docs\\spec.md")).toBe(3);
  });

  it("falls back to the deepest surviving ancestor of a row that is gone", () => {
    expect(
      getArticleNavigatorFocusedIndex(collapsedRows, `${TEST_NESTED_DIRECTORY_PATH}/spec.md`),
    ).toBe(2);
    expect(getArticleNavigatorFocusedIndex(collapsedRows, "C:/Elsewhere/other.md")).toBe(0);
  });
});
