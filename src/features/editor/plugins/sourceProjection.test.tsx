import { Fragment, Slice } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import {
  setupMilkdownEditorMount,
  type MountedMilkdownEditor,
  type MountMilkdownEditorOptions,
} from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import {
  createLiteralSourceProjectionSlice,
  type SourceProjectionAdapter,
  type SourceProjectionTarget,
} from "../utils/sourceProjectionAdapters";
import {
  createSourceProjectionProsePlugin,
  hasActiveSourceProjection,
  leafdownSourceProjectionPluginKey,
  pasteIntoSourceProjection,
} from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS = 300;
const TEST_ATOMIC_ADAPTER_ID = "test-atomic";

interface TestAtomicTarget extends SourceProjectionTarget {
  adapterId: typeof TEST_ATOMIC_ADAPTER_ID;
  label: string;
}

const getTestAtomicTarget = (target: SourceProjectionTarget): TestAtomicTarget => {
  if (target.adapterId !== TEST_ATOMIC_ADAPTER_ID) {
    throw new Error(`Expected a test atomic target, received '${target.adapterId}'`);
  }

  return target as TestAtomicTarget;
};

const TEST_ATOMIC_ADAPTER: SourceProjectionAdapter = {
  id: TEST_ATOMIC_ADAPTER_ID,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => {
    const { selection } = state;

    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== "footnote_reference"
    ) {
      return null;
    }

    const label = String(selection.node.attrs.label ?? "");

    return {
      adapterId: TEST_ATOMIC_ADAPTER_ID,
      from: selection.from,
      label,
      originalContent: state.doc.slice(selection.from, selection.to),
      originalContentSize: selection.to - selection.from,
      originalSource: `[^${label}]`,
      to: selection.to,
    } satisfies TestAtomicTarget;
  },
  getPresentation: (_target, source) => {
    const contentTo = Math.max(2, source.length - 1);

    return {
      sourceTypes: ["footnote-reference"],
      spans: [
        { className: "test-source-projection__marker", from: 0, to: 2 },
        {
          className: "test-source-projection__label",
          from: 2,
          to: contentTo,
        },
        {
          className: "test-source-projection__marker",
          from: contentTo,
          to: source.length,
        },
      ],
    };
  },
  mapSelectionFromSource: (_selection, session, result) => ({
    anchor: session.from + result.replacementSize,
    head: session.from + result.replacementSize,
  }),
  mapSelectionToSource: (_selection, target) => {
    const atomicTarget = getTestAtomicTarget(target);

    return {
      anchor: target.from + 2,
      head: target.from + 2 + atomicTarget.label.length,
    };
  },
  parseSource: (state, source) => {
    const label = /^\[\^(?<label>[^\]]+)\]$/u.exec(source)?.groups?.label;
    const node = label ? state.schema.nodes.footnote_reference?.create({ label }) : null;

    return node
      ? {
          replacement: new Slice(Fragment.from(node), 0, 0),
          replacementSize: node.nodeSize,
          source,
        }
      : {
          replacement: createLiteralSourceProjectionSlice(state, source),
          replacementSize: source.length,
          source,
        };
  },
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, getTestAtomicTarget(session.target).originalContent),
};

interface MountSourceProjectionEditorOptions {
  onContentChanged?: MountMilkdownEditorOptions["onContentChanged"];
  onMarkdownUpdated?: MountMilkdownEditorOptions["onMarkdownUpdated"];
}

const mountProjectionEditor = (
  initialMarkdown: string,
  options: MountSourceProjectionEditorOptions = {},
): Promise<MountedMilkdownEditor> =>
  mountEditor(initialMarkdown, {
    onContentChanged: options.onContentChanged,
    onMarkdownUpdated: options.onMarkdownUpdated,
    rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
  });

const installTestAtomicAdapter = (mounted: MountedMilkdownEditor) => {
  const plugin = createSourceProjectionProsePlugin([TEST_ATOMIC_ADAPTER]);
  let didReplaceSourceProjectionPlugin = false;
  const plugins = mounted.view.state.plugins.map((statePlugin) => {
    if (statePlugin.spec.key !== leafdownSourceProjectionPluginKey) {
      return statePlugin;
    }

    didReplaceSourceProjectionPlugin = true;
    return plugin;
  });

  if (!didReplaceSourceProjectionPlugin) {
    throw new Error(
      "Could not replace the source-projection plugin for the adapter contract test.",
    );
  }

  mounted.view.updateState(mounted.view.state.reconfigure({ plugins }));
};

const selectTestFootnoteReference = (mounted: MountedMilkdownEditor) => {
  const position = getEditorNodePosition(mounted, "footnote_reference");

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
  );
};

const waitForMarkdownUpdateListener = async () => {
  await vi.advanceTimersByTimeAsync(MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS);
};

