// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { runEditorCommand } from "@/features/editor";
import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { createClipboardData, dispatchClick, dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";
import { countTauriApiCalls, mockTauriApi, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { findWikiHeadingFromState, getWikiHeadingsFromState } from "../utils/wikiHeadings";
import { parseWikiLink } from "../utils/wikiLinkMarkdown";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

describe("wiki links", () => {
  it.each([
    "[[target]]",
    "[[Wiki Link]]",
    "[[guides/setup]]",
    "[[../reference/api]]",
    "[[target.markdown|label]]",
    "[[target#Heading]]",
    "[[target#Heading|label]]",
    "[[#Heading]]",
    "[[#Heading|label]]",
  ])("reads and writes %s as an inline wiki link", async (source) => {
    const mounted = await mountEditor(`Before ${source} after`);
    expect(mounted.view.dom.querySelectorAll('[data-type="wiki-link"]')).toHaveLength(1);
    expect(mounted.getMarkdown()).toBe(`Before ${source} after\n`);
  });

  it.each([
    "![[image]]",
    "[[unfinished]",
    "[[target|]]",
    "[[#]]",
    "\\[[literal]]",
    "[[[target]]]",
    "[[target]]]",
    "[[target]]]\n\n[target]: guide.md",
  ])("keeps %s as ordinary Markdown", async (source) => {
    const mounted = await mountEditor(source);
    expect(mounted.view.dom.querySelector('[data-type="wiki-link"]')).toBeNull();
  });

  it("keeps wiki syntax distinct from reference links and images", async () => {
    const mounted = await mountEditor(
      "[[target]] [label][target] ![[target]]\n\n[target]: guide.md",
    );
    expect(mounted.view.dom.querySelectorAll('[data-type="wiki-link"]')).toHaveLength(1);
    expect(mounted.view.dom.querySelectorAll("a[href]")).toHaveLength(2);
    expect(mounted.getMarkdown()).toBe(
      "[[target]] [label][target] ![[target]]\n\n[target]: guide.md\n",
    );
  });

  it("turns typed complete source into a wiki link after the caret leaves", async () => {
    const mounted = await mountEditor("Start");
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [[guides/setup|Setup]]");
    setTextSelection(mounted.view, 1);
    expect(mounted.view.dom.querySelector('[data-type="wiki-link"]')?.textContent).toBe("Setup");
    expect(mounted.getMarkdown()).toBe("Start [[guides/setup|Setup]]\n");
  });

  it("preserves wiki source through native copy and rich paste", async () => {
    const source = "[[guides/setup#Intro|Setup]]";
    const copied = await mountEditor(source);
    const clipboard = createClipboardData();
    setTextSelection(copied.view, 1, copied.view.state.doc.content.size - 1);
    dispatchClipboardEvent(copied.view.dom, "copy", clipboard);

    const pasted = await mountEditor("");
    dispatchClipboardEvent(pasted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: clipboard.getData(TEXT_HTML_MIME_TYPE),
      [TEXT_PLAIN_MIME_TYPE]: clipboard.getData(TEXT_PLAIN_MIME_TYPE),
    });
    expect(pasted.getMarkdown()).toBe(`${source}\n`);
    expect(pasted.view.dom.querySelector('[data-type="wiki-link"]')).not.toBeNull();
  });

  it("turns a plain-text paste into a wiki link and restores it with undo and redo", async () => {
    const mounted = await mountEditor("Start");
    setSelectionAtDocumentEnd(mounted.view);
    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_PLAIN_MIME_TYPE]: "[[target|Target]]",
    });
    setTextSelection(mounted.view, 1);
    expect(mounted.view.dom.querySelector('[data-type="wiki-link"]')).not.toBeNull();
    expect(mounted.getMarkdown()).toBe("Start[[target|Target]]\n");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Start\n");
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Start[[target|Target]]\n");
  });

  it("parses target, heading and alias independently", () => {
    expect(parseWikiLink("[[../notes/page#Heading|Label]]")).toMatchObject({
      path: "../notes/page",
      heading: "Heading",
      alias: "Label",
      label: "Label",
    });
  });

  it("projects complete source and rehydrates a valid edit", async () => {
    const mounted = await mountEditor("[[target]] tail");
    const position = getEditorNodePosition(mounted, "wiki_link");
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
    );
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.doc.textContent).toContain("[[target]]");
    setTextSelection(mounted.view, position + 2);
    typeText(mounted.view, "new-");
    setTextSelection(mounted.view, mounted.view.state.doc.content.size - 2);
    expect(mounted.view.dom.querySelector('[data-type="wiki-link"]')?.textContent).toBe(
      "new-target",
    );
    expect(mounted.getMarkdown()).toBe("[[new-target]] tail\n");
  });

  it("keeps invalid edited syntax as literal source", async () => {
    const mounted = await mountEditor("[[target]] tail");
    const position = getEditorNodePosition(mounted, "wiki_link");
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
    );
    setTextSelection(mounted.view, position + 2);
    typeText(mounted.view, "|");
    setTextSelection(mounted.view, mounted.view.state.doc.content.size - 2);
    expect(mounted.view.dom.querySelector('[data-type="wiki-link"]')).toBeNull();
    expect(mounted.getMarkdown()).toContain("[[|target]]");
  });

  it("finds the first exact plain heading", async () => {
    const mounted = await mountEditor("# **Intro**\n\n# Intro\n\n# Other");
    const headings = getWikiHeadingsFromState(mounted.view.state);
    expect(headings.map((heading) => heading.text)).toEqual(["Intro", "Intro", "Other"]);
    expect(findWikiHeadingFromState(mounted.view.state, "Intro")?.position).toBe(
      headings[0].position,
    );
    expect(findWikiHeadingFromState(mounted.view.state, "intro")).toBeNull();
  });

  it("navigates a same-document fragment to the first matching heading", async () => {
    const mounted = await mountEditor("# Intro\n\n# Intro\n\n[[#Intro]]");
    const first = findWikiHeadingFromState(mounted.view.state, "Intro");
    dispatchClick(mounted.view.dom.querySelector('[data-type="wiki-link"]')!, { ctrl: true });
    await waitFor(() => expect(mounted.view.state.selection.from).toBe(first?.position));
  });

  it("uses active headings when a path names the current document", async () => {
    mockTauriApiCommand("resolveWikiLinkTarget", () => ({
      kind: "localMarkdown",
      path: "C:/Notes/current.md",
    }));
    const onReadMarkdownPath = vi.fn(async () => "# Stale heading\n");
    const mounted = await mountEditor("# Current heading\n\n[[current#Current heading]]", {
      documentPath: "C:/Notes/current.md",
      onReadMarkdownPath,
    });
    await waitFor(() =>
      expect(
        mounted.view.dom.querySelector('[data-type="wiki-link"]')?.getAttribute("data-wiki-status"),
      ).toBe("resolved"),
    );
    expect(onReadMarkdownPath).not.toHaveBeenCalled();
    dispatchClick(mounted.view.dom.querySelector('[data-type="wiki-link"]')!, { ctrl: true });
    await waitFor(() => expect(mounted.view.state.selection.from).toBe(1));
  });

  it("marks a missing document unresolved", async () => {
    mockTauriApiCommand("resolveWikiLinkTarget", () => ({
      kind: "missing",
      path: "C:/Notes/missing.md",
    }));
    const mounted = await mountEditor("[[missing]]", { documentPath: "C:/Notes/current.md" });
    await waitFor(() => {
      expect(
        mounted.view.dom.querySelector('[data-type="wiki-link"]')?.getAttribute("data-wiki-status"),
      ).toBe("unresolved");
    });
    expect(mounted.getMarkdown()).toBe("[[missing]]\n");
  });

  it("does not resolve unchanged targets again on every text edit", async () => {
    mockTauriApiCommand("resolveWikiLinkTarget", () => ({
      kind: "missing",
      path: "C:/Notes/target.md",
    }));
    const mounted = await mountEditor("[[target]]\n\nText", {
      documentPath: "C:/Notes/current.md",
    });
    await waitFor(() => expect(countTauriApiCalls("resolveWikiLinkTarget")).toBe(1));
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " more text");
    expect(countTauriApiCalls("resolveWikiLinkTarget")).toBe(1);
  });

  it("opens a resolved cross-document heading through Markdown navigation", async () => {
    mockTauriApi({
      resolveWikiLinkTarget: () => ({ kind: "localMarkdown", path: "C:/Notes/target.md" }),
      resolveMarkdownLinkTarget: () => ({ kind: "localMarkdown", path: "C:/Notes/target.md" }),
    });
    const onOpenMarkdownPath = vi.fn(async () => true);
    const mounted = await mountEditor("[[target#Intro|read it]]", {
      documentPath: "C:/Notes/current.md",
      folderContextPath: "C:/Notes",
      onReadMarkdownPath: async () => "# Intro\n",
      onOpenMarkdownPath,
    });
    await waitFor(() => {
      expect(
        mounted.view.dom.querySelector('[data-type="wiki-link"]')?.getAttribute("data-wiki-status"),
      ).toBe("resolved");
    });
    dispatchClick(mounted.view.dom.querySelector('[data-type="wiki-link"]')!, { ctrl: true });
    await waitFor(() =>
      expect(onOpenMarkdownPath).toHaveBeenCalledWith("C:/Notes/target.md", "Intro"),
    );
  });

  it("keeps a missing target heading unresolved", async () => {
    mockTauriApiCommand("resolveWikiLinkTarget", () => ({
      kind: "localMarkdown",
      path: "C:/Notes/target.md",
    }));
    const onReadMarkdownPath = vi.fn(async () => "# Present\n");
    const mounted = await mountEditor("[[target#Absent]]", {
      documentPath: "C:/Notes/current.md",
      onReadMarkdownPath,
    });
    await waitFor(() => expect(onReadMarkdownPath).toHaveBeenCalledWith("C:/Notes/target.md"));
    expect(
      mounted.view.dom.querySelector('[data-type="wiki-link"]')?.getAttribute("data-wiki-status"),
    ).toBe("unresolved");
    expect(mounted.getMarkdown()).toBe("[[target#Absent]]\n");
  });

  it("completes a file with a document-relative path", async () => {
    const mounted = await mountEditor("Start", {
      documentPath: "C:/Notes/guides/current.md",
      folderContextPath: "C:/Notes",
      wikiCompletionPaths: ["C:/Notes/reference/api.md", "C:/Notes/guides/setup.markdown"],
    });
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [[api");
    const suggestion = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(".leafdown-wiki-completion__option");
      expect(button?.textContent).toBe("../reference/api.md");
      return button!;
    });
    suggestion.click();
    expect(mounted.getMarkdown()).toBe("Start [[../reference/api.md]]\n");
  });

  it("completes after an earlier wiki link in the same paragraph", async () => {
    const mounted = await mountEditor("[[existing]] Start", {
      documentPath: "C:/Notes/current.md",
      folderContextPath: "C:/Notes",
      wikiCompletionPaths: ["C:/Notes/target.md"],
    });
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [[tar");
    const suggestion = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(".leafdown-wiki-completion__option");
      expect(button?.textContent).toBe("target.md");
      return button!;
    });
    suggestion.click();
    expect(mounted.getMarkdown()).toBe("[[existing]] Start [[target.md]]\n");
  });

  it("completes a heading in the current document", async () => {
    const mounted = await mountEditor("# Reading summary\n\nStart", {
      documentPath: "C:/Notes/current.md",
      folderContextPath: "C:/Notes",
    });
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [[#Reading");
    const suggestion = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(".leafdown-wiki-completion__option");
      expect(button?.textContent).toBe("Reading summary");
      return button!;
    });
    suggestion.click();
    expect(mounted.getMarkdown()).toBe("# Reading summary\n\nStart [[#Reading summary]]\n");
  });

  it("completes a heading from another resolved document", async () => {
    mockTauriApiCommand("resolveWikiLinkTarget", () => ({
      kind: "localMarkdown",
      path: "C:/Notes/target.md",
    }));
    const mounted = await mountEditor("Start", {
      documentPath: "C:/Notes/current.md",
      folderContextPath: "C:/Notes",
      onReadMarkdownPath: async () => "# Introduction\n",
    });
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [[target#Intro");
    const suggestion = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(".leafdown-wiki-completion__option");
      expect(button?.textContent).toBe("Introduction");
      return button!;
    });
    suggestion.click();
    expect(mounted.getMarkdown()).toBe("Start [[target#Introduction]]\n");
  });
});
