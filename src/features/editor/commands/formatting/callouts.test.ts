// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection, typeText } from "@/test/utils/prosemirror";

import { getEditorCommandState } from "..";
import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../../plugins/blockSelection";
import { CALLOUT_TYPES, type CalloutDialect } from "../../plugins/callout";
import type { CalloutTypeRequest } from "../../plugins/calloutType";
import { leafdownSourceProjectionPluginKey } from "../../plugins/sourceProjection";
import { canRedo, canUndo, redo, undo } from "../editing/history";
import { canInsertBlockAtBoundary, insertBlockAtBoundary } from "../inserting/blocks";
import {
  applyCalloutType,
  canChangeCalloutType,
  canInsertCallout,
  canToggleCalloutExpanded,
  changeCalloutType,
  closeCalloutType,
  insertCallout,
  isCalloutExpanded,
  toggleCalloutExpanded,
} from "./callouts";

const mountEditor = setupMilkdownEditorMount();

const mountWithRequests = async (markdown: string) => {
  const requests: CalloutTypeRequest[] = [];
  const onClose = vi.fn();
  const onContentChanged = vi.fn();
  const mounted = await mountEditor(markdown, {
    onCalloutTypeClosed: onClose,
    onCalloutTypeRequested: (request) => requests.push(request),
    onContentChanged,
  });

  return { mounted, onClose, onContentChanged, requests };
};

const placeCaret = (mounted: MountedMilkdownEditor, text: string) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text));
};

const openAt = (
  mounted: MountedMilkdownEditor,
  requests: CalloutTypeRequest[],
  text: string,
  open: (view: EditorView) => boolean = changeCalloutType,
) => {
  placeCaret(mounted, text);

  expect(open(mounted.view)).toBe(true);

  const request = requests.at(-1);

  if (!request) {
    throw new Error("Expected the command to request the callout type picker.");
  }

  return request;
};

// The saved file reopens as the same document and saves again unchanged.
const expectRoundTrip = async (mounted: MountedMilkdownEditor, expected: string) => {
  const written = mounted.getMarkdown();
  const reopened = await mountEditor(written);

  expect(written).toBe(expected);
  expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  expect(reopened.getMarkdown()).toBe(written);
};

const withProse = (block: string) => `Intro\n\n${block}\n\nOutro\n`;

describe("callout type availability", () => {
  it.each([
    ["the body of a callout", "> [!NOTE]\n> Body text", "Body", true],
    ["a paragraph outside one", "> [!NOTE]\n> Body text", "Outro", false],
    ["an ordinary blockquote", "> Body text", "Body", false],
  ])("is %s: %s", async (_, block, text, expected) => {
    const mounted = await mountEditor(withProse(block));

    placeCaret(mounted, text);

    expect(canChangeCalloutType(mounted.view.state)).toBe(expected);
  });

  it("is available for a block selection of one callout", async () => {
    const mounted = await mountEditor(withProse("!!! tip\n    Body text"));
    const callout = getSelectableBlockTargets(mounted.view.state.doc).find(
      ({ node }) => node.type.name === "callout",
    )!;

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, callout.pos, callout.pos),
      ),
    );

    expect(canChangeCalloutType(mounted.view.state)).toBe(true);
  });

  it("is unavailable for a selection reaching out of the callout", async () => {
    const mounted = await mountEditor(withProse("> [!NOTE]\n> Body text"));

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Body"),
      getEditorTextPosition(mounted, "Outro") + 2,
    );

    expect(canChangeCalloutType(mounted.view.state)).toBe(false);
  });
});