const enterProjection = (
  mounted: MountedMilkdownEditor,
  selector: "a" | "code" | "del" | "em" | "strong",
) => {
  const element = getEditorDomElement(mounted, selector);

  setSelectionAtElementTextEnd(mounted.view, element);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

const runCommand = async (mounted: MountedMilkdownEditor, commandId: "edit.redo" | "edit.undo") =>
  runEditorCommand(mounted.editor, commandId);

describe("source projection", () => {
  describe("entry and rendering", () => {
    it("projects strong markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setTextSelection(mounted.view, sourceStart + 1);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setTextSelection(mounted.view, sourceStart + "**Bold".length);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    });

    it.each([
      { expected: "__Bold__ plain", initial: "__Bold__ plain", selector: "strong" as const },
      { expected: "_Soft_ plain", initial: "_Soft_ plain", selector: "em" as const },
    ])(
      "projects underscore source markers for $initial",
      async ({ expected, initial, selector }) => {
        const mounted = await mountProjectionEditor(initial);

        enterProjection(mounted, selector);

        expect(getEditorTextContent(mounted)).toBe(expected);
      },
    );

    it("styles projected markers separately from projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const markers = Array.from(
        mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
      );
      const content = getEditorDomElement(mounted, ".leafdown-source-projection__content--strong");

      expect(markers.map((marker) => marker.textContent).join("")).toBe("****");
      expect(content).toHaveTextContent("Bold");
    });

    it("projects strikethrough markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor("~~Strike~~ plain");

      enterProjection(mounted, "del");

      expect(getEditorTextContent(mounted)).toBe("~~Strike~~ plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strikethrough"),
      ).toHaveTextContent("Strike");
    });

    it("projects inline-code markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      expect(getEditorTextContent(mounted)).toBe("`Code` plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--inline-code"),
      ).toHaveTextContent("Code");
    });

    it("projects link source as real editable document text", async () => {
      const mounted = await mountProjectionEditor("[Link](https://example.com) plain");

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe("[Link](https://example.com) plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--link"),
      ).toHaveTextContent("Link");
    });

    it("restores the exact original document after a clean projection", async () => {
      const mounted = await mountProjectionEditor(
        '**[Strong Link](https://example.com "Title")** plain',
      );
      const originalDocument = mounted.view.state.doc;

      enterProjection(mounted, "a");

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(false);
      expect(mounted.view.dom.querySelector("a")).not.toBeInTheDocument();
      expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });
  });

  describe("adapter contract", () => {
    it("allows an atomic adapter to activate from a node selection and restore exactly", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");
      const originalDocument = mounted.view.state.doc;

      installTestAtomicAdapter(mounted);
      selectTestFootnoteReference(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("note");
      expect(mounted.view.dom.querySelectorAll(".test-source-projection__marker")).toHaveLength(2);
      expect(mounted.view.dom.querySelector(".test-source-projection__label")).toHaveTextContent(
        "note",
      );

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });

    it("uses literal editing and adapter rehydration for an atomic target", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");

      installTestAtomicAdapter(mounted);
      selectTestFootnoteReference(mounted);
      typeText(mounted.view, "updated");

      expect(getEditorTextContent(mounted)).toContain("Text[^updated]");
      expect(mounted.view.dom.querySelector(".test-source-projection__label")).toHaveTextContent(
        "updated",
      );

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toContain("Text[^updated]");
    });

    it("uses the generic literal boundary policy when an adapter provides no edit policy", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");

      installTestAtomicAdapter(mounted);
      selectTestFootnoteReference(mounted);

      const sourceStart = getEditorTextPosition(mounted, "[^note]");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "x");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection"),
          (element) => element.textContent,
        ).join(""),
      ).toBe("x[^note]");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toContain("Textx\\[^note]");
    });

    it("preserves an external node selection while switching atomic targets", async () => {
      const mounted = await mountProjectionEditor(
        "One[^one] two[^two]\n\n[^one]: First\n\n[^two]: Second",
      );

      installTestAtomicAdapter(mounted);

      const firstPosition = getEditorNodePosition(
        mounted,
        "footnote_reference",
        (node) => node.attrs.label === "one",
      );

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          NodeSelection.create(mounted.view.state.doc, firstPosition),
        ),
      );

      const secondPosition = getEditorNodePosition(
        mounted,
        "footnote_reference",
        (node) => node.attrs.label === "two",
      );

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          NodeSelection.create(mounted.view.state.doc, secondPosition),
        ),
      );

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("two");
    });
  });

  describe("source editing", () => {
    it.each([
      {
        expected: "**Bolder** plain\n",
        initial: BOLD_PLAIN_MARKDOWN,
        selector: "strong" as const,
      },
      {
        expected: "__Bolder__ plain\n",
        initial: "__Bold__ plain",
        selector: "strong" as const,
      },
      {
        expected: "*Softer* plain\n",
        initial: "*Soft* plain",
        selector: "em" as const,
      },
      {
        expected: "_Softer_ plain\n",
        initial: "_Soft_ plain",
        selector: "em" as const,
      },
      {
        expected: "***Bolder*** plain\n",
        initial: "***Bold*** plain",
        selector: "strong" as const,
      },
      {
        expected: "___Bolder___ plain\n",
        initial: "___Bold___ plain",
        selector: "strong" as const,
      },
      {
        expected: "_**Bolder**_ plain\n",
        initial: "**_Bold_** plain",
        selector: "strong" as const,
      },
    ])("commits valid projected source for $initial", async ({ expected, initial, selector }) => {
      const mounted = await mountProjectionEditor(initial);

      enterProjection(mounted, selector);
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(expected);
    });

    it("downgrades strong projection to emphasis when a strong marker is deleted", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Bold* plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");
    });

    it("commits edited strikethrough source and preserves nested marks", async () => {
      const mounted = await mountProjectionEditor("~~_**Nested**_~~ plain");

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("_**~~Nesteder~~**_ plain\n");
    });

    it("uses a longer delimiter run when inline-code content gains a backtick", async () => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`Code`");

      setTextSelection(mounted.view, sourceStart + "`Co".length);
      typeText(mounted.view, "`");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("``Co`de`` plain\n");
    });

    it("commits edited link and autolink source", async () => {
      const link = await mountProjectionEditor("[Link](https://example.com) plain");

      enterProjection(link, "a");

      const linkSourceStart = getEditorTextPosition(link, "[Link](https://example.com)");

      setTextSelection(link.view, linkSourceStart + 1);
      typeText(link.view, "Updated ");
      setSelectionAtDocumentEnd(link.view);

      expect(link.getMarkdown()).toBe("[Updated Link](https://example.com) plain\n");

      const autolink = await mountProjectionEditor("<https://example.com>");

      enterProjection(autolink, "a");

      const autolinkSourceStart = getEditorTextPosition(autolink, "<https://example.com>");

      setTextSelection(
        autolink.view,
        autolinkSourceStart,
        autolinkSourceStart + "<https://example.com>".length,
      );
      expect(pasteIntoSourceProjection(autolink.view, "<https://leafdown.dev>")).toBe(true);
      setSelectionAtDocumentEnd(autolink.view);

      expect(autolink.getMarkdown()).toBe("<https://leafdown.dev>\n");
    });

    it("preserves an empty-destination link when its label is edited", async () => {
      const mounted = await mountProjectionEditor("[Link]()");

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(mounted, "[Link]()");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "Updated ");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("[Updated Link]()\n");
      expect(getEditorDomElement(mounted, "a")).toHaveAttribute("href", "");
    });

    it("preserves a uniform outer strong mark around projected links", async () => {
      const mounted = await mountProjectionEditor("**[Strong Link](https://example.com)**");

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe("**[Strong Link](https://example.com)**");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**[Strong Link](https://example.com)**\n");
    });

    it("upgrades emphasis projection to strong when a marker is typed at the delimiter", async () => {
      const mounted = await mountProjectionEditor("*Soft* plain");

      enterProjection(mounted, "em");

      const sourceStart = getEditorTextPosition(mounted, "*Soft*");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Soft** plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**Soft** plain\n");
    });

    it("reforms emphasis projection when a missing left marker is readded", async () => {
      const mounted = await mountProjectionEditor("*Soft* plain");

      enterProjection(mounted, "em");

      const sourceStart = getEditorTextPosition(mounted, "*Soft*");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Soft* plain");

      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Soft* plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("Soft");
    });

    it("forms projection when a left marker completes plain raw inline source", async () => {
      const mounted = await mountProjectionEditor("Soft* plain");

      const sourceStart = getEditorTextPosition(mounted, "Soft*");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Soft* plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("Soft");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Soft* plain\n");
    });

    it("forms inline-code projection when a left backtick completes plain source", async () => {
      const mounted = await mountProjectionEditor("Code` plain");

      const sourceStart = getEditorTextPosition(mounted, "Code`");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "`");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("`Code` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("`Code` plain\n");
    });

    it("keeps outer-boundary text outside the projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "A");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(`A${BOLD_PLAIN_MARKDOWN}`);

      expect(mounted.getMarkdown()).toBe(`A${BOLD_PLAIN_MARKDOWN}\n`);
    });

    it.each(["~", "`"])("keeps a foreign marker %s outside a strong projection", async (marker) => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, marker);

      expect(getEditorTextContent(mounted)).toBe(`${marker}${BOLD_PLAIN_MARKDOWN}`);
      expect(mounted.getMarkdown()).toBe(`\\${marker}${BOLD_PLAIN_MARKDOWN}\n`);
    });

    it("inserts delimiter-interior text inside the projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "Z");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**ZBold** plain");
    });

    it("uses the edited delimiter side when completing marker runs", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      mounted.view.dispatch(
        mounted.view.state.tr.replaceWith(
          sourceStart,
          sourceStart + "**Bold**".length,
          mounted.view.state.schema.text("***Bold"),
        ),
      );
      setTextSelection(mounted.view, sourceStart + "***Bold".length);

      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Bold* plain");

      typeText(mounted.view, "*");

      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);

      typeText(mounted.view, "*");

      expect(getEditorTextContent(mounted)).toBe("***Bold*** plain");
    });

    it("keeps marker edits local instead of merging adjacent marked runs", async () => {
      const mounted = await mountProjectionEditor("**One** **Two**");

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**One**");

      setTextSelection(mounted.view, sourceStart + "**One*".length);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*One* **Two**\n");
    });

    it("commits malformed projected source as literal text", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(
        mounted.view,
        sourceStart + "**Bold*".length,
        sourceStart + "**Bold**".length,
      );
      typeText(mounted.view, "_");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bold*_ plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe("**Bold*_ plain");
    });
  });

  describe("native history", () => {
    it("preserves native undo after committing a marker deletion", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");
    });

    it.each([
      {
        commandId: "format.strong" as const,
        expectedMarkdown: "**Plain paragraph**\n",
        selector: "strong",
      },
      {
        commandId: "format.emphasis" as const,
        expectedMarkdown: "*Plain paragraph*\n",
        selector: "em",
      },
    ])(
      "preserves native undo after applying $commandId to a whole paragraph",
      async ({ commandId, expectedMarkdown, selector }) => {
        const mounted = await mountProjectionEditor("Plain paragraph");

        expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
        expect(runEditorCommand(mounted.editor, commandId)).toBe(true);

        const formatted = getEditorDomElement(mounted, selector);

        setSelectionAtElementTextEnd(mounted.view, formatted);

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(await runCommand(mounted, "edit.undo")).toBe(true);
        expect(mounted.getMarkdown()).toBe("Plain paragraph\n");
        expect(await runCommand(mounted, "edit.redo")).toBe(true);
        expect(mounted.getMarkdown()).toBe(expectedMarkdown);
        expect(mounted.view.dom.querySelector(selector)).toHaveTextContent("Plain paragraph");
      },
    );
  });

  describe("lifecycle integration", () => {
    it("tracks real source edits as dirty without counting projection entry or commit", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN, { onContentChanged });

      enterProjection(mounted, "strong");

      expect(onContentChanged).not.toHaveBeenCalled();

      typeText(mounted.view, "er");

      expect(onContentChanged).toHaveBeenCalledTimes(2);

      setSelectionAtDocumentEnd(mounted.view);

      expect(onContentChanged).toHaveBeenCalledTimes(2);
    });

    it("finalizes active projected source before Markdown serialization", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    });

    it("switches directly to another source projection when the selection moves", async () => {
      const mounted = await mountProjectionEditor("**Bold** and *soft*");

      enterProjection(mounted, "strong");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Bold and *soft*");
    });

    it("commits the current projection before switching to another source projection", async () => {
      const mounted = await mountProjectionEditor("**Bold** and *soft*");

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Bolder and *soft*");
      expect(mounted.getMarkdown()).toBe("**Bolder** and *soft*\n");
    });

    it("preserves text selections that cross out of an active projection", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");
      const plainEnd = getEditorTextPosition(mounted, "plain") + "plain".length;

      setTextSelection(mounted.view, sourceStart + 2, plainEnd);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.state.selection.empty).toBe(false);
      expect(getSelectedEditorText(mounted)).toBe("Bold plain");
    });

    it("does not emit transient projected source through markdown updates", async () => {
      const onMarkdownUpdated = vi.fn();
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN, { onMarkdownUpdated });

      vi.useFakeTimers();

      try {
        enterProjection(mounted, "strong");
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).not.toHaveBeenCalled();

        typeText(mounted.view, "er");
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).not.toHaveBeenCalled();

        setSelectionAtDocumentEnd(mounted.view);
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ markdown: "**Bolder** plain\n" }),
        );
        expect(onMarkdownUpdated).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("projection history", () => {
    it("uses projection-local undo and redo while projection is active", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
    });

    it("finalizes a clean active projection before running native undo and redo", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, "!");
      enterProjection(mounted, "strong");

      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);

      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}!\n`);
    });

    it("preserves native undo and redo after projection commit", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    });
  });
});
