// @vitest-environment happy-dom

import type { EditorView } from "@milkdown/kit/prose/view";
import { beforeEach, describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const LEAF_DEFINITION = '[leaf]: ../assets/leaf.svg "Leaf"';

const readImageAttrs = (view: EditorView) => {
  const attrs: Record<string, unknown>[] = [];

  view.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      attrs.push(node.attrs);
    }

    return true;
  });

  return attrs;
};

// The corpus guard sees only a serialization that stops changing, and a flattened description
// converges perfectly, so these read the document a save and a reopen produce as well as the bytes
// the save wrote.
const saveAndReopen = async (source: string) => {
  const before = await mountEditor(source);
  const saved = before.getMarkdown();
  const after = await mountEditor(saved);

  return {
    imageAttrs: readImageAttrs(before.view),
    reopened: after.view.state.doc.toJSON() as unknown,
    saved,
    written: before.view.state.doc.toJSON() as unknown,
  };
};

describe("Image descriptions", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it.each([
    String.raw`![Alt with *emphasis* and ` + "`code`" + String.raw`](../assets/leaf.svg)`,
    String.raw`![**strong** and ~~strike~~](../assets/leaf.svg)`,
    String.raw`![Alt with [a link](./blocks.md) inside](../assets/leaf.svg)`,
    String.raw`![*emphasis*](../assets/leaf.svg "Inline")`,
    String.raw`[![*Linked* leaf](../assets/leaf.svg)](https://example.com)`,
  ])("keeps the inline content an image description holds: %s", async (source) => {
    const { reopened, saved, written } = await saveAndReopen(source);

    expect(saved).toBe(`${source}\n`);
    expect(reopened).toEqual(written);
  });

  it.each([
    `${LEAF_DEFINITION}\n\n![Alt with *emphasis*][leaf]`,
    `${LEAF_DEFINITION}\n\n![*emphasis*][]`,
    `${LEAF_DEFINITION}\n\n![*emphasis*]`,
  ])("keeps the inline content a reference image description holds: %s", async (source) => {
    const { reopened, saved, written } = await saveAndReopen(source);

    expect(saved).toBe(`${source}\n`);
    expect(reopened).toEqual(written);
  });

  // The description is source the image carries rather than a document of its own, so the nested
  // image reaches the file as it was written without being an image the editor renders.
  it("keeps an image nested in another image's description", async () => {
    const source = String.raw`![Outer ![inner](../assets/inner.svg)](../assets/leaf.svg)`;
    const { imageAttrs, reopened, saved, written } = await saveAndReopen(source);

    expect(saved).toBe(`${source}\n`);
    expect(reopened).toEqual(written);
    expect(imageAttrs).toEqual([
      expect.objectContaining({
        alt: "Outer inner",
        authoredDescription: "Outer ![inner](../assets/inner.svg)",
        src: "../assets/leaf.svg",
      }),
    ]);
  });

  // The rendered image is named by the text its description spells, which is the alt text
  // CommonMark derives rather than the source the file holds.
  it("names the rendered image by the text its description spells", async () => {
    const source =
      String.raw`![Alt with *emphasis* and ` + "`code`" + String.raw`](../assets/leaf.svg)`;
    const { imageAttrs } = await saveAndReopen(source);

    expect(imageAttrs).toEqual([
      expect.objectContaining({
        alt: "Alt with emphasis and code",
        authoredDescription: String.raw`Alt with *emphasis* and ` + "`code`",
      }),
    ]);
  });

  // Escapes and character references are differences the alt text answers for on its own, so a
  // description spelling only those carries no source of its own.
  it.each([
    String.raw`![escaped \*not emphasis\*](../assets/leaf.svg)`,
    String.raw`![a \[bracket\]](../assets/leaf.svg)`,
    String.raw`![plain](../assets/leaf.svg)`,
  ])("carries no description source where the alt text spells it: %s", async (source) => {
    const { imageAttrs, saved } = await saveAndReopen(source);

    expect(saved).toBe(`${source}\n`);
    expect(imageAttrs).toEqual([expect.objectContaining({ authoredDescription: null })]);
  });

  // A code span binds more tightly than the brackets around a description, so a bracket inside one
  // ends the run this reading walks before the description ends. The reading is confirmed against
  // the destination the node holds, which is what leaves such a description to its text.
  it("leaves a description a code span interrupts to the text it spells", async () => {
    const source = String.raw`![a ` + "`](x.png)`" + String.raw` b](../assets/leaf.svg)`;
    const { imageAttrs, reopened, written } = await saveAndReopen(source);

    expect(imageAttrs).toEqual([
      expect.objectContaining({ authoredDescription: null, src: "../assets/leaf.svg" }),
    ]);
    expect(reopened).toEqual(written);
  });
});
