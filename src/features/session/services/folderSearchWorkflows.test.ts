// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MarkdownFileState } from "@/features/document";
import {
  findSearchableTextMatches,
  type SearchMatchTarget,
  type TextSearchQuery,
} from "@/features/editor";
import { useArticleNavigatorStore, type FolderContextState } from "@/features/folder-context";
import type { FolderSearchFileOutcome } from "@/features/folder-search/services/folderSearchApi";
import { useFolderSearchStore } from "@/features/folder-search/stores/folderSearch";
import { useSettingsStore } from "@/features/preferences";
import { requestConfirmation } from "@/lib/confirmation";
import type { Disposable } from "@/lib/lifecycle";
import { toastManager } from "@/lib/toast";
import { createOpenedMarkdownDocument, createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createArticleTree, createFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countTauriApiCalls, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import {
  closeFolderSearch,
  openFolderSearch,
  openFolderSearchMatch,
  startFolderSearchSession,
} from "./folderSearchWorkflows";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const FOLDER = "C:/Notes";
const ALPHA = `${FOLDER}/alpha.md`;
const BETA = `${FOLDER}/docs/beta.md`;

let disk: Map<string, string | null>;
let inspectedState: MarkdownFileState;
let session: Disposable | null = null;

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
    metadata: { sizeBytes: content.length, modifiedAtUnixMs: 1 },
    fingerprint: content,
  };
};

// Each line of the editor's text is a run of its own, as the editor's paragraphs would be.
const createEditor = (text: string) => {
  const editor = {
    text,
    chosen: [] as SearchMatchTarget[],
    focused: 0,
    choose: (ordinal: number | null) => {
      editor.answer = ordinal;
    },
    answer: null as number | null,
  };
  const bridge = createMilkdownEditorBridge({
    readSearchMatches: (query: TextSearchQuery) => {
      const searchable = editor.text.split("\n").join("\u0000");

      return { text: searchable, matches: findSearchableTextMatches(searchable, query) };
    },
    chooseSearchMatch: async (_query: TextSearchQuery, target: SearchMatchTarget) => {
      editor.chosen.push(target);
      return editor.answer;
    },
    focusChosenSearchMatch: () => {
      editor.focused += 1;
    },
  });

  return { bridge, editor };
};

const search = async (text: string) => {
  openFolderSearch();
  useFolderSearchStore.getState().setQuery(text);

  return vi.waitFor(
    () => {
      const { results } = useFolderSearchStore.getState();

      expect(results?.query.text).toBe(text);
      expect(results?.status).toBe("completed");

      return results!;
    },
    { timeout: 10_000 },
  );
};

const summarize = () =>
  useFolderSearchStore
    .getState()
    .results?.files.map(({ matches, path }) => [path, matches.length]) ?? [];

beforeEach(() => {
  disk = new Map([
    [ALPHA, "An alpha leaf.\n"],
    [BETA, "Beta leaf and another leaf.\n"],
  ]);
  inspectedState = { kind: "unchanged" };
  setDefaultSettings({ sidebarVisible: false });
  setDefaultSession({ folderContext: createFolder() });
  mockTauriApi({
    readFolderSearchFiles: ({ files }) => files.map(({ path }) => readOutcome(path)),
    inspectMarkdownFile: () => inspectedState,
    openMarkdownFile: ({ path }) => {
      const content = disk.get(path);

      if (content === undefined || content === null) {
        throw { kind: "missingFile", path };
      }

      return createOpenedMarkdownDocument({ path, parentFolderPath: FOLDER, content });
    },
  });
  session = startFolderSearchSession();
});

afterEach(() => {
  session?.dispose();
  session = null;
  documentEditorBridge.clear();
});

