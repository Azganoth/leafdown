import { fireEvent, waitFor } from "@testing-library/react";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { Mark } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { setSelectionAtTextEnd, typeText } from "@/test/utils/prosemirror";

interface TextRange {
  from: number;
  to: number;
}

interface MarkRange extends TextRange {
  mark: Mark;
}

interface ProjectionRange extends TextRange {
  source: string;
}

type ProjectionParseResult =
  | { kind: "invalid"; text: string }
  | { kind: "mark"; marker: "*" | "_"; text: string };

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  onContentTransaction = vi.fn(),
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    onContentTransaction,
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

const findFirstMarkRange = (state: EditorState, markName: "emphasis" | "strong") => {
  const ranges: MarkRange[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const mark = node.marks.find((candidateMark) => candidateMark.type.name === markName);

    if (!mark) {
      return true;
    }

    ranges.push({
      from: pos,
      mark,
      to: pos + node.nodeSize,
    });

    return false;
  });

  const range = ranges[0];

  if (!range) {
    throw new Error(`Could not find ${markName} range.`);
  }

  return range;
};

const enterStrongProjection = (view: EditorView): ProjectionRange => {
  const range = findFirstMarkRange(view.state, "strong");
  const text = view.state.doc.textBetween(range.from, range.to, "\n", "\n");
  const source = `${range.mark.attrs.marker}${range.mark.attrs.marker}${text}${range.mark.attrs.marker}${range.mark.attrs.marker}`;
  const transaction = view.state.tr.replaceWith(
    range.from,
    range.to,
    view.state.schema.text(source),
  );

  transaction
    .setSelection(TextSelection.create(transaction.doc, range.from + source.length - 2))
    .setMeta("addToHistory", false);

  view.dispatch(transaction);

  return {
    from: range.from,
    source,
    to: range.from + source.length,
  };
};

const commitStrongProjection = (view: EditorView, range: ProjectionRange) => {
  const source = view.state.doc.textBetween(range.from, range.to, "\n", "\n");
  const parsed = parseStrongSource(source);
  const replacement =
    parsed.kind === "mark"
      ? view.state.schema.text(parsed.text, [
          view.state.schema.marks.strong.create({ marker: parsed.marker }),
        ])
      : view.state.schema.text(parsed.text);
  const transaction = view.state.tr.replaceWith(range.from, range.to, replacement);

  transaction
    .setSelection(TextSelection.create(transaction.doc, range.from + replacement.nodeSize))
    .setMeta("addToHistory", false);

  view.dispatch(transaction);
};

const parseStrongSource = (source: string): ProjectionParseResult => {
  const match = /^(?<marker>\*\*|__)(?<text>.+)\k<marker>$/u.exec(source);

  if (!match?.groups) {
    return { kind: "invalid", text: source };
  }

  return {
    kind: "mark",
    marker: match.groups.marker.startsWith("*") ? "*" : "_",
    text: match.groups.text,
  };
};

const collectTextNodes = (node: Node): Text[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    return [node as Text];
  }

  return Array.from(node.childNodes).flatMap((childNode) => collectTextNodes(childNode));
};

describe("inline source projection spike probes", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("documents that current source widgets are detached from document text flow", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const strong = mounted.view.dom.querySelector("strong");

    expect(strong).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, strong as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Inline Markdown']",
    );

    expect(input).toHaveValue("**Bold**");
    expect(mounted.view.state.doc.textContent).toBe("Bold plain");

    input?.focus();
    input?.setSelectionRange(0, 1);

    expect(mounted.view.state.selection.from).not.toBe(mounted.view.posAtDOM(input!, 0));
  });

  it("proves editable projected markers can be modeled as real document text", async () => {
    const onContentTransaction = vi.fn();
    const mounted = await mountEditor("**Bold** plain", onContentTransaction);
    const projection = enterStrongProjection(mounted.view);

    expect(onContentTransaction).not.toHaveBeenCalled();
    expect(mounted.view.state.doc.textContent).toBe("**Bold** plain");

    typeText(mounted.view, "er");

    expect(onContentTransaction).toHaveBeenCalledTimes(2);
    expect(mounted.view.state.doc.textContent).toBe("**Bolder** plain");

    commitStrongProjection(mounted.view, {
      ...projection,
      to: projection.to + 2,
    });

    expect(onContentTransaction).toHaveBeenCalledTimes(2);
    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
  });

  it("keeps partially deleted markers as literal fallback text on commit", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const projection = enterStrongProjection(mounted.view);

    mounted.view.dispatch(mounted.view.state.tr.delete(projection.from, projection.from + 1));
    commitStrongProjection(mounted.view, {
      ...projection,
      to: projection.to - 1,
    });

    expect(mounted.view.state.doc.textContent).toBe("*Bold** plain");
    expect(mounted.getMarkdown()).toBe("\\*Bold\\*\\* plain\n");
  });

  it("shows naive non-history projection commit does not preserve redo", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const projection = enterStrongProjection(mounted.view);

    typeText(mounted.view, "er");
    commitStrongProjection(mounted.view, {
      ...projection,
      to: projection.to + 2,
    });

    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    expect(undo(mounted.view.state, mounted.view.dispatch, mounted.view)).toBe(true);

    await waitFor(() => {
      expect(mounted.view.state.doc.textContent).toContain("Bold");
    });

    expect(redo(mounted.view.state, mounted.view.dispatch, mounted.view)).toBe(false);
  });

  it("shows widget source editing is a separate input history rather than editor history", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const strong = mounted.view.dom.querySelector("strong");

    setSelectionAtTextEnd(mounted.view, strong as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Inline Markdown']",
    );

    fireEvent.input(input as HTMLInputElement, { target: { value: "**Bolder**" } });

    expect(mounted.getMarkdown()).toBe("**Bold** plain\n");
    expect(collectTextNodes(input as HTMLInputElement).map((node) => node.textContent)).toEqual([]);

    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    });
  });
});
