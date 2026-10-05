// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { act, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import type { FolderSearchResults } from "../services/folderSearchEngine";
import { useFolderSearchStore } from "../stores/folderSearch";
import { FolderSearchPanel } from "./folder-search-panel";

const FOLDER = "C:\\Notes";

const context = (before: string, match: string, after: string) => ({
  before,
  match,
  after,
  clippedBefore: false,
  clippedAfter: false,
});

const createResults = (overrides: Partial<FolderSearchResults> = {}): FolderSearchResults => ({
  id: 1,
  folderPath: FOLDER,
  query: { caseSensitive: false, text: "leaf", wholeWord: false },
  replacement: null,
  status: "completed",
  searchedFileCount: 3,
  articleCount: 3,
  matchCount: 3,
  files: [
    {
      path: `${FOLDER}\\docs\\notes.md`,
      version: { source: "editor" },
      clipped: false,
      replacement: null,
      matches: [
        { ordinal: 0, context: context("One ", "leaf", " here.") },
        { ordinal: 1, context: context("Another ", "leaf", ".") },
      ],
    },
    {
      path: `${FOLDER}\\guide.md`,
      version: { source: "editor" },
      clipped: false,
      replacement: null,
      matches: [{ ordinal: 0, context: context("", "Leaf", "let") }],
    },
  ],
  skipped: [],
  ...overrides,
});

const renderPanel = (results: FolderSearchResults | null = createResults()) => {
  const handlers = {
    onActivateMatch: vi.fn(),
    onApply: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onSearchFurther: vi.fn(),
    onSubmit: vi.fn(),
  };

  useFolderSearchStore.setState({ open: true, query: results?.query.text ?? "", results });

  const rendered = renderWithUser(
    <FolderSearchPanel folderName="Notes" folderPath={FOLDER} {...handlers} />,
  );

  return { ...rendered, ...handlers };
};

const getQuery = () => screen.getByRole("textbox", { name: "Search in folder" });
const getRows = () =>
  within(screen.getByRole("tree", { name: "Search results" })).getAllByRole("treeitem");

