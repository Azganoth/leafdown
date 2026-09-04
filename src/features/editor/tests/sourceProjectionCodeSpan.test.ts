// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const enterProjectionAt = (
  mounted: Awaited<ReturnType<typeof mountProjectionEditor>>,
  text: string,
) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + 1);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

describe("code span source projection", () => {
  // The markers the caret reveals are the run the save writes the span with: the shortest length
  // its content leaves free, plus the surplus the file spent over that.
  it.each([
    { anchor: "plain", name: "the shortest run", source: "`plain`" },
    { anchor: "plain", name: "a run longer than the content forces", source: "``plain``" },
    {
      anchor: "code with a",
      name: "a run the content forces",
      source: "``code with a ` backtick``",
    },
    {
      anchor: "code with",
      name: "a run over content spelling a longer one",
      source: "```code with `` two```",
    },
  ])("projects $name as the file spells it", async ({ anchor, source }) => {
    const mounted = await mountProjectionEditor(`${source}\n`);

    enterProjectionAt(mounted, anchor);

    expect(getEditorTextContent(mounted)).toBe(source);
  });

  it("writes the projected run back after a session that changed nothing", async () => {
    const mounted = await mountProjectionEditor("``plain``\n");

    enterProjectionAt(mounted, "plain");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("``plain``\n");
  });

  // An edit to the span's text leaves its markers alone, so a run the author never touched
  // survives the edit.
  it("keeps the recorded run across an edit inside the projected span", async () => {
    const mounted = await mountProjectionEditor("``plain``\n");

    enterProjectionAt(mounted, "plain");
    typeText(mounted.view, "X");

    expect(getEditorTextContent(mounted)).toBe("``pXlain``");

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("``pXlain``\n");
  });

  // A marker the author edits is the form they asked for, so the run they typed is the one the
  // file is written with.
  it("records the run the author types into the markers", async () => {
    const mounted = await mountProjectionEditor("``plain``\n");

    enterProjectionAt(mounted, "plain");
    setTextSelection(mounted.view, 1 + "``plain``".length);
    typeText(mounted.view, "`");
    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "`");

    expect(getEditorTextContent(mounted)).toBe("```plain```");

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("```plain```\n");
  });
});
