// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { beforeEach, describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { runKeyDownHandlers, setTextSelection } from "@/test/utils/prosemirror";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { runEditorCommand } from "../commands";
import {
  DEFINITION_DESTINATION_NODE_NAME,
  DEFINITION_LABEL_NODE_NAME,
  DEFINITION_NODE_NAME,
  DEFINITION_TITLE_NODE_NAME,
  getDefinitionFieldNodes,
  readReferenceType,
  REFERENCE_LABEL_ATTRIBUTE_NAME,
} from "../utils/referenceLinkMarkdown";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

beforeEach(() => {
  mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
    kind: "renderable",
    path: `C:/Notes/${target}`,
  }));
});

interface DefinitionFieldMatch {
  node: ProseMirrorNode;
  pos: number;
}

const getDefinition = (mounted: MountedMilkdownEditor, index = 0) => {
  const definitions: DefinitionFieldMatch[] = [];

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name === DEFINITION_NODE_NAME) {
      definitions.push({ node, pos });

      return false;
    }

    return node.isBlock;
  });

  const definition = definitions[index];

  if (!definition) {
    throw new Error(`Could not find reference definition ${index}.`);
  }

  return definition;
};

const getField = (
  mounted: MountedMilkdownEditor,
  name:
    | typeof DEFINITION_LABEL_NODE_NAME
    | typeof DEFINITION_DESTINATION_NODE_NAME
    | typeof DEFINITION_TITLE_NODE_NAME,
  index = 0,
) => {
  const definition = getDefinition(mounted, index);
  const fields = getDefinitionFieldNodes(definition.node);

  if (!fields) {
    throw new Error("Reference definition does not hold its editable fields.");
  }

  const ordered = [fields.label, fields.destination, fields.title];
  const fieldIndex = ordered.findIndex((node) => node.type.name === name);
  const pos =
    definition.pos +
    1 +
    ordered.slice(0, fieldIndex).reduce((size, node) => size + node.nodeSize, 0);

  return { node: ordered[fieldIndex], pos };
};

const typeField = (
  mounted: MountedMilkdownEditor,
  name: Parameters<typeof getField>[1],
  text: string,
  index = 0,
) => {
  const { node, pos } = getField(mounted, name, index);
  const from = pos + 1;
  const transaction = mounted.view.state.tr.insertText(text, from, from + node.content.size);

  transaction.setSelection(TextSelection.create(transaction.doc, from + text.length));
  mounted.view.dispatch(transaction);
};

const leaveField = (mounted: MountedMilkdownEditor) => {
  const { pos } = getDefinition(mounted);

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, pos)),
  );
};

const getReferenceAttrs = (mounted: MountedMilkdownEditor) => {
  const references: Record<string, unknown>[] = [];

  mounted.view.state.doc.descendants((node) => {
    if (node.type.name === "image" && readReferenceType(node.attrs) !== null) {
      references.push(node.attrs);
    }

    if (node.isText) {
      references.push(
        ...node.marks
          .filter((mark) => mark.type.name === "link" && readReferenceType(mark.attrs) !== null)
          .map((mark) => mark.attrs),
      );
    }

    return true;
  });

  return references;
};