describe("folder search panel", () => {
  it("is named by its folder and focuses the query when asked", async () => {
    renderPanel(null);

    expect(screen.getByRole("search", { name: "Search in Notes" })).toBeInTheDocument();

    act(() => useFolderSearchStore.getState().openFolderSearch());

    await waitFor(() => expect(getQuery()).toHaveFocus());
  });

  it("keeps the query and its options in the store, and searches at once on Enter", async () => {
    const { onSubmit, user } = renderPanel(null);

    await user.type(getQuery(), "leaf");
    await user.click(screen.getByRole("button", { name: "Match case" }));
    await user.click(screen.getByRole("button", { name: "Whole word" }));
    await user.click(getQuery());
    await user.keyboard("{Enter}");

    expect(useFolderSearchStore.getState()).toMatchObject({
      caseSensitive: true,
      query: "leaf",
      wholeWord: true,
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("groups matches under their folder-relative files with counts and highlighted text", () => {
    renderPanel();

    const rows = getRows();

    expect(rows.map((row) => row.getAttribute("aria-level"))).toEqual(["1", "2", "2", "1", "2"]);
    expect(rows[0]).toHaveAccessibleName("docs\\notes.md, 2 results");
    expect(rows[0]).toHaveAttribute("aria-expanded", "true");
    expect(rows[1]).toHaveTextContent("One leaf here.");
    expect(rows[1].querySelector("mark")).toHaveTextContent("leaf");
    expect(rows[3]).toHaveAccessibleName("guide.md, 1 result");
    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("3 results in 2 files");
  });

  it("steps through the results from the keyboard and activates a match", async () => {
    const { onActivateMatch, user } = renderPanel();

    await user.click(getQuery());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getRows()[0]).toHaveFocus());

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(getRows()[2]).toHaveFocus();
    expect(onActivateMatch).toHaveBeenCalledWith({ path: `${FOLDER}\\docs\\notes.md`, ordinal: 1 });

    await user.keyboard("{ArrowLeft}");

    expect(getRows()[0]).toHaveFocus();

    await user.keyboard("{ArrowLeft}");

    expect(getRows()).toHaveLength(3);
    expect(getRows()[0]).toHaveAttribute("aria-expanded", "false");
    expect(onActivateMatch).toHaveBeenCalledTimes(1);
  });

  it("shows only the line holding a match in a run of several lines", () => {
    renderPanel(
      createResults({
        files: [
          {
            path: `${FOLDER}\\code.md`,
            version: { source: "editor" },
            clipped: false,
            replacement: null,
            matches: [
              { ordinal: 0, context: context("first line\nconst ", "leaf", " = 1;\nlast") },
            ],
          },
        ],
        matchCount: 1,
      }),
    );

    expect(getRows()[1].textContent).toBe("const leaf = 1;");
  });

  it("does not activate a match found gone, and marks the chosen one selected", async () => {
    const { onActivateMatch, user } = renderPanel();

    act(() => {
      useFolderSearchStore.getState().markMatchUnavailable({
        path: `${FOLDER}\\docs\\notes.md`,
        ordinal: 0,
      });
      useFolderSearchStore.getState().setChosenMatch({ path: `${FOLDER}\\guide.md`, ordinal: 0 });
    });

    await user.click(getRows()[1]);

    expect(getRows()[1]).toHaveAttribute("aria-disabled", "true");
    expect(getRows()[4]).toHaveAttribute("aria-selected", "true");
    expect(onActivateMatch).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = renderPanel();

    await user.click(getQuery());
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows progress with a cancel button, and announces only the outcome", async () => {
    const { onCancel, user } = renderPanel(
      createResults({ status: "searching", searchedFileCount: 1, articleCount: 10_000 }),
    );

    expect(screen.getByTestId("folder-search-status")).toHaveTextContent(
      "Searching… 1 of 10,000 files",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Searching");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => useFolderSearchStore.getState().setResults(createResults({ status: "cancelled" })));

    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("Search cancelled.");
    expect(screen.getByRole("status")).toHaveTextContent("Search cancelled. 3 results in 2 files");
  });

  it("offers to search further once the match limit stops a search", async () => {
    const { onSearchFurther, user } = renderPanel(createResults({ status: "limited" }));

    expect(screen.getByTestId("folder-search-status")).toHaveTextContent(
      "Search stopped after 3 results.",
    );

    await user.click(screen.getByRole("button", { name: "Search further" }));

    expect(onSearchFurther).toHaveBeenCalledTimes(1);
  });

  it("says when nothing matched and names the files it skipped", async () => {
    const { user } = renderPanel(
      createResults({
        files: [],
        matchCount: 0,
        skipped: [
          { path: `${FOLDER}\\big.md`, reason: "oversizedFile" },
          { path: `${FOLDER}\\latin.md`, reason: "invalidEncoding" },
        ],
      }),
    );

    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("No results");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2 files skipped" }));

    expect(screen.getByTestId("folder-search-skipped")).toHaveTextContent(
      "big.md: larger than 5 MB",
    );
    expect(screen.getByTestId("folder-search-skipped")).toHaveTextContent(
      "latin.md: not valid in its encoding",
    );
  });
});

const createPlan = (overrides: Partial<FolderSearchResults> = {}) => {
  const results = createResults({ replacement: "tree", ...overrides });

  return {
    ...results,
    files: results.files.map((file, index) => ({
      ...file,
      replacement: {
        source: "disk" as const,
        content: "planned",
        encoding: { name: "UTF-8" as const, bom: false },
        rewritesOtherText: index === 1,
      },
    })),
  };
};

const renderReplacePanel = (results: FolderSearchResults | null = createPlan()) => {
  useFolderSearchStore.setState({ replaceOpen: true, replacement: results?.replacement ?? "" });

  return renderPanel(results);
};

const getReplacement = () => screen.getByRole("textbox", { name: "Replace with" });

describe("folder search panel, replacing", () => {
  it("shows the replace field from its toggle and keeps the replacement in the store", async () => {
    const { user } = renderPanel(null);
    const toggle = screen.getByRole("button", { name: "Show replace" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Replace with" })).not.toBeInTheDocument();

    await user.click(toggle);
    await user.type(getReplacement(), "tree");

    expect(screen.getByRole("button", { name: "Hide replace" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(useFolderSearchStore.getState()).toMatchObject({
      replaceOpen: true,
      replacement: "tree",
    });
    expect(screen.getByText(/once you choose Replace all/u)).toBeInTheDocument();
  });

  it("focuses the replacement when opened to replace a query it already holds", async () => {
    renderPanel(null);

    act(() => {
      useFolderSearchStore.getState().setQuery("leaf");
      useFolderSearchStore.getState().openFolderSearch("replace");
    });

    await waitFor(() => expect(getReplacement()).toHaveFocus());
  });

  it("previews each change and marks a file written as Save writes it", () => {
    renderReplacePanel();

    const rows = getRows();

    expect(rows[0]).toHaveAccessibleName("docs\\notes.md, 2 replacements");
    expect(rows[1].querySelector("del")).toHaveTextContent("leaf");
    expect(rows[1].querySelector("ins")).toHaveTextContent("tree");
    expect(rows[1]).toHaveTextContent("One leaftree here.");
    expect(rows[1]).toHaveAccessibleName("One leaf here.: “leaf” becomes “tree”");
    expect(rows[0].querySelector("[data-testid=folder-search-rewrites-other-text]")).toBeNull();
    expect(
      within(rows[3]).getByRole("img", {
        name: "Written as Save writes it, which also changes other lines",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("folder-search-status")).toHaveTextContent(
      "3 replacements in 2 files",
    );
  });

  it("offers Replace all once the plan is complete, from the button or the keyboard", async () => {
    const { onApply, onSubmit, user } = renderReplacePanel();

    await user.click(screen.getByRole("button", { name: "Replace all" }));
    await user.click(getReplacement());
    await user.keyboard("{Enter}");
    await user.keyboard("{Control>}{Alt>}{Enter}{/Alt}{/Control}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it("holds Replace all back while it prepares or the fields have moved on, and shows progress while it writes", async () => {
    const { onApply, user } = renderReplacePanel(
      createPlan({ status: "searching", searchedFileCount: 1 }),
    );

    await user.click(screen.getByRole("button", { name: "Replace all" }));

    expect(screen.getByRole("button", { name: "Replace all" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onApply).not.toHaveBeenCalled();

    act(() => useFolderSearchStore.setState({ results: createPlan(), replacement: "bush" }));

    expect(screen.queryByRole("button", { name: "Replace all" })).not.toBeInTheDocument();

    act(() => useFolderSearchStore.setState({ replacement: "tree" }));

    expect(screen.getByRole("button", { name: "Replace all" })).not.toHaveAttribute(
      "aria-disabled",
    );
    act(() =>
      useFolderSearchStore.setState({
        results: createPlan({ status: "searching", searchedFileCount: 1 }),
      }),
    );
    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("Preparing… 1 of 3 files");

    act(() =>
      useFolderSearchStore.setState({
        results: createPlan(),
        apply: { status: "applying", phase: "writing", completed: 1, total: 2 },
      }),
    );

    expect(screen.queryByRole("button", { name: "Replace all" })).not.toBeInTheDocument();
    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("Replacing… 1 of 2 files");
  });

  it("reports what an Apply wrote and why it left files alone, until dismissed", async () => {
    const { user } = renderReplacePanel(createPlan({ files: [], matchCount: 0 }));

    act(() =>
      useFolderSearchStore.setState({
        apply: {
          status: "done",
          report: {
            written: [{ path: `${FOLDER}\\a.md`, matchCount: 3 }],
            stale: [
              { path: `${FOLDER}\\b.md`, reason: "changedOnDisk", unsavedInEditor: false },
              { path: `${FOLDER}\\open.md`, reason: "changedOnDisk", unsavedInEditor: true },
            ],
            failed: [
              {
                path: `${FOLDER}\\c.md`,
                reason: "unrepresentableCharacters",
                unsavedInEditor: false,
                encoding: "windows-1252",
                detail: "🍃",
              },
            ],
            notAttempted: [`${FOLDER}\\d.md`],
          },
        },
      }),
    );

    const report = screen.getByTestId("folder-replace-report");

    expect(within(report).getByRole("status")).toHaveTextContent("Replaced 3 matches in 1 file.");
    expect(screen.getByTestId("folder-replace-stale")).toHaveTextContent("b.md: changed on disk");
    expect(screen.getByTestId("folder-replace-stale")).toHaveTextContent(
      "open.md: changed on disk; replaced in the editor, not saved",
    );
    expect(screen.getByTestId("folder-replace-failed")).toHaveTextContent(
      "c.md: windows-1252 cannot hold 🍃",
    );
    expect(screen.getByTestId("folder-replace-not-attempted")).toHaveTextContent("d.md");
    expect(screen.getByTestId("folder-search-status")).toHaveTextContent("Nothing to replace");

    await user.click(screen.getByRole("button", { name: "Dismiss report" }));

    expect(screen.queryByTestId("folder-replace-report")).not.toBeInTheDocument();
    expect(useFolderSearchStore.getState().apply).toEqual({ status: "idle" });
  });

  it("drops the report once the query or replacement changes", async () => {
    const { user } = renderReplacePanel();

    act(() =>
      useFolderSearchStore.setState({
        apply: {
          status: "done",
          report: { written: [], stale: [], failed: [], notAttempted: [] },
        },
      }),
    );

    await user.type(getReplacement(), "s");

    expect(useFolderSearchStore.getState().apply).toEqual({ status: "idle" });
  });
});
