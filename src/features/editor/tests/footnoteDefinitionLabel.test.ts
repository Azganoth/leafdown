// @vitest-environment happy-dom

import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextContent,
  setTextSelection,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const DEFINITION_SELECTOR = "dl[data-type='footnote_definition']";
const LABEL_SELECTOR = `${DEFINITION_SELECTOR} > dt`;

describe("footnote definition label", () => {
  it("spells the label once, as the content the definition opens with", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const definition = getEditorDomElement(mounted, DEFINITION_SELECTOR);
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);

    expect(definition.querySelectorAll("dt")).toHaveLength(1);
    expect(label).toHaveTextContent(/^note$/u);
    expect(definition.querySelector("p")).toHaveTextContent("Detail");
  });

  it("keeps the marker runs out of every position the document holds", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);
    const definitionPos = getEditorNodePosition(mounted, "footnote_definition");
    const definitionNode = mounted.view.state.doc.nodeAt(definitionPos);

    expect(getEditorTextContent(mounted)).not.toContain("[^note]:");

    const caret = TextSelection.near(
      mounted.view.state.doc.resolve(mounted.view.posAtDOM(label, 0)),
      1,
    );

    expect(caret.from).toBeGreaterThan(definitionPos);
    expect(caret.from).toBeLessThan(definitionPos + (definitionNode?.nodeSize ?? 0));
    expect(caret.$from.parent).toBe(definitionNode?.firstChild);
  });

  it("presents the label the same wherever the caret is", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);
    const away = label.outerHTML;

    setTextSelection(mounted.view, mounted.view.posAtDOM(label, 0));

    expect(getEditorDomElement(mounted, LABEL_SELECTOR).outerHTML).toBe(away);

    setTextSelection(mounted.view, 1);

    expect(getEditorDomElement(mounted, LABEL_SELECTOR).outerHTML).toBe(away);
  });

  it("writes back the label the file was read with", async () => {
    const markdown = "Text[^note]\n\n[^note]: Detail\n";
    const mounted = await mountEditor(markdown);

    expect(mounted.getMarkdown()).toBe(markdown);
  });
});