describe("callout type changes", () => {
  it("requests the picker with the callout's dialect and type without changing the document", async () => {
    const { mounted, onContentChanged, requests } = await mountWithRequests(
      withProse("::: warning\nBody text\n:::"),
    );
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "Body");

    expect(request).toMatchObject({
      dialect: "vitepress",
      document: before,
      target: { type: "change" },
      token: "warning",
    });
    expect(request.anchor).toHaveTextContent("warning");
    expect(mounted.view.state.doc).toBe(before);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it.each([
    ["a GitHub alert", "> [!NOTE]\n> Body text", "CAUTION", "> [!CAUTION]\n> Body text"],
    [
      "an MkDocs admonition, keeping its title, marker, and opening blank line",
      '???+ note "Custom title"\n\n    Body text',
      "bug",
      '???+ bug "Custom title"\n\n    Body text',
    ],
    [
      "a Docusaurus admonition, keeping its fence length and title",
      "::::note[Custom title]\n\nBody text\n\n::::",
      "danger",
      "::::danger[Custom title]\n\nBody text\n\n::::",
    ],
    [
      "a VitePress container, keeping its title",
      "::: details Read more\nBody text\n:::",
      "tip",
      "::: tip Read more\nBody text\n:::",
    ],
  ])("changes the type of %s", async (_, block, token, expected) => {
    const { mounted, onContentChanged, requests } = await mountWithRequests(withProse(block));
    const request = openAt(mounted, requests, "Body");

    expect(applyCalloutType(mounted.view, request, token)).toBe(true);
    expect(onContentChanged).toHaveBeenCalled();
    await expectRoundTrip(mounted, withProse(expected));
  });

  it.each([
    ["github", "> [!NOTE]\n> Body text", "note"],
    ["mkdocs", "!!! note\n    Body text", "NOTE"],
    ["docusaurus", ":::note\nBody text\n:::", "details"],
    ["vitepress", "::: info\nBody text\n:::", "note"],
  ] as const)("offers %s callouts only their own types", async (dialect, block, foreignToken) => {
    const { mounted, requests } = await mountWithRequests(withProse(block));
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "Body");

    expect(request.dialect).toBe(dialect);
    expect(CALLOUT_TYPES[dialect]).not.toContain(foreignToken);
    expect(applyCalloutType(mounted.view, request, foreignToken)).toBe(false);
    expect(mounted.view.state.doc).toBe(before);
  });

  it("changes the innermost callout holding the caret", async () => {
    const source = withProse(":::: info Outer\nParent\n\n:::tip[Inner]\nChild\n:::\n::::");
    const { mounted, requests } = await mountWithRequests(source);
    const request = openAt(mounted, requests, "Child");

    expect(request).toMatchObject({ dialect: "docusaurus", token: "tip" });
    expect(applyCalloutType(mounted.view, request, "warning")).toBe(true);
    await expectRoundTrip(
      mounted,
      withProse(":::: info Outer\nParent\n\n:::warning[Inner]\nChild\n:::\n::::"),
    );
  });

  it("is one Undo step that Redo reapplies", async () => {
    const source = withProse("> [!NOTE]\n> Body text");
    const { mounted, requests } = await mountWithRequests(source);
    const request = openAt(mounted, requests, "Body");

    applyCalloutType(mounted.view, request, "TIP");

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);

    expect(redo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(withProse("> [!TIP]\n> Body text"));
    expect(canRedo(mounted.view.state)).toBe(false);
  });

  it("closes without a transaction when the type is unchanged", async () => {
    const { mounted, onClose, requests } = await mountWithRequests(
      withProse("> [!NOTE]\n> Body text"),
    );
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "Body");

    expect(applyCalloutType(mounted.view, request, "NOTE")).toBe(true);
    expect(mounted.view.state.doc).toBe(before);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retires the request after an edit, so the staged type applies to nothing", async () => {
    const { mounted, onClose, requests } = await mountWithRequests(
      withProse("> [!NOTE]\n> Body text"),
    );
    const request = openAt(mounted, requests, "Body");

    mounted.view.dispatch(
      mounted.view.state.tr.insertText("New ", getEditorTextPosition(mounted, "Outro")),
    );

    const edited = mounted.getMarkdown();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(applyCalloutType(mounted.view, request, "TIP")).toBe(false);
    expect(mounted.getMarkdown()).toBe(edited);
  });

  it("opens from the type badge in the callout header", async () => {
    const { mounted, requests } = await mountWithRequests(withProse("!!! tip\n    Body text"));
    const badge = mounted.view.dom.querySelector<HTMLButtonElement>(
      "[data-leafdown-callout-type]",
    )!;

    expect(badge).toHaveTextContent("tip");
    expect(badge).toHaveAccessibleName("Callout type: tip");
    expect(badge.tabIndex).toBe(-1);

    badge.click();

    expect(requests.at(-1)).toMatchObject({ anchor: badge, target: { type: "change" } });
  });
});

