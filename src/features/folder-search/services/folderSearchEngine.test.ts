import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileError } from "@/features/document";
import {
  findSearchableTextMatches,
  type DocumentReplacementPlan,
  type MarkdownSearchTextParser,
  type TextSearchQuery,
} from "@/features/editor";

import type { FolderSearchFileOutcome, ReadFolderSearchFilesArgs } from "./folderSearchApi";
import {
  FOLDER_SEARCH_MATCH_LIMIT,
  FolderSearchEngine,
  type FolderSearchActiveDocument,
  type FolderSearchResults,
} from "./folderSearchEngine";

vi.mock("@/features/editor", async () => {
  const textSearch = await import("@/features/editor/utils/textSearch");

  return {
    createMarkdownSearchTextParser: () => Promise.reject(new Error("Use the fake parser.")),
    findSearchableTextMatches: textSearch.findSearchableTextMatches,
    getSearchMatchContext: textSearch.getSearchMatchContext,
    SEARCH_MATCH_CONTEXT_RADIUS: textSearch.SEARCH_MATCH_CONTEXT_RADIUS,
  };
});

const SEPARATOR = "\u0000";
const FOLDER = "C:/notes";

type DiskEntry = { content: string; modified: number } | { error: OpenMarkdownFileError["kind"] };

const query = (text: string, options: Partial<Omit<TextSearchQuery, "text">> = {}) => ({
  caseSensitive: false,
  wholeWord: false,
  ...options,
  text,
});

// Each line is a run of its own, as a paragraph's text would be.
const toText = (markdown: string) => markdown.split("\n").filter(Boolean).join(SEPARATOR);

// A replacement holding `!` is one the document refuses, as a footnote label can.
const planText = (
  text: string,
  baseline: string,
  search: TextSearchQuery,
  replacement: string,
): DocumentReplacementPlan => {
  const matches = findSearchableTextMatches(text, search);
  let replaced = "";
  let offset = 0;

  for (const { end, start } of matches) {
    replaced += text.slice(offset, start) + replacement;
    offset = end;
  }

  return {
    text,
    matches,
    baseline,
    replaced:
      replacement.includes("!") && matches.length > 0
        ? null
        : matches.length > 0
          ? (replaced + text.slice(offset)).split(SEPARATOR).join("\n")
          : baseline,
  };
};

const createParser = () => {
  const parser: MarkdownSearchTextParser & { reads: number; disposed: boolean } = {
    reads: 0,
    disposed: false,
    read: (markdown) => {
      parser.reads += 1;
      return toText(markdown);
    },
    planReplacement: (markdown, search, replacement) => {
      parser.reads += 1;
      return planText(
        toText(markdown),
        toText(markdown).split(SEPARATOR).join("\n"),
        search,
        replacement,
      );
    },
    normalize: (markdown) => toText(markdown).split(SEPARATOR).join("\n"),
    dispose: () => {
      parser.disposed = true;
    },
  };

  return parser;
};

const createDisk = (files: Record<string, string>) => {
  const disk = new Map<string, DiskEntry>(
    Object.entries(files).map(([name, content]) => [`${FOLDER}/${name}`, { content, modified: 1 }]),
  );
  const requests: ReadFolderSearchFilesArgs[] = [];
  let pause: Promise<void> | null = null;

  const readFiles = vi.fn(async (args: ReadFolderSearchFilesArgs) => {
    requests.push(args);
    await pause;

    return args.files.slice(0, 16).map(({ knownMetadata, path }): FolderSearchFileOutcome => {
      const entry = disk.get(path);

      if (!entry) {
        return { kind: "skipped", path, error: { kind: "missingFile", path } };
      }

      if ("error" in entry) {
        return {
          kind: "skipped",
          path,
          error: { kind: entry.error, path } as OpenMarkdownFileError,
        };
      }

      const metadata = { sizeBytes: entry.content.length, modifiedAtUnixMs: entry.modified };

      if (
        knownMetadata?.sizeBytes === metadata.sizeBytes &&
        knownMetadata.modifiedAtUnixMs === metadata.modifiedAtUnixMs
      ) {
        return { kind: "unchanged", path };
      }

      return {
        kind: "read",
        path,
        content: entry.content,
        lineEnding: null,
        encoding: { name: "UTF-8", bom: false },
        metadata,
        fingerprint: entry.content,
      };
    });
  });

  return {
    disk,
    readFiles,
    requests,
    paths: () => [...disk.keys()],
    write: (name: string, content: string) => {
      const path = `${FOLDER}/${name}`;
      const previous = disk.get(path);

      disk.set(path, {
        content,
        modified: previous && "modified" in previous ? previous.modified + 1 : 1,
      });
    },
    hold: () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      pause = promise;

      return () => {
        pause = null;
        resolve();
      };
    },
  };
};

