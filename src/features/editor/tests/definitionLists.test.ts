// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  getEditorNodePosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  typeText,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../plugins/blockSelection";
import { deleteSelectedBlocks } from "../plugins/blockSelectionOperations";
import { getDefaultClipboardPayload } from "../utils/clipboard";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const structuralNodes = (doc: Awaited<ReturnType<typeof mountEditor>>["view"]["state"]["doc"]) => {
  const types: string[] = [];
  doc.descendants((node) => {
    if (node.type.name.startsWith("definition_")) types.push(node.type.name);
  });
  return types;
};

describe("Definition lists", () => {
  it.each([
    "Term\n: Description\n",
    "Term\n~ Description\n",
    "Term\n\n: Description\n",
    "Term\n :  Description\n",
    "Term\n  ~\tDescription\n",
    "Term\n   : Description\n",
    "Term\n: First\n: Second\n",
    "Term\n~ First\n: Second\n",
    "Term\n~ First\n\n: Second\n",
    "Term\n: First line\nlazy continuation\n",
    "Term\n: First paragraph\n\n  Second paragraph\n",
    "Term\n: Intro\n\n  - item\n",
    "Term\n: Intro\n\n  > quote\n",
    "Term\n: Intro\n\n  ```ts\n  code\n  ```\n",
    "Outer\n: Inner term\n  : Inner definition\n",
    "> Quoted term\n> ~ Quoted definition\n",
    "😀 Term\n~ Description\n",
    "**Bold** term\n~ Definition with [link](https://example.com)\n",
    "First\n: One\n\nSecond\n: Two\n",
    "First term\n: First definition\nSecond term\n: Second definition\n",
  ])("parses and reopens %j", async (source) => {
    const mounted = await mountEditor(source);
    expect(structuralNodes(mounted.view.state.doc)).toContain("definition_list");
    const markdown = mounted.getMarkdown();
    expect(markdown).toBe(source);
    const reopened = await mountEditor(markdown);
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it.each([
    ["Term\n: Description\n", false],
    ["Term\n\n: Description\n", true],
  ])("records the authored gap before a definition: %j", async (source, leadingBlank) => {
    const mounted = await mountEditor(source);
    expect(mounted.view.state.doc.firstChild?.child(1).attrs.leadingBlank).toBe(leadingBlank);
  });

  it.each([
    "Term one\nTerm two\n: Shared definition\n",
    "Term one\nTerm two\n~ Shared definition\n",
    "Term one\nTerm two\n: First definition\n: Second definition\n",
    "😀 Term one\nTerm two\n~ Shared definition\n",
    "Term\n:Missing space\n",
    "Term\n\n\n: Too many blank lines\n",
    "Term\n    : Indented code\n",
    ": No term\n",
    "~ No term\n",
    "# Heading\n~ Not a definition\n",
    "```text\n~ Still code\n```\n",
  ])("keeps unsupported source ordinary: %j", async (source) => {
    const mounted = await mountEditor(source);
    expect(structuralNodes(mounted.view.state.doc)).not.toContain("definition_list");
    expect(mounted.getMarkdown().includes("~")).toBe(source.includes("~"));
  });

  it("does not consume a GFM table row as a definition", async () => {
    const mounted = await mountEditor("head\n| - |\nrow1\n: row2\n");
    expect(mounted.view.dom.querySelector("table")).toBeInTheDocument();
    expect(structuralNodes(mounted.view.state.doc)).not.toContain("definition_list");
  });

  it("keeps a multi-term candidate as ordinary Markdown", async () => {
    const source = "First term\nSecond term\n~ Shared definition\n";
    const mounted = await mountEditor(source);
    expect(structuralNodes(mounted.view.state.doc)).not.toContain("definition_list");
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("keeps every definition after consecutive terms as ordinary Markdown", async () => {
    const source = "First term\nSecond term\n: First definition\n: Second definition\n";
    const mounted = await mountEditor(source);
    expect(structuralNodes(mounted.view.state.doc)).not.toContain("definition_list");
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(structuralNodes(reopened.view.state.doc)).not.toContain("definition_list");
    expect(reopened.view.state.doc.textContent).toBe(mounted.view.state.doc.textContent);
  });

  it.each([": ", "~ ", "  :  "])(
    "recognizes a definition typed after a term: %j",
    async (marker) => {
      const mounted = await mountEditor("Term");
      setSelectionAtDocumentEnd(mounted.view);
      expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
      typeText(mounted.view, marker);
      expect(structuralNodes(mounted.view.state.doc)).toContain("definition_list");
      typeText(mounted.view, "Body");
      expect(mounted.getMarkdown()).toBe(`Term\n${marker}Body\n`);
    },
  );

  it("recognizes a definition typed after one blank line", async () => {
    const mounted = await mountEditor("Term");
    setSelectionAtDocumentEnd(mounted.view);
    runKeyDownHandlers(mounted.view, "Enter");
    runKeyDownHandlers(mounted.view, "Enter");
    typeText(mounted.view, "~ Body");
    expect(mounted.getMarkdown()).toBe("Term\n\n~ Body\n");
  });

  it("adds a second typed definition to the same term", async () => {
    const mounted = await mountEditor("Term");
    setSelectionAtDocumentEnd(mounted.view);
    runKeyDownHandlers(mounted.view, "Enter");
    typeText(mounted.view, ": First");
    runKeyDownHandlers(mounted.view, "Enter");
    typeText(mounted.view, "~ Second");

    const list = mounted.view.state.doc.firstChild;
    expect(list?.type.name).toBe("definition_list");
    expect(list?.childCount).toBe(3);
    expect(mounted.getMarkdown()).toBe("Term\n: First\n~ Second\n");
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it("can still type a nested definition list with an indented marker", async () => {
    const mounted = await mountEditor("Outer\n: Inner term\n");
    setSelectionAtDocumentEnd(mounted.view);
    runKeyDownHandlers(mounted.view, "Enter");
    typeText(mounted.view, "  : Nested definition");

    expect(mounted.view.state.doc.firstChild?.child(1).firstChild?.type.name).toBe(
      "definition_list",
    );
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it("keeps authored form while term and definition content are edited and undone", async () => {
    const mounted = await mountEditor("Term\n  ~  Body\n");
    const term = getEditorTextPosition(mounted, "Term");
    setTextSelection(mounted.view, term + 4);
    typeText(mounted.view, "s");
    const body = getEditorTextPosition(mounted, "Body");
    setTextSelection(mounted.view, body + 4);
    typeText(mounted.view, " text");
    expect(mounted.getMarkdown()).toBe("Terms\n  ~  Body text\n");
    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Terms\n  ~  Body\n");
    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Terms\n  ~  Body text\n");
  });

  it("copies and pastes a complete definition list with its authored marker", async () => {
    const source = await mountEditor("Term\n~  Body\n");
    const block = getSelectableBlockTargets(source.view.state.doc).find(
      ({ node }) => node.type.name === "definition_list",
    );
    expect(block).toBeDefined();
    source.view.dispatch(
      source.view.state.tr.setSelection(
        createHierarchicalBlockSelection(source.view.state.doc, block!.pos),
      ),
    );
    const payload = getDefaultClipboardPayload(source.view);
    expect(payload?.text).toContain("~  Body");
    expect(payload?.html).toContain("<dl");
    expect(payload?.html).toContain('data-marker="~"');

    const target = await mountEditor("");
    const { event } = dispatchClipboardEvent(target.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: payload!.html,
      [TEXT_PLAIN_MIME_TYPE]: payload!.text,
    });
    expect(event.defaultPrevented).toBe(true);
    expect(target.getMarkdown()).toBe("Term\n~  Body\n");
  });

  it("parses a plain-text paste with the same structure as a file", async () => {
    const target = await mountEditor("");
    const { event } = dispatchClipboardEvent(target.view.dom, "paste", {
      [TEXT_PLAIN_MIME_TYPE]: "Term\n~ Body\n",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(structuralNodes(target.view.state.doc)).toContain("definition_list");
  });

  it("lets a nested block be selected and deleted without flattening its definition", async () => {
    const mounted = await mountEditor("Term\n: First\n\n  > Quote\n");
    const quote = getSelectableBlockTargets(mounted.view.state.doc).find(
      ({ node }) => node.type.name === "blockquote",
    );
    expect(quote).toBeDefined();
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, quote!.pos),
      ),
    );
    expect(deleteSelectedBlocks(mounted.view)).toBe(true);
    expect(structuralNodes(mounted.view.state.doc)).toContain("definition_list");
    expect(mounted.getMarkdown()).toBe("Term\n: First\n");
  });

  it("drops marker padding that would reparse an edited paragraph as code", async () => {
    const mounted = await mountEditor("Term\n:     Code\n");
    const code = getEditorNodePosition(mounted, "code_block");
    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(code, mounted.view.state.schema.nodes.paragraph),
    );
    const markdown = mounted.getMarkdown();
    expect(markdown).toBe("Term\n: Code\n");
    const reopened = await mountEditor(markdown);
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });
});