describe("callout insertion", () => {
  it.each([
    ["a document without callouts", "Intro\n\nOutro\n", "github", "> [!NOTE]\n> Body"],
    [
      "a document whose callouts agree on Docusaurus",
      "Intro\n\n:::tip\nOld\n:::\n\nOutro\n",
      "docusaurus",
      ":::note\nBody\n:::",
    ],
    [
      "a document whose callouts agree on MkDocs",
      "Intro\n\n??? tip\n    Old\n\nOutro\n",
      "mkdocs",
      "!!! note\n    Body",
    ],
    [
      "a document whose callouts agree on VitePress",
      "Intro\n\n::: tip\nOld\n:::\n\nOutro\n",
      "vitepress",
      "::: info\nBody\n:::",
    ],
    [
      "a document mixing dialects",
      "Intro\n\n:::tip\nOld\n:::\n\n!!! tip\n    Old\n\nOutro\n",
      "github",
      "> [!NOTE]\n> Body",
    ],
  ])("writes the dialect of %s", async (_, source, dialect, written) => {
    const { mounted, onContentChanged, requests } = await mountWithRequests(source);
    const request = openAt(mounted, requests, "Intro", insertCallout);
    const [firstType] = CALLOUT_TYPES[request.dialect];

    expect(request).toMatchObject({ dialect, target: { type: "insert" }, token: null });
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(applyCalloutType(mounted.view, request, firstType)).toBe(true);
    typeText(mounted.view, "Body");

    expect(onContentChanged).toHaveBeenCalled();
    await expectRoundTrip(mounted, source.replace("Intro\n\n", `Intro\n\n${written}\n\n`));
  });

  it.each([
    ["a paragraph", "Intro\n\nOutro\n", "Intro", "Intro\n\n> [!TIP]\n\nOutro\n"],
    [
      "a list item, after the whole list",
      "- first\n- second\n\nOutro\n",
      "first",
      "- first\n- second\n\n> [!TIP]\n\nOutro\n",
    ],
    [
      "a blockquote, after the whole quote",
      "> first\n>\n> second\n\nOutro\n",
      "first",
      "> first\n>\n> second\n\n> [!TIP]\n\nOutro\n",
    ],
    [
      "a callout, after that callout",
      "> [!NOTE]\n> Body text\n\nOutro\n",
      "Body",
      "> [!NOTE]\n> Body text\n\n> [!TIP]\n\nOutro\n",
    ],
  ])(
    "inserts after the document block holding %s, where it reopens as a callout",
    async (_, source, text, expected) => {
      const { mounted, requests } = await mountWithRequests(source);
      const request = openAt(mounted, requests, text, insertCallout);

      expect(applyCalloutType(mounted.view, request, "TIP")).toBe(true);
      expect(mounted.view.state.selection.$from.node(1).type.name).toBe("callout");
      await expectRoundTrip(mounted, expected);
    },
  );

  it("changes nothing when cancelled", async () => {
    const source = "Intro\n\nOutro\n";
    const { mounted, onClose, onContentChanged, requests } = await mountWithRequests(source);
    const before = mounted.view.state.doc;

    openAt(mounted, requests, "Intro", insertCallout);

    expect(closeCalloutType(mounted.view)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mounted.view.state.doc).toBe(before);
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("is one Undo step", async () => {
    const source = "Intro\n\nOutro\n";
    const { mounted, requests } = await mountWithRequests(source);
    const request = openAt(mounted, requests, "Intro", insertCallout);

    applyCalloutType(mounted.view, request, "WARNING");

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);
  });

  it("is available wherever the selection is", async () => {
    const mounted = await mountEditor("- first\n\n```js\ncode\n```\n");

    placeCaret(mounted, "first");
    expect(canInsertCallout(mounted.view.state)).toBe(true);

    placeCaret(mounted, "code");
    expect(canInsertCallout(mounted.view.state)).toBe(true);
  });

  it("is offered by a gutter insertion slot only between document blocks", async () => {
    const { mounted, requests } = await mountWithRequests("- first\n- second\n\nOutro\n");
    const list = mounted.view.state.doc.firstChild!;
    const betweenItems = 1 + list.firstChild!.nodeSize;
    const afterList = list.nodeSize;

    expect(canInsertBlockAtBoundary(mounted.view.state, betweenItems, "callout")).toBe(false);
    expect(canInsertBlockAtBoundary(mounted.view.state, afterList, "callout")).toBe(true);

    const before = mounted.view.state.doc;

    expect(insertBlockAtBoundary(mounted.view, afterList, "callout")).toBe(true);
    expect(mounted.view.state.doc).toBe(before);
    expect(requests.at(-1)).toMatchObject({ target: { type: "insert", boundary: afterList } });
  });
});

describe("authored callout disclosure", () => {
  it.each([
    ["a collapsed MkDocs admonition", "??? note\n    Body text", true, false],
    ["an expanded MkDocs admonition", "???+ note\n    Body text", true, true],
    ["an MkDocs admonition that cannot collapse", "!!! note\n    Body text", false, false],
    ["a VitePress details container", "::: details\nBody text\n:::", false, false],
    ["a GitHub alert", "> [!NOTE]\n> Body text", false, false],
  ])("for %s is available: %s, expanded: %s", async (_, block, available, expanded) => {
    const mounted = await mountEditor(withProse(block));

    placeCaret(mounted, "Body");

    expect(canToggleCalloutExpanded(mounted.view.state)).toBe(available);
    expect(isCalloutExpanded(mounted.view.state)).toBe(expanded);
    expect(getEditorCommandState(mounted.view)).toMatchObject({
      checkedCommands: { "format.calloutExpanded": expanded },
      enabledCommands: { "format.calloutExpanded": available },
    });
  });

  it("switches between ??? and ???+ as an undoable edit that keeps the title and body", async () => {
    const source = withProse('??? warning "Careful"\n\n    Body text');
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(source, { onContentChanged });

    placeCaret(mounted, "Body");

    expect(toggleCalloutExpanded(mounted.view)).toBe(true);
    expect(onContentChanged).toHaveBeenCalled();
    await expectRoundTrip(mounted, withProse('???+ warning "Careful"\n\n    Body text'));

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
    expect(redo(mounted.view)).toBe(true);

    expect(toggleCalloutExpanded(mounted.view)).toBe(true);
    await expectRoundTrip(mounted, source);
  });

  it("shows the body as the authored state now opens it", async () => {
    const mounted = await mountEditor(withProse("??? note\n    Body text"));
    const body = mounted.view.dom.querySelector<HTMLElement>(".leafdown-callout-body")!;

    expect(body.hidden).toBe(true);

    placeCaret(mounted, "Body");
    toggleCalloutExpanded(mounted.view);

    expect(body.hidden).toBe(false);
  });

  it("leaves the authored marker alone when the view disclosure changes", async () => {
    const source = withProse("??? note\n    Body text");
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(source, { onContentChanged });
    const toggle = mounted.view.dom.querySelector<HTMLButtonElement>(".leafdown-callout-toggle")!;

    toggle.click();

    expect(mounted.view.dom.querySelector<HTMLElement>(".leafdown-callout-body")!.hidden).toBe(
      false,
    );
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(onContentChanged).not.toHaveBeenCalled();
  });
});

describe("callout operations beside an active source projection", () => {
  const projectLink = (mounted: MountedMilkdownEditor) => {
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "guide") + 2);

    expect(leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session).toBeTruthy();
  };

  it.each([
    [
      "changes the type of the callout holding the projected link",
      "Intro\n\n> [!NOTE]\n> See [the guide](guide.md) here.\n\nOutro\n",
      changeCalloutType,
      "Intro\n\n> [!TIP]\n> See [the guide](guide.md) here.\n\nOutro\n",
    ],
    [
      "inserts after the block holding the projected link",
      "Intro\n\n> [!NOTE]\n> See [the guide](guide.md) here.\n\nOutro\n",
      insertCallout,
      "Intro\n\n> [!NOTE]\n> See [the guide](guide.md) here.\n\n> [!TIP]\n\nOutro\n",
    ],
  ])("%s as one Undo step", async (_, source, open, expected) => {
    const { mounted, requests } = await mountWithRequests(source);

    projectLink(mounted);
    expect(open(mounted.view)).toBe(true);
    expect(applyCalloutType(mounted.view, requests.at(-1)!, "TIP")).toBe(true);
    expect(mounted.getMarkdown()).toBe(expected);

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("finds a callout after a projected link again once the projection settles", async () => {
    const source = "See [the guide](guide.md) first.\n\n> [!NOTE]\n> Body text\n\nOutro\n";
    const { mounted, requests } = await mountWithRequests(source);

    projectLink(mounted);
    mounted.view.dom.querySelector<HTMLButtonElement>("[data-leafdown-callout-type]")!.click();

    expect(applyCalloutType(mounted.view, requests.at(-1)!, "CAUTION")).toBe(true);
    expect(mounted.getMarkdown()).toBe(source.replace("[!NOTE]", "[!CAUTION]"));
    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("switches an admonition's authored disclosure as one Undo step", async () => {
    const source = "Intro\n\n??? note\n    See [the guide](guide.md) here.\n\nOutro\n";
    const mounted = await mountEditor(source);

    projectLink(mounted);
    expect(toggleCalloutExpanded(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source.replace("??? note", "???+ note"));
    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
  });
});

describe("callout operations on the admonition corpus", () => {
  const source = readFileSync(resolve(process.cwd(), "corpus/extensions/admonitions.md"), "utf8");

  const findCallouts = (doc: ProseMirrorNode) => {
    const callouts: { node: ProseMirrorNode; pos: number }[] = [];

    doc.descendants((node, pos) => {
      if (node.type.name === "callout") {
        callouts.push({ node, pos });
      }
    });

    return callouts;
  };

  const calloutAttrs = (mounted: MountedMilkdownEditor) =>
    findCallouts(mounted.view.state.doc).map(({ node }) => node.attrs);

  const selectInside = (mounted: MountedMilkdownEditor, position: number) =>
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        TextSelection.near(mounted.view.state.doc.resolve(position + 1)),
      ),
    );

  // Every other line of the file is written back as it was authored.
  const changedLines = (written: string) => {
    const before = source.split("\n");
    const after = written.split("\n");

    expect(after).toHaveLength(before.length);

    return before.flatMap((line, index) => (line === after[index] ? [] : [[line, after[index]]]));
  };

  const expectReopensAs = async (mounted: MountedMilkdownEditor, written: string) => {
    const reopened = await mountEditor(written);

    expect(reopened.getMarkdown()).toBe(written);
    expect(calloutAttrs(reopened)).toEqual(calloutAttrs(mounted));
  };

  it("opens every dialect the operations below cover", async () => {
    const mounted = await mountEditor(source);
    const dialects = new Set(
      findCallouts(mounted.view.state.doc).map(({ node }) => node.attrs.dialect as CalloutDialect),
    );

    expect(dialects).toEqual(new Set(["github", "mkdocs", "docusaurus", "vitepress"]));
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("changes each callout's type in its authored form alone", async () => {
    const count = findCallouts((await mountEditor(source)).view.state.doc).length;

    for (let index = 0; index < count; index += 1) {
      const requests: CalloutTypeRequest[] = [];
      const mounted = await mountEditor(source, {
        onCalloutTypeRequested: (request) => requests.push(request),
      });
      const { node, pos } = findCallouts(mounted.view.state.doc)[index];
      const types: readonly string[] = CALLOUT_TYPES[node.attrs.dialect as CalloutDialect];
      const token = node.attrs.token as string;
      const next = types[(types.indexOf(token) + 1) % types.length];

      selectInside(mounted, pos);
      expect(changeCalloutType(mounted.view)).toBe(true);
      expect(applyCalloutType(mounted.view, requests.at(-1)!, next)).toBe(true);

      const written = mounted.getMarkdown();
      const [[before, after], ...rest] = changedLines(written);

      expect(rest).toEqual([]);
      expect(after).toBe(before.replace(token, next));
      await expectReopensAs(mounted, written);

      expect(undo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(source);
    }
  });

  it("switches each collapsible admonition's authored disclosure alone", async () => {
    const collapsible = findCallouts((await mountEditor(source)).view.state.doc).flatMap(
      ({ node }, index) => (String(node.attrs.marker).startsWith("???") ? [index] : []),
    );

    expect(collapsible).toHaveLength(2);

    for (const index of collapsible) {
      const mounted = await mountEditor(source);
      const { node, pos } = findCallouts(mounted.view.state.doc)[index];
      const marker = node.attrs.marker as string;

      selectInside(mounted, pos);
      expect(toggleCalloutExpanded(mounted.view)).toBe(true);

      const written = mounted.getMarkdown();
      const [[before, after], ...rest] = changedLines(written);

      expect(rest).toEqual([]);
      expect(after).toBe(before.replace(marker, marker === "???" ? "???+" : "???"));
      await expectReopensAs(mounted, written);

      expect(undo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(source);
    }
  });

  it("inserts a GitHub alert into the mixed file and writes every other callout as authored", async () => {
    const requests: CalloutTypeRequest[] = [];
    const mounted = await mountEditor(source, {
      onCalloutTypeRequested: (request) => requests.push(request),
    });

    placeCaret(mounted, "Admonitions");
    expect(insertCallout(mounted.view)).toBe(true);
    expect(requests.at(-1)?.dialect).toBe("github");
    expect(applyCalloutType(mounted.view, requests.at(-1)!, "IMPORTANT")).toBe(true);
    typeText(mounted.view, "Inserted");

    const written = mounted.getMarkdown();

    expect(written).toBe(
      source.replace("# Admonitions\n\n", "# Admonitions\n\n> [!IMPORTANT]\n> Inserted\n\n"),
    );
    await expectReopensAs(mounted, written);
  });
});