const createEngine = (
  disk: ReturnType<typeof createDisk>,
  activeDocument: () => FolderSearchActiveDocument | null = () => null,
) => {
  const parser = createParser();
  const published: (FolderSearchResults | null)[] = [];
  const engine = new FolderSearchEngine(
    {
      createParser: async () => parser,
      getActiveDocument: activeDocument,
      readFiles: disk.readFiles,
    },
    (results) => published.push(results),
  );

  engines.push(engine);

  const latest = () => published.at(-1) ?? null;
  // Results published after `since` that no run is still adding to. A full-size folder can take
  // longer than the default wait while the rest of the suite shares the machine.
  const settled = (since = 0) =>
    vi.waitFor(
      () => {
        const results = latest();

        expect(published.length).toBeGreaterThan(since);
        expect(results).not.toBeNull();
        expect(results?.status).not.toBe("searching");

        return results as FolderSearchResults;
      },
      { timeout: 10_000 },
    );
  const search = (text: string, options: Partial<Omit<TextSearchQuery, "text">> = {}) => {
    const since = published.length;

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query(text, options),
      replacement: null,
      finalizeProjection: true,
    });

    return settled(since);
  };
  const replace = (
    text: string,
    replacement: string,
    options: Partial<Omit<TextSearchQuery, "text">> = {},
  ) => {
    const since = published.length;

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query(text, options),
      replacement: {
        text: replacement,
        save: { defaultLineEnding: "lf", insertFinalNewline: true },
      },
      finalizeProjection: true,
    });

    return settled(since);
  };

  return { engine, latest, parser, published, replace, search, settled };
};

const engines: FolderSearchEngine[] = [];

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
});

const summarize = (results: FolderSearchResults) =>
  results.files.map(({ matches, path }) => [
    path.slice(FOLDER.length + 1),
    matches.map(({ context }) => `${context.before}[${context.match}]${context.after}`),
  ]);

const createActiveDocument = (path: string, text: string) => {
  const document = {
    path,
    text,
    finalized: 0,
    readMatches: (
      search: TextSearchQuery,
      { finalizeProjection }: { finalizeProjection: boolean },
    ) => {
      if (finalizeProjection) {
        document.finalized += 1;
      }

      return {
        text: document.text,
        matches: findSearchableTextMatches(document.text, search),
      };
    },
    planReplacement: (search: TextSearchQuery, replacement: string) =>
      planText(document.text, document.text, search, replacement),
  };

  return document;
};

