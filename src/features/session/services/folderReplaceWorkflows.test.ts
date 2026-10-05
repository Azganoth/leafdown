// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MarkdownFileState } from "@/features/document";
import {
  findSearchableTextMatches,
  type DocumentReplacementPlan,
  type TextSearchQuery,
} from "@/features/editor";
import type { FolderContextState } from "@/features/folder-context";
import type {
  FolderReplacementArgs,
  FolderReplacementOutcome,
  FolderSearchFileOutcome,
} from "@/features/folder-search/services/folderSearchApi";
import { useFolderSearchStore } from "@/features/folder-search/stores/folderSearch";
import { requestDecision, type Decision } from "@/lib/confirmation";
import type { Disposable } from "@/lib/lifecycle";
import { createOpenedMarkdownDocument, createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createArticleTree, createFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { applyFolderReplacement } from "./folderReplaceWorkflows";
import { openFolderSearch, startFolderSearchSession } from "./folderSearchWorkflows";

vi.mock("@/lib/confirmation", () => ({
  requestConfirmation: vi.fn(async () => false),
  requestDecision: vi.fn(async (): Promise<Decision> => "cancel"),
}));

const FOLDER = "C:/Notes";
const ALPHA = `${FOLDER}/alpha.md`;
const BETA = `${FOLDER}/docs/beta.md`;

let disk: Map<string, string | null>;
let modified: Map<string, number>;
let session: Disposable | null = null;
let writeOrder: string[];
let beforeWrite: (args: FolderReplacementArgs) => void;
let failWrite: (path: string) => FolderReplacementOutcome | null;
let preflightFailure: Error | null;
let saveFailure: ((path: string) => unknown) | null;

const createFolder = (paths = [ALPHA, BETA]): FolderContextState =>
  createFolderContext({
    path: FOLDER,
    tree: createArticleTree({
      name: "Notes",
      path: FOLDER,
      children: paths.map((path) => ({
        kind: "file" as const,
        name: path.split("/").at(-1) ?? path,
        path,
      })),
    }),
  });

const metadataOf = (path: string) => ({
  sizeBytes: disk.get(path)?.length ?? 0,
  modifiedAtUnixMs: modified.get(path) ?? 1,
});

const writeDisk = (path: string, content: string | null) => {
  disk.set(path, content);
  modified.set(path, (modified.get(path) ?? 1) + 1);
};

const readOutcome = (path: string): FolderSearchFileOutcome => {
  const content = disk.get(path);

  if (content === undefined || content === null) {
    return { kind: "skipped", path, error: { kind: "missingFile", path } };
  }

  return {
    kind: "read",
    path,
    content,
    lineEnding: "lf",
    encoding: { name: "UTF-8", bom: false },
    metadata: metadataOf(path),
    fingerprint: content,
  };
};

const checkVersion = ({
  expectedFingerprint,
  path,
}: FolderReplacementArgs["files"][number]): FolderReplacementOutcome | null => {
  const content = disk.get(path);

  if (content === undefined || content === null) {
    return { kind: "stale", path, missing: true };
  }

  return content === expectedFingerprint ? null : { kind: "stale", path, missing: false };
};

const plan = async (query: string, replacement: string) => {
  openFolderSearch("replace");
  useFolderSearchStore.getState().setQuery(query);
  useFolderSearchStore.getState().setReplacement(replacement);

  return waitForPlan(replacement);
};

const waitForPlan = (replacement: string) =>
  vi.waitFor(
    () => {
      const { results } = useFolderSearchStore.getState();

      expect(results?.replacement).toBe(replacement);
      expect(results?.status).toBe("completed");

      return results!;
    },
    { timeout: 10_000 },
  );

const getReport = () => {
  const { apply } = useFolderSearchStore.getState();

  if (apply.status !== "done") {
    throw new Error(`The replacement is ${apply.status}.`);
  }

  return apply.report;
};

// The editor's text is its document as a save would write it, a paragraph per line.
const createActiveEditor = (markdown: string) => {
  const editor = { markdown, applied: [] as string[] };
  const planFor = (query: TextSearchQuery, replacement: string): DocumentReplacementPlan => {
    const text = editor.markdown.trimEnd().split("\n").join("\u0000");
    const matches = findSearchableTextMatches(text, query);
    let replaced = "";
    let offset = 0;

    for (const { end, start } of matches) {
      replaced += text.slice(offset, start) + replacement;
      offset = end;
    }

    return {
      text,
      matches,
      baseline: editor.markdown,
      replaced: `${(replaced + text.slice(offset)).split("\u0000").join("\n")}\n`,
    };
  };
  const bridge = createMilkdownEditorBridge({
    getMarkdown: () => editor.markdown,
    readSearchMatches: (query) => {
      const { matches, text } = planFor(query, "");

      return { text, matches };
    },
    planSearchReplacement: planFor,
    applySearchReplacement: (query, replacement, baseline) => {
      if (baseline !== editor.markdown) {
        return null;
      }

      const next = planFor(query, replacement);

      editor.applied.push(replacement);
      editor.markdown = next.replaced ?? editor.markdown;
      useSessionStore.getState().markActiveDocumentDirty(ALPHA);

      return next.matches.length;
    },
  });

  return { bridge, editor };
};

const openActiveDocument = (markdown: string, isDirty: boolean) => {
  const { bridge, editor } = createActiveEditor(markdown);

  setDefaultSession({
    folderContext: createFolder(),
    activeDocument: createSavedDocument({
      path: ALPHA,
      content: markdown,
      isDirty,
      metadata: metadataOf(ALPHA),
      fingerprint: disk.get(ALPHA) ?? "",
    }),
  });
  documentEditorBridge.set(ALPHA, bridge);

  return editor;
};

let inspectedState: MarkdownFileState;

beforeEach(() => {
  disk = new Map([
    [ALPHA, "An alpha leaf.\n"],
    [BETA, "Beta leaf and another leaf.\n"],
  ]);
  modified = new Map();
  writeOrder = [];
  beforeWrite = () => {};
  failWrite = () => null;
  preflightFailure = null;
  saveFailure = null;
  inspectedState = { kind: "unchanged" };
  vi.mocked(requestDecision).mockClear();
  setDefaultSettings({ sidebarVisible: true });
  setDefaultSession({ folderContext: createFolder() });
  mockTauriApi({
    readFolderSearchFiles: ({ files }) => files.map(({ path }) => readOutcome(path)),
    preflightFolderReplacement: ({ files }) => {
      if (preflightFailure) {
        throw preflightFailure;
      }

      return files.map((file) => checkVersion(file) ?? { kind: "ready", path: file.path });
    },
    writeFolderReplacementFiles: (args) => {
      beforeWrite(args);

      return args.files.map((file) => {
        const outcome = checkVersion(file) ?? failWrite(file.path);

        if (outcome) {
          return outcome;
        }

        writeOrder.push(file.path);
        writeDisk(file.path, file.content);

        return { kind: "written", path: file.path };
      });
    },
    inspectMarkdownFile: () => inspectedState,
    saveMarkdownFile: ({ content, path }) => {
      if (saveFailure) {
        throw saveFailure(path);
      }

      writeDisk(path, content);

      return {
        path,
        parentFolderPath: FOLDER,
        metadata: metadataOf(path),
        fingerprint: content,
      };
    },
    openMarkdownFile: ({ path }) =>
      createOpenedMarkdownDocument({ path, parentFolderPath: FOLDER, content: disk.get(path)! }),
  });
  session = startFolderSearchSession();
});

afterEach(() => {
  session?.dispose();
  session = null;
  documentEditorBridge.clear();
  useFolderSearchStore.getState().reset();
});

describe("applying a folder replacement", () => {
  it("previews without writing, then writes every planned file in the order it lists them", async () => {
    const results = await plan("leaf", "tree");

    expect(results.files.map(({ path, replacement }) => [path, replacement])).toEqual([
      [
        ALPHA,
        {
          source: "disk",
          content: "An alpha tree.\n",
          encoding: { name: "UTF-8", bom: false },
          rewritesOtherText: false,
        },
      ],
      [
        BETA,
        {
          source: "disk",
          content: "Beta tree and another tree.\n",
          encoding: { name: "UTF-8", bom: false },
          rewritesOtherText: false,
        },
      ],
    ]);
    expect(countTauriApiCalls("preflightFolderReplacement")).toBe(0);
    expect(countTauriApiCalls("writeFolderReplacementFiles")).toBe(0);

    await applyFolderReplacement();

    expect(writeOrder).toEqual([ALPHA, BETA]);
    expect(disk.get(ALPHA)).toBe("An alpha tree.\n");
    expect(disk.get(BETA)).toBe("Beta tree and another tree.\n");
    expect(getReport()).toEqual({
      written: [
        { path: ALPHA, matchCount: 1 },
        { path: BETA, matchCount: 2 },
      ],
      stale: [],
      failed: [],
      notAttempted: [],
    });
    expect(getLastTauriApiArgs("writeFolderReplacementFiles")?.files[0]).toMatchObject({
      expectedMetadata: { sizeBytes: 15, modifiedAtUnixMs: 1 },
      expectedFingerprint: "An alpha leaf.\n",
    });
  });

  it("writes in the order of folder-relative paths, whatever the navigator's order", async () => {
    setDefaultSession({ folderContext: createFolder([BETA, ALPHA]) });

    await plan("leaf", "tree");
    await applyFolderReplacement();

    expect(writeOrder).toEqual([ALPHA, BETA]);
  });

  it("writes nothing for a plan the fields have moved on from", async () => {
    await plan("leaf", "tree");
    useFolderSearchStore.getState().setReplacement("bush");

    expect(await applyFolderReplacement()).toBe(false);

    useFolderSearchStore.getState().setReplacement("tree");
    useFolderSearchStore.getState().setReplaceOpen(false);

    expect(await applyFolderReplacement()).toBe(false);
    expect(countTauriApiCalls("preflightFolderReplacement")).toBe(0);
  });

  it("is unavailable until the plan is complete", async () => {
    openFolderSearch("replace");
    useFolderSearchStore.getState().setQuery("leaf");

    expect(await applyFolderReplacement()).toBe(false);
    expect(countTauriApiCalls("preflightFolderReplacement")).toBe(0);
  });

  it("leaves a file that changed since the preview and writes the others", async () => {
    await plan("leaf", "tree");
    writeDisk(ALPHA, "A changed leaf.\n");

    await applyFolderReplacement();

    expect(disk.get(ALPHA)).toBe("A changed leaf.\n");
    expect(disk.get(BETA)).toBe("Beta tree and another tree.\n");
    expect(getReport()).toMatchObject({
      written: [{ path: BETA, matchCount: 2 }],
      stale: [{ path: ALPHA, reason: "changedOnDisk", unsavedInEditor: false }],
    });
  });

  it("catches a file that changes after every file was checked", async () => {
    await plan("leaf", "tree");
    beforeWrite = () => writeDisk(BETA, null);

    await applyFolderReplacement();

    expect(disk.get(ALPHA)).toBe("An alpha tree.\n");
    expect(disk.get(BETA)).toBeNull();
    expect(getReport()).toMatchObject({
      written: [{ path: ALPHA, matchCount: 1 }],
      stale: [{ path: BETA, reason: "missing" }],
    });
  });

  it("goes on past a file that cannot be written and reports why", async () => {
    await plan("leaf", "tree");
    failWrite = (path) =>
      path === ALPHA
        ? {
            kind: "failed",
            path,
            error: { kind: "permissionDenied", message: "Access is denied." },
          }
        : null;

    await applyFolderReplacement();

    expect(disk.get(ALPHA)).toBe("An alpha leaf.\n");
    expect(getReport()).toMatchObject({
      written: [{ path: BETA }],
      failed: [
        {
          path: ALPHA,
          reason: "permissionDenied",
          detail: "Access is denied.",
          unsavedInEditor: false,
        },
      ],
    });
  });

  it("writes nothing and names every file when the check cannot run", async () => {
    await plan("leaf", "tree");
    preflightFailure = new Error("The backend is gone.");

    await applyFolderReplacement();

    expect(countTauriApiCalls("writeFolderReplacementFiles")).toBe(0);
    expect(getReport()).toEqual({
      written: [],
      stale: [],
      failed: [],
      notAttempted: [ALPHA, BETA],
    });
  });

  it("writes a large plan in bounded requests, reporting progress as it goes", async () => {
    const paths = Array.from({ length: 70 }, (_, index) => `${FOLDER}/${index}.md`);
    const progress: number[] = [];
    const requests: number[] = [];

    paths.forEach((path) => disk.set(path, "A leaf.\n"));
    disk.delete(ALPHA);
    disk.delete(BETA);
    setDefaultSession({ folderContext: createFolder(paths) });
    beforeWrite = ({ files }) => requests.push(files.length);

    await plan("leaf", "tree");

    const unsubscribe = useFolderSearchStore.subscribe(({ apply }) => {
      if (apply.status === "applying" && apply.phase === "writing") {
        progress.push(apply.completed);
      }
    });

    await applyFolderReplacement();
    unsubscribe();

    expect(requests).toEqual([32, 32, 6]);
    expect(progress).toEqual([0, 32, 64, 70]);
    expect(writeOrder).toEqual(paths.toSorted());
    expect(getReport().written).toHaveLength(70);
  });

  it("plans again once the replacement is written", async () => {
    await plan("leaf", "tree");
    await applyFolderReplacement();

    await vi.waitFor(() => {
      const { results } = useFolderSearchStore.getState();

      expect(results?.status).toBe("completed");
      expect(results?.files).toEqual([]);
    });
    expect(useFolderSearchStore.getState().apply.status).toBe("done");
  });

  describe("with the open document affected", () => {
    it("asks about its unsaved changes and, cancelled, changes nothing", async () => {
      const editor = openActiveDocument("Unsaved leaf\n", true);

      await plan("leaf", "tree");
      await applyFolderReplacement();

      expect(requestDecision).toHaveBeenCalledTimes(1);
      expect(editor.applied).toEqual([]);
      expect(countTauriApiCalls("saveMarkdownFile")).toBe(0);
      expect(countTauriApiCalls("preflightFolderReplacement")).toBe(0);
      expect(useFolderSearchStore.getState().apply.status).toBe("idle");
    });

    it("saves its changes, then plans again instead of writing", async () => {
      openActiveDocument("Unsaved leaf\n", true);
      vi.mocked(requestDecision).mockResolvedValueOnce("confirm");

      await plan("leaf", "tree");
      await applyFolderReplacement();

      expect(countTauriApiCalls("saveMarkdownFile")).toBe(1);
      expect(disk.get(ALPHA)).toBe("Unsaved leaf\n");
      expect(countTauriApiCalls("writeFolderReplacementFiles")).toBe(0);
      expect(useSessionStore.getState().activeDocument).toMatchObject({ isDirty: false });
      await waitForPlan("tree");
    });

    it("discards its changes by reading the file again, then plans again", async () => {
      openActiveDocument("Unsaved leaf\n", true);
      vi.mocked(requestDecision).mockResolvedValueOnce("alternate");

      await plan("leaf", "tree");
      await applyFolderReplacement();

      expect(countTauriApiCalls("openMarkdownFile")).toBe(1);
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        content: "An alpha leaf.\n",
        isDirty: false,
      });
      expect(countTauriApiCalls("saveMarkdownFile")).toBe(0);
      expect(countTauriApiCalls("writeFolderReplacementFiles")).toBe(0);
    });

    it("replaces a clean document in its editor and saves it", async () => {
      const editor = openActiveDocument("An alpha leaf.\n", false);
      const results = await plan("leaf", "tree");

      expect(results.files[0]).toMatchObject({
        path: ALPHA,
        version: { source: "editor" },
        replacement: { source: "editor", baseline: "An alpha leaf.\n" },
      });

      await applyFolderReplacement();

      expect(requestDecision).not.toHaveBeenCalled();
      expect(editor.applied).toEqual(["tree"]);
      expect(getLastTauriApiArgs("saveMarkdownFile")).toMatchObject({
        path: ALPHA,
        content: "An alpha tree.\n",
      });
      expect(useSessionStore.getState().activeDocument).toMatchObject({ isDirty: false });
      expect(writeOrder).toEqual([BETA]);
      expect(getReport().written).toEqual([
        { path: ALPHA, matchCount: 1 },
        { path: BETA, matchCount: 2 },
      ]);
    });

    it("leaves the document alone when its file changed on disk", async () => {
      const editor = openActiveDocument("An alpha leaf.\n", false);

      await plan("leaf", "tree");
      inspectedState = { kind: "contentChanged", metadata: metadataOf(ALPHA), fingerprint: "x" };
      await applyFolderReplacement();

      expect(editor.applied).toEqual([]);
      expect(countTauriApiCalls("saveMarkdownFile")).toBe(0);
      expect(getReport().stale).toEqual([
        { path: ALPHA, reason: "changedOnDisk", unsavedInEditor: false },
      ]);
    });

    it("reports a save that finds a newer file, keeping the replacement unsaved", async () => {
      openActiveDocument("An alpha leaf.\n", false);
      saveFailure = (path) => ({
        kind: "externalModification",
        path,
        currentMetadata: metadataOf(path),
      });

      await plan("leaf", "tree");
      await applyFolderReplacement();

      expect(getReport().stale).toEqual([
        { path: ALPHA, reason: "changedOnDisk", unsavedInEditor: true },
      ]);
      expect(useSessionStore.getState().activeDocument).toMatchObject({ isDirty: true });
      expect(disk.get(BETA)).toBe("Beta tree and another tree.\n");
    });
  });
});