describe("folder search workflows", () => {
  it("opens in the sidebar and searches the folder's articles once the query settles", async () => {
    await search("leaf");

    expect(useSettingsStore.getState().sidebarVisible).toBe(true);
    expect(summarize()).toEqual([
      [ALPHA, 1],
      [BETA, 2],
    ]);
  });

  it("searches the active document's unsaved text rather than its file", async () => {
    const { bridge, editor } = createEditor("unsaved leaf\nleaf again");

    setDefaultSession({
      folderContext: createFolder(),
      activeDocument: createSavedDocument({ path: ALPHA, content: "unsaved", isDirty: true }),
    });
    documentEditorBridge.set(ALPHA, bridge);
    disk.set(ALPHA, null);

    await search("leaf");

    expect(summarize()).toEqual([
      [ALPHA, 2],
      [BETA, 2],
    ]);
    expect(useFolderSearchStore.getState().results?.skipped).toEqual([]);

    editor.text = "edited leaf\nleaf\nleaf";
    useSessionStore.getState().setActiveDocumentContent(ALPHA, "edited");

    expect(summarize()).toEqual([
      [ALPHA, 3],
      [BETA, 2],
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({ isDirty: true });
    expect(countTauriApiCalls("saveMarkdownFile")).toBe(0);
  });

  it("opens a match's file through the open workflow, then chooses the match", async () => {
    await search("leaf");

    const { bridge, editor } = createEditor("Beta leaf and another leaf.");
    editor.choose(1);

    const opening = openFolderSearchMatch({ path: BETA, ordinal: 1 });

    await vi.waitFor(() =>
      expect(useSessionStore.getState().activeDocument).toMatchObject({ path: BETA }),
    );
    documentEditorBridge.set(BETA, bridge);
    await opening;

    expect(editor.chosen).toEqual([
      {
        ordinal: 1,
        context: expect.objectContaining({ before: "Beta leaf and another ", match: "leaf" }),
      },
    ]);
    expect(useFolderSearchStore.getState().chosenMatch).toEqual({ path: BETA, ordinal: 1 });
  });

  it("leaves the editor and the results as they were when switching is declined", async () => {
    setDefaultSession({
      folderContext: createFolder(),
      activeDocument: createSavedDocument({ path: ALPHA, content: "unsaved", isDirty: true }),
    });

    const results = await search("leaf");

    vi.mocked(requestConfirmation).mockResolvedValueOnce(false);
    await openFolderSearchMatch({ path: BETA, ordinal: 0 });

    expect(requestConfirmation).toHaveBeenCalledTimes(1);
    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().activeDocument).toMatchObject({ path: ALPHA, isDirty: true });
    expect(useFolderSearchStore.getState().results).toBe(results);
  });

  it("marks a match whose file is gone without asking about unsaved changes", async () => {
    await search("leaf");

    inspectedState = { kind: "missing" };
    disk.set(BETA, null);
    await openFolderSearchMatch({ path: BETA, ordinal: 0 });

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "That match is no longer in beta.md." }),
    );
    await vi.waitFor(() => expect(summarize()).toEqual([[ALPHA, 1]]));
    expect(useFolderSearchStore.getState().results?.skipped).toEqual([
      { path: BETA, reason: "missingFile" },
    ]);
  });

  it("marks a match the opened file no longer holds instead of choosing other text", async () => {
    await search("leaf");

    const { bridge, editor } = createEditor("Beta changed.");
    editor.choose(null);

    const opening = openFolderSearchMatch({ path: BETA, ordinal: 1 });

    await vi.waitFor(() =>
      expect(useSessionStore.getState().activeDocument).toMatchObject({ path: BETA }),
    );
    documentEditorBridge.set(BETA, bridge);
    await opening;

    expect(useFolderSearchStore.getState().chosenMatch).toBeNull();
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "That match is no longer in beta.md." }),
    );
    expect(summarize()).toEqual([[ALPHA, 1]]);
  });

  it("chooses a match in the active document without opening it again", async () => {
    const { bridge, editor } = createEditor("An alpha leaf.");

    editor.choose(0);
    setDefaultSession({
      folderContext: createFolder(),
      activeDocument: createSavedDocument({
        path: ALPHA,
        content: "An alpha leaf.\n",
        isDirty: true,
      }),
    });
    documentEditorBridge.set(ALPHA, bridge);

    await search("leaf");
    await openFolderSearchMatch({ path: ALPHA, ordinal: 0 });

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(editor.chosen).toHaveLength(1);
    expect(useFolderSearchStore.getState().chosenMatch).toEqual({ path: ALPHA, ordinal: 0 });

    closeFolderSearch();

    expect(useFolderSearchStore.getState().open).toBe(false);
    expect(editor.focused).toBe(1);
  });

  it("keeps what it read while the folder stays open, so reopening reads only changed files", async () => {
    await search("leaf");
    closeFolderSearch();
    openFolderSearch();

    await vi.waitFor(() =>
      expect(useFolderSearchStore.getState().results?.status).toBe("completed"),
    );

    const lastRead = vi
      .mocked(invoke)
      .mock.calls.findLast(([command]) => command === "read_folder_search_files");

    expect(lastRead?.[1]).toMatchObject({
      files: [
        { path: ALPHA, knownMetadata: { sizeBytes: disk.get(ALPHA)?.length } },
        { path: BETA, knownMetadata: { sizeBytes: disk.get(BETA)?.length } },
      ],
    });
  });

  it("returns focus to the article navigator when no document is open", async () => {
    await search("leaf");

    closeFolderSearch();

    expect(useArticleNavigatorStore.getState().focusPath).toBe(ALPHA);
  });

  it("refreshes in place when the folder's articles change", async () => {
    const first = await search("leaf");

    disk.set(`${FOLDER}/gamma.md`, "gamma leaf");
    useSessionStore.getState().setFolderContext(createFolder([ALPHA, BETA, `${FOLDER}/gamma.md`]));

    await vi.waitFor(() =>
      expect(summarize()).toEqual([
        [ALPHA, 1],
        [BETA, 2],
        [`${FOLDER}/gamma.md`, 1],
      ]),
    );
    expect(useFolderSearchStore.getState().results?.id).toBe(first.id);
  });

  it("retires the search when the folder closes or changes", async () => {
    await search("leaf");

    useSessionStore.getState().setFolderContext(null);

    expect(useFolderSearchStore.getState()).toMatchObject({
      open: false,
      query: "",
      results: null,
    });

    setDefaultSession({ folderContext: createFolder() });
    await search("leaf");
    useSessionStore.getState().setFolderContext(
      createFolderContext({
        path: "C:/Other",
        tree: createArticleTree({ path: "C:/Other", children: [] }),
      }),
    );

    expect(useFolderSearchStore.getState()).toMatchObject({
      open: false,
      query: "",
      results: null,
    });
  });
});