describe("folder search engine", () => {
  it("groups matches by file in article order with their context", async () => {
    const disk = createDisk({
      "b.md": "nothing here",
      "a.md": "One leaf\nTwo LEAF and leaf",
      "c.md": "leaflet",
    });
    const { search } = createEngine(disk);

    const results = await search("leaf");

    expect(results.status).toBe("completed");
    expect(results.matchCount).toBe(4);
    expect(results.articleCount).toBe(3);
    expect(results.searchedFileCount).toBe(3);
    expect(summarize(results)).toEqual([
      ["a.md", ["One [leaf]", "Two [LEAF] and leaf", "Two LEAF and [leaf]"]],
      ["c.md", ["[leaf]let"]],
    ]);
    expect(results.files[0].matches.map(({ ordinal }) => ordinal)).toEqual([0, 1, 2]);
  });

  it("applies match case and whole word", async () => {
    const disk = createDisk({ "a.md": "leaf Leaf leaflet" });
    const { search } = createEngine(disk);

    expect((await search("leaf", { caseSensitive: true })).matchCount).toBe(2);
    expect((await search("leaf", { wholeWord: true })).matchCount).toBe(2);
  });

  it("names the files it skipped and searches the rest", async () => {
    const disk = createDisk({ "a.md": "leaf", "c.md": "leaf" });

    disk.disk.set(`${FOLDER}/b.md`, { error: "invalidEncoding" });
    disk.disk.set(`${FOLDER}/d.md`, { error: "oversizedFile" });

    const results = await createEngine(disk).search("leaf");

    expect(results.status).toBe("completed");
    expect(results.matchCount).toBe(2);
    expect(results.skipped).toEqual([
      { path: `${FOLDER}/b.md`, reason: "invalidEncoding" },
      { path: `${FOLDER}/d.md`, reason: "oversizedFile" },
    ]);
  });

  it("reads no file for an empty query", async () => {
    const disk = createDisk({ "a.md": "leaf" });
    const { engine, latest } = createEngine(disk);

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query(""),
      replacement: null,
      finalizeProjection: true,
    });

    expect(latest()).toBeNull();
    expect(disk.readFiles).not.toHaveBeenCalled();
  });

  it("parses a file once while it keeps its metadata", async () => {
    const disk = createDisk({ "a.md": "leaf", "b.md": "branch" });
    const { parser, search } = createEngine(disk);

    await search("leaf");
    await search("branch");

    expect(parser.reads).toBe(2);
    expect(disk.requests.at(-1)?.files.every(({ knownMetadata }) => knownMetadata !== null)).toBe(
      true,
    );

    disk.write("a.md", "branch and leaf");

    expect(summarize(await search("branch"))).toEqual([
      ["a.md", ["[branch] and leaf"]],
      ["b.md", ["[branch]"]],
    ]);
    expect(parser.reads).toBe(3);
  });

  it("searches the active document as the editor holds it, not as its file does", async () => {
    const disk = createDisk({ "a.md": "leaf on disk", "b.md": "leaf" });
    const active = createActiveDocument(`${FOLDER}/a.md`, "unsaved leaf, leaf");

    disk.disk.delete(`${FOLDER}/a.md`);

    const { search } = createEngine(
      { ...disk, paths: () => [`${FOLDER}/a.md`, `${FOLDER}/b.md`] },
      () => active,
    );
    const results = await search("leaf");

    expect(summarize(results)).toEqual([
      ["a.md", ["unsaved [leaf], leaf", "unsaved leaf, [leaf]"]],
      ["b.md", ["[leaf]"]],
    ]);
    expect(results.files[0].version).toEqual({ source: "editor" });
    expect(results.skipped).toEqual([]);
    expect(active.finalized).toBe(1);
  });

  it("refreshes the active document's results after an edit without reading its file", async () => {
    const disk = createDisk({ "a.md": "leaf", "b.md": "leaf" });
    const active = createActiveDocument(`${FOLDER}/a.md`, "leaf");
    const { engine, search, settled } = createEngine(disk, () => active);

    await search("leaf");
    const reads = disk.readFiles.mock.calls.length;

    active.text = "leaf and more leaf";
    engine.refreshFile(`${FOLDER}/a.md`);

    await vi.waitFor(async () => expect((await settled()).matchCount).toBe(3));
    expect(disk.readFiles).toHaveBeenCalledTimes(reads);
    expect(active.finalized).toBe(1);
  });

  it("never lets an older read replace a newer one", async () => {
    const disk = createDisk({ "a.md": "leaf" });
    let active: FolderSearchActiveDocument | null = null;
    const { engine, search, settled } = createEngine(disk, () => active);

    await search("leaf");

    const release = disk.hold();

    engine.refreshFile(`${FOLDER}/a.md`);
    active = createActiveDocument(`${FOLDER}/a.md`, "leaf leaf leaf");
    engine.refreshFile(`${FOLDER}/a.md`);
    release();

    await vi.waitFor(() => expect(disk.readFiles).toHaveBeenCalledTimes(2));
    await pause(150);

    expect((await settled()).matchCount).toBe(3);
  });

  it("leaves a cancelled search's partial results marked as cancelled", async () => {
    const disk = createDisk(
      Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`${index}.md`, "leaf"])),
    );
    const { engine, latest, published } = createEngine(disk);
    const release = disk.hold();

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query("leaf"),
      replacement: null,
      finalizeProjection: true,
    });
    await vi.waitFor(() => expect(disk.readFiles).toHaveBeenCalledTimes(1));
    engine.cancel();
    release();
    await pause(150);

    expect(latest()).toMatchObject({ status: "cancelled", matchCount: 0, searchedFileCount: 0 });
    expect(published.filter((results) => results?.status === "cancelled")).toHaveLength(1);
  });

  it("discards what an older query's reads return", async () => {
    const disk = createDisk({ "a.md": "leaf", "b.md": "branch" });
    const { engine, settled } = createEngine(disk);
    const release = disk.hold();

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query("leaf"),
      replacement: null,
      finalizeProjection: true,
    });
    await vi.waitFor(() => expect(disk.readFiles).toHaveBeenCalledTimes(1));
    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query("branch"),
      replacement: null,
      finalizeProjection: true,
    });
    release();

    const results = await settled();

    expect(results.query.text).toBe("branch");
    expect(summarize(results)).toEqual([["b.md", ["[branch]"]]]);
  });

  it("refreshes a search in place when the folder's articles change", async () => {
    const disk = createDisk({ "a.md": "leaf", "b.md": "leaf" });
    const { engine, latest, published, search, settled } = createEngine(disk);
    const first = await search("leaf");

    disk.disk.delete(`${FOLDER}/b.md`);
    disk.write("c.md", "leaf");
    const release = disk.hold();

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query("leaf"),
      replacement: null,
      finalizeProjection: false,
    });
    await pause(150);

    expect(latest()).toMatchObject({ id: first.id, status: "searching" });
    expect(summarize(latest() as FolderSearchResults)).toEqual([["a.md", ["[leaf]"]]]);

    release();

    const refreshed = await settled();

    expect(refreshed.id).toBe(first.id);
    expect(summarize(refreshed)).toEqual([
      ["a.md", ["[leaf]"]],
      ["c.md", ["[leaf]"]],
    ]);
    expect(published.some((results) => results?.files.length === 0)).toBe(false);
  });

  it("stops at the match limit and searches further on request", async () => {
    const dense = Array.from({ length: 1_000 }, () => "e e e e e e e e e e").join("\n");
    const disk = createDisk(
      Object.fromEntries(Array.from({ length: 3 }, (_, index) => [`${index}.md`, dense])),
    );
    const { engine, search, settled } = createEngine(disk);

    const limited = await search("e");

    expect(limited.status).toBe("limited");
    expect(limited.matchCount).toBe(FOLDER_SEARCH_MATCH_LIMIT);
    expect(limited.files).toHaveLength(1);
    expect(limited.files[0].clipped).toBe(false);

    engine.searchFurther();

    await vi.waitFor(async () => expect((await settled()).matchCount).toBe(20_000));
    expect((await settled()).status).toBe("limited");

    engine.searchFurther();

    const completed = await vi.waitFor(async () => {
      const results = await settled();
      expect(results.status).toBe("completed");
      return results;
    });

    expect(completed.matchCount).toBe(30_000);
  });

  it("clips a file holding more matches than the limit and finishes it on request", async () => {
    const disk = createDisk({
      "a.md": Array.from({ length: 1_500 }, () => "e e e e e e e e e e").join("\n"),
      "b.md": "e",
    });
    const { engine, search, settled } = createEngine(disk);

    const limited = await search("e");

    expect(limited).toMatchObject({ status: "limited", matchCount: FOLDER_SEARCH_MATCH_LIMIT });
    expect(limited.files.map(({ clipped }) => clipped)).toEqual([true]);

    engine.searchFurther();

    const completed = await vi.waitFor(async () => {
      const results = await settled();
      expect(results.status).toBe("completed");
      return results;
    });

    expect(completed.matchCount).toBe(15_001);
    expect(completed.files.map(({ clipped }) => clipped)).toEqual([false, false]);
  });

  it("searches the supported folder size in bounded reads, publishing progress", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [
        `${String(index).padStart(5, "0")}.md`,
        index % 1_000 === 0 ? "a needle here" : "nothing to find",
      ]),
    );
    const disk = createDisk(files);
    let inFlight = 0;
    let mostInFlight = 0;
    const readFiles = disk.readFiles;

    disk.readFiles = vi.fn(async (args: ReadFolderSearchFilesArgs) => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);

      try {
        return await readFiles(args);
      } finally {
        inFlight -= 1;
      }
    });

    const { search } = createEngine(disk);
    const results = await search("needle");

    expect(results).toMatchObject({
      status: "completed",
      matchCount: 10,
      searchedFileCount: 10_000,
    });
    expect(mostInFlight).toBeLessThanOrEqual(2);
    expect(
      Math.max(...disk.requests.map(({ files: requested }) => requested.length)),
    ).toBeLessThanOrEqual(64);
  });

  it("publishes what it has found while it waits for more files", async () => {
    const disk = createDisk(
      Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`${index}.md`, "leaf"])),
    );
    const readFiles = disk.readFiles;
    let release = () => {};

    disk.readFiles = vi.fn(async (args: ReadFolderSearchFilesArgs) => {
      if (disk.readFiles.mock.calls.length === 2) {
        release = disk.hold();
      }

      return readFiles(args);
    });

    const { engine, latest, settled } = createEngine(disk);

    engine.start({
      folderPath: FOLDER,
      articlePaths: disk.paths(),
      query: query("leaf"),
      replacement: null,
      finalizeProjection: true,
    });

    await vi.waitFor(() =>
      expect(latest()).toMatchObject({
        status: "searching",
        searchedFileCount: 16,
        matchCount: 16,
      }),
    );

    release();

    expect(await settled()).toMatchObject({ status: "completed", matchCount: 40 });
  });

  describe("planning a replacement", () => {
    it("plans each file's text against the version it read", async () => {
      const disk = createDisk({
        "a.md": "One leaf\nkeep\n",
        "b.md": "none",
        "c.md": "leaf leaf\n",
      });
      const { replace } = createEngine(disk);

      const results = await replace("leaf", "tree");

      expect(results).toMatchObject({ status: "completed", replacement: "tree", matchCount: 3 });
      expect(
        results.files.map(({ path, replacement, version }) => ({ path, replacement, version })),
      ).toEqual([
        {
          path: `${FOLDER}/a.md`,
          replacement: {
            source: "disk",
            content: "One tree\nkeep\n",
            encoding: { name: "UTF-8", bom: false },
            rewritesOtherText: false,
          },
          version: {
            source: "disk",
            metadata: { sizeBytes: 14, modifiedAtUnixMs: 1 },
            fingerprint: "One leaf\nkeep\n",
          },
        },
        {
          path: `${FOLDER}/c.md`,
          replacement: {
            source: "disk",
            content: "tree tree\n",
            encoding: { name: "UTF-8", bom: false },
            rewritesOtherText: false,
          },
          version: {
            source: "disk",
            metadata: { sizeBytes: 10, modifiedAtUnixMs: 1 },
            fingerprint: "leaf leaf\n",
          },
        },
      ]);
    });

    it("keeps the lines a save would rewrite, or marks a file it must write whole", async () => {
      const disk = createDisk({
        "kept.md": "\n\nleaf\n",
        "whole.md": "leaf\n\nleaf\n",
      });
      const { replace } = createEngine(disk);

      const [kept, whole] = (await replace("leaf", "tree")).files;

      expect(kept.replacement).toMatchObject({ content: "\n\ntree\n", rewritesOtherText: false });
      expect(whole.replacement).toMatchObject({ content: "tree\ntree\n", rewritesOtherText: true });
    });

    it("plans every match rather than stopping at the search limit", async () => {
      const dense = Array.from({ length: 1_000 }, () => "e e e e e e e e e e").join("\n");
      const disk = createDisk(
        Object.fromEntries(Array.from({ length: 2 }, (_, index) => [`${index}.md`, dense])),
      );
      const { replace } = createEngine(disk);

      const results = await replace("e", "f");

      expect(results.status).toBe("completed");
      expect(results.matchCount).toBe(2 * FOLDER_SEARCH_MATCH_LIMIT);
      expect(results.files.every(({ clipped }) => !clipped)).toBe(true);
    });

    it("reads again only the files whose kept text has matches", async () => {
      const disk = createDisk({ "a.md": "leaf", "b.md": "branch" });
      const { replace, search } = createEngine(disk);

      await search("leaf");
      disk.requests.length = 0;
      await replace("leaf", "tree");

      expect(disk.requests.flatMap(({ files }) => files)).toEqual([
        { path: `${FOLDER}/a.md`, knownMetadata: null },
        { path: `${FOLDER}/b.md`, knownMetadata: { sizeBytes: 6, modifiedAtUnixMs: 1 } },
      ]);
    });

    it("skips a file that would not read as its matches replaced", async () => {
      const disk = createDisk({ "a.md": "leaf", "b.md": "branch" });
      const { replace } = createEngine(disk);

      const results = await replace("leaf", "tree!");

      expect(results.files).toEqual([]);
      expect(results.skipped).toEqual([{ path: `${FOLDER}/a.md`, reason: "replacementRefused" }]);
    });

    it("leaves out a file the replacement would not change", async () => {
      const disk = createDisk({ "a.md": "leaf", "b.md": "Leaf" });
      const { replace } = createEngine(disk);

      const results = await replace("leaf", "leaf");

      expect(results.files.map(({ path }) => path)).toEqual([`${FOLDER}/b.md`]);
    });

    it("plans the active document from its editor", async () => {
      const disk = createDisk({ "a.md": "leaf on disk", "b.md": "leaf" });
      const active = createActiveDocument(`${FOLDER}/a.md`, "unsaved leaf");
      const { replace } = createEngine(disk, () => active);

      const [file] = (await replace("leaf", "tree")).files;

      expect(file).toMatchObject({
        path: `${FOLDER}/a.md`,
        version: { source: "editor" },
        replacement: { source: "editor", baseline: "unsaved leaf" },
      });
      expect(file.matches).toHaveLength(1);
    });

    it("plans the supported folder size in bounded reads, every match included", async () => {
      const files = Object.fromEntries(
        Array.from({ length: 10_000 }, (_, index) => [
          `${String(index).padStart(5, "0")}.md`,
          index % 10 === 0 ? "a needle here\n" : "nothing to find\n",
        ]),
      );
      const disk = createDisk(files);
      const { replace } = createEngine(disk);

      const results = await replace("needle", "pin");

      expect(results).toMatchObject({
        status: "completed",
        matchCount: 1_000,
        searchedFileCount: 10_000,
      });
      expect(results.files.every(({ replacement }) => replacement?.source === "disk")).toBe(true);
      expect(
        Math.max(...disk.requests.map(({ files: requested }) => requested.length)),
      ).toBeLessThanOrEqual(64);
    });

    it("withdraws a complete plan the moment it is made again in place", async () => {
      const disk = createDisk({ "a.md": "leaf" });
      const { engine, latest, replace } = createEngine(disk);

      const planned = await replace("leaf", "tree");

      disk.write("a.md", "leaf leaf");
      engine.start({
        folderPath: FOLDER,
        articlePaths: disk.paths(),
        query: query("leaf"),
        replacement: {
          text: "tree",
          save: { defaultLineEnding: "lf", insertFinalNewline: true },
        },
        finalizeProjection: false,
      });

      expect(latest()).toMatchObject({ id: planned.id, status: "searching" });
    });

    it("starts afresh when the replacement changes", async () => {
      const disk = createDisk({ "a.md": "leaf" });
      const { replace } = createEngine(disk);

      const first = await replace("leaf", "tree");
      const second = await replace("leaf", "bush");

      expect(second.id).not.toBe(first.id);
      expect(second.files[0].replacement).toMatchObject({ content: "bush" });
    });
  });

  it("disposes the parser it created", async () => {
    const disk = createDisk({ "a.md": "leaf" });
    const { engine, parser, search } = createEngine(disk);

    await search("leaf");
    engine.dispose();

    expect(parser.disposed).toBe(true);
  });
});
