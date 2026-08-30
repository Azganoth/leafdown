// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { setTextSelection } from "@/test/utils/prosemirror";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  finalizeSourceProjection,
  leafdownSourceProjectionPluginKey,
} from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const corpusFiles = [
  "commonmark/blocks.md",
  "commonmark/emphasis.md",
  "commonmark/links-and-images.md",
  "commonmark/lists-and-blockquotes.md",
  "commonmark/text-and-breaks.md",
  "gfm/autolinks.md",
  "gfm/tables.md",
];

const readCorpusFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), "corpus", relativePath), "utf8");

// Escapable link and image runs contain "[", which reaches each candidate.
const findCandidatePositions = (mounted: MountedMilkdownEditor) => {
  const positions: number[] = [];

  mounted.view.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return true;
    }

    const text = node.text ?? "";

    for (let offset = text.indexOf("["); offset !== -1; offset = text.indexOf("[", offset + 1)) {
      positions.push(position + offset + 1);
    }

    return true;
  });

  return positions;
};

const collectEscapeProjections = (mounted: MountedMilkdownEditor) => {
  const pristine = mounted.view.state.doc.textContent;
  const sources: string[] = [];

  for (const position of findCandidatePositions(mounted)) {
    setTextSelection(mounted.view, position);

    const session = leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session;

    if (session?.target.adapterId === "escape") {
      sources.push(session.target.originalSource);
    }

    finalizeSourceProjection(mounted.view);

    // Each probe must restore the original document before the next one.
    expect(mounted.view.state.doc.textContent).toBe(pristine);
  }

  return sources;
};

describe("escaped source projection over the corpus", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it.each(corpusFiles)("projects what the file writes for %s", async (relativePath) => {
    const mounted = await mountEditor(readCorpusFile(relativePath));
    const markdown = mounted.getMarkdown();

    for (const source of collectEscapeProjections(mounted)) {
      expect(markdown).toContain(source);
    }
  });

  it("finds escaped runs to compare", async () => {
    const mounted = await mountEditor(readCorpusFile("commonmark/links-and-images.md"));

    expect(collectEscapeProjections(mounted).length).toBeGreaterThan(0);
  });
});