describe("reference definition fields", () => {
  it("keeps syntax chrome outside the three editable document fields", async () => {
    const source = "[report]:\n    <field report.md>\n    'Field report'";
    const mounted = await mountEditor(`${source}\n`);
    const definition = mounted.root.querySelector('[data-type="definition"]');
    const label = definition?.querySelector('[data-type="definition-label"]');
    const destination = definition?.querySelector('[data-type="definition-destination"]');
    const title = definition?.querySelector('[data-type="definition-title"]');
    const titlePrefix = title?.querySelector("[data-definition-title-prefix]");

    expect(label).toHaveTextContent(/^report$/u);
    expect(label).toHaveAttribute("data-before", "[");
    expect(label).toHaveAttribute("data-after", "]:");
    expect(destination).toHaveTextContent(/^field report\.md$/u);
    expect(destination).toHaveAttribute("data-before", "\n    <");
    expect(destination).toHaveAttribute("data-after", ">");
    expect(getField(mounted, DEFINITION_TITLE_NODE_NAME).node.textContent).toBe("Field report");
    expect(titlePrefix?.textContent).toBe("\n    '");
    expect(title).toHaveAttribute("data-after", "'");
    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("turns the optional-title ghost position into a title through ArrowRight", async () => {
    const mounted = await mountEditor("[report]: /garden\n");
    const destination = getField(mounted, DEFINITION_DESTINATION_NODE_NAME);

    setTextSelection(mounted.view, destination.pos + 1 + destination.node.content.size);

    expect(mounted.root.querySelector("[data-definition-title-prefix]")?.textContent).toBe(' "');
    expect(mounted.root.querySelector('[data-type="definition-title"]')).toHaveAttribute(
      "data-after",
      ' title (optional) "',
    );

    const { handled } = runKeyDownHandlers(mounted.view, "ArrowRight");

    expect(handled).toBe(true);
    expect(mounted.view.state.selection.$from.parent.type.name).toBe(DEFINITION_TITLE_NODE_NAME);
    expect(
      mounted.root.querySelector('[data-type="definition-title"] > br.ProseMirror-trailingBreak'),
    ).toBeInTheDocument();

    mounted.view.dispatch(mounted.view.state.tr.insertText("x"));
    leaveField(mounted);

    expect(mounted.getMarkdown()).toBe('[report]: /garden "x"\n');
  });

  it("places a click on the optional-title ghost inside its empty field", async () => {
    const mounted = await mountEditor("[report]: /garden\n");
    const label = getField(mounted, DEFINITION_LABEL_NODE_NAME);

    setTextSelection(mounted.view, label.pos + 1);
    mounted.root
      .querySelector('[data-type="definition-title"]')
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

    expect(mounted.view.state.selection.$from.parent.type.name).toBe(DEFINITION_TITLE_NODE_NAME);
    expect(mounted.view.state.selection.$from.parentOffset).toBe(0);

    mounted.view.dispatch(mounted.view.state.tr.insertText("x"));
    leaveField(mounted);

    expect(mounted.getMarkdown()).toBe('[report]: /garden "x"\n');
  });

  it("places a click on a filled title marker before its first character", async () => {
    const mounted = await mountEditor('[report]: /garden "Old"\n');

    mounted.root
      .querySelector("[data-definition-title-prefix]")
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

    expect(mounted.view.state.selection.$from.parent.type.name).toBe(DEFINITION_TITLE_NODE_NAME);
    expect(mounted.view.state.selection.$from.parentOffset).toBe(0);

    mounted.view.dispatch(mounted.view.state.tr.insertText("x"));
    leaveField(mounted);

    expect(mounted.getMarkdown()).toBe('[report]: /garden "xOld"\n');
  });

  it("shows the optional-title ghost only while the definition holds the caret", async () => {
    const mounted = await mountEditor("Paragraph\n\n[report]: /garden\n");
    const label = getField(mounted, DEFINITION_LABEL_NODE_NAME);
    const title = mounted.root.querySelector('[data-type="definition-title"]');

    expect(mounted.root.querySelector("[data-definition-title-prefix]")).toBeNull();
    expect(title).not.toHaveAttribute("data-placeholder");

    setTextSelection(mounted.view, label.pos + 1);

    expect(mounted.root.querySelector("[data-definition-title-prefix]")?.textContent).toBe(' "');
    expect(title).toHaveAttribute("data-after", ' title (optional) "');
    expect(title).toHaveAttribute("data-placeholder");
  });

  it("keeps a line ending out of every definition field", async () => {
    const mounted = await mountEditor('[report]: /garden "Old"\n');
    const title = getField(mounted, DEFINITION_TITLE_NODE_NAME);

    setTextSelection(mounted.view, title.pos + 1 + title.node.content.size);

    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(mounted.getMarkdown()).toBe('[report]: /garden "Old"\n');
  });

  it("returns a deleted title to the optional-title ghost state", async () => {
    const mounted = await mountEditor('Paragraph\n\n[report]: /garden "Old"\n');

    typeField(mounted, DEFINITION_TITLE_NODE_NAME, "");

    expect(mounted.root.querySelector("[data-definition-title-prefix]")?.textContent).toBe(' "');
    expect(mounted.root.querySelector('[data-type="definition-title"]')).toHaveAttribute(
      "data-after",
      ' title (optional) "',
    );

    setTextSelection(mounted.view, 1);

    expect(mounted.root.querySelector("[data-definition-title-prefix]")).toBeNull();
    expect(mounted.root.querySelector('[data-type="definition-title"]')).not.toHaveAttribute(
      "data-placeholder",
    );
    expect(mounted.getMarkdown()).toBe("Paragraph\n\n[report]: /garden\n");
  });

  it("renames the definition and every link and image reference that resolved to it", async () => {
    const mounted = await mountEditor('[Link][report] ![Image][REPORT]\n\n[report]: /garden "Old"');

    typeField(mounted, DEFINITION_LABEL_NODE_NAME, "archive");
    leaveField(mounted);

    expect(
      getReferenceAttrs(mounted).map((attrs) => attrs[REFERENCE_LABEL_ATTRIBUTE_NAME]),
    ).toEqual(["archive", "archive"]);
    expect(mounted.getMarkdown()).toBe(
      '[Link][archive] ![Image][archive]\n\n[archive]: /garden "Old"\n',
    );
  });

  it("propagates committed destination and title edits to resolved references", async () => {
    const mounted = await mountEditor('[Link][report] ![Image][report]\n\n[report]: /garden "Old"');

    typeField(mounted, DEFINITION_DESTINATION_NODE_NAME, "/archive");
    leaveField(mounted);
    typeField(mounted, DEFINITION_TITLE_NODE_NAME, "New");
    leaveField(mounted);

    expect(getReferenceAttrs(mounted)).toEqual([
      expect.objectContaining({ href: "/archive", title: "New" }),
      expect.objectContaining({ src: "/archive", title: "New" }),
    ]);
    expect(mounted.getMarkdown()).toBe(
      '[Link][report] ![Image][report]\n\n[report]: /archive "New"\n',
    );
  });

  it("updates destination and title chrome while their fields are being typed", async () => {
    const mounted = await mountEditor("[report]: /garden (Old)\n");

    typeField(mounted, DEFINITION_DESTINATION_NODE_NAME, "field report.md");

    expect(mounted.root.querySelector('[data-type="definition-destination"]')).toHaveAttribute(
      "data-before",
      " <",
    );
    expect(mounted.root.querySelector('[data-type="definition-destination"]')).toHaveAttribute(
      "data-after",
      ">",
    );

    leaveField(mounted);
    typeField(mounted, DEFINITION_TITLE_NODE_NAME, "Closing ) report");

    expect(mounted.root.querySelector("[data-definition-title-prefix]")?.textContent).toBe(' "');
    expect(mounted.root.querySelector('[data-type="definition-title"]')).toHaveAttribute(
      "data-after",
      '"',
    );
  });

  it("restores an empty or colliding label when the edit commits", async () => {
    const mounted = await mountEditor("[one]: /first\n\n[two words]: /second\n\n[one] [two words]");

    typeField(mounted, DEFINITION_LABEL_NODE_NAME, "");
    leaveField(mounted);

    expect(getField(mounted, DEFINITION_LABEL_NODE_NAME).node.textContent).toBe("one");

    typeField(mounted, DEFINITION_LABEL_NODE_NAME, "bad]");
    leaveField(mounted);

    expect(getField(mounted, DEFINITION_LABEL_NODE_NAME).node.textContent).toBe("one");

    typeField(mounted, DEFINITION_LABEL_NODE_NAME, "bad[");
    leaveField(mounted);

    expect(getField(mounted, DEFINITION_LABEL_NODE_NAME).node.textContent).toBe("one");

    typeField(mounted, DEFINITION_LABEL_NODE_NAME, "  TWO   WORDS  ");
    leaveField(mounted);

    expect(getField(mounted, DEFINITION_LABEL_NODE_NAME).node.textContent).toBe("one");
    expect(mounted.getMarkdown()).toBe(
      "[one]: /first\n\n[two words]: /second\n\n[one] [two words]\n",
    );
  });

  it("leaves references on the first definition when a later duplicate changes", async () => {
    const mounted = await mountEditor("[same]\n\n[same]: /first\n[same]: /second\n");

    typeField(mounted, DEFINITION_DESTINATION_NODE_NAME, "/third", 1);
    leaveField(mounted);

    expect(getReferenceAttrs(mounted)).toEqual([expect.objectContaining({ href: "/first" })]);
    expect(mounted.getMarkdown()).toBe("[same]\n\n[same]: /first\n[same]: /third\n");
  });

  it("settles an undone destination edit when the caret next leaves the field", async () => {
    const mounted = await mountEditor("[report]\n\n[report]: /garden\n");

    typeField(mounted, DEFINITION_DESTINATION_NODE_NAME, "/archive");
    leaveField(mounted);

    expect(getReferenceAttrs(mounted)).toEqual([expect.objectContaining({ href: "/archive" })]);

    await runEditorCommand(mounted.editor, "edit.undo");
    leaveField(mounted);

    expect(getReferenceAttrs(mounted)).toEqual([expect.objectContaining({ href: "/garden" })]);
    expect(mounted.getMarkdown()).toBe("[report]\n\n[report]: /garden\n");
  });

  it("commits an active field before serialization", async () => {
    const mounted = await mountEditor("[report]: /garden\n\n[report]\n");

    typeField(mounted, DEFINITION_DESTINATION_NODE_NAME, "/archive");

    expect(mounted.getMarkdown()).toBe("[report]: /archive\n\n[report]\n");
    expect(getReferenceAttrs(mounted)).toEqual([expect.objectContaining({ href: "/archive" })]);
  });
});
