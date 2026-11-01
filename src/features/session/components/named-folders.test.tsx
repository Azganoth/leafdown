// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { selectFolderContextPath } from "@/features/folder-context";
import { createFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession } from "@/test/utils/appStores";
import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { addNamedFolder, updateNamedFolder } from "../services/namedFolderForms";
import {
  activateNamedFolder,
  keepNamedFolder,
  removeNamedFolder,
} from "../services/namedFolderWorkflows";
import { useNamedFoldersStore } from "../stores/namedFolders";
import { NamedFolderSelector, NamedFoldersDialog, NamedFoldersList } from "./named-folders";

vi.mock("../services/namedFolderWorkflows", () => ({
  showNamedFolders: () => useNamedFoldersStore.setState({ dialogOpen: true }),
  runNamedFolderAction: async (action: () => Promise<unknown>) => action(),
  activateNamedFolder: vi.fn(async () => true),
  keepNamedFolder: vi.fn(async () => true),
  renameNamedFolder: vi.fn(async () => undefined),
  locateNamedFolder: vi.fn(async () => undefined),
  removeNamedFolder: vi.fn(async () => undefined),
}));

vi.mock("../services/namedFolderForms", () => ({
  addNamedFolder: vi.fn(async () => true),
  updateNamedFolder: vi.fn(async () => true),
}));
vi.mock("@/features/folder-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/folder-context")>()),
  selectFolderContextPath: vi.fn(async () => "C:/Picked"),
}));

const folder = {
  id: "personal",
  name: "Personal notes",
  path: "C:/Notes",
  windowLabel: null,
  contextId: "personal",
  hasUnsavedDrafts: true,
};

describe("named folder controls", () => {
  it("opens accessible selection from the navigator and selects a parked folder", async () => {
    useNamedFoldersStore.setState({ folders: [folder] });
    const { user } = renderWithUser(
      <>
        <NamedFolderSelector />
        <NamedFoldersDialog />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Bookmarks" }));
    const dialog = screen.getByRole("dialog", { name: "Bookmarks" });
    await user.click(within(dialog).getByRole("button", { name: "Personal notes" }));
    expect(activateNamedFolder).toHaveBeenCalledWith(folder.id);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers named folders on welcome independently of recent history", async () => {
    useNamedFoldersStore.setState({ folders: [folder] });
    const { user } = renderWithUser(<NamedFoldersList />);
    await user.click(screen.getByRole("button", { name: "Personal notes" }));
    expect(activateNamedFolder).toHaveBeenCalledWith(folder.id);
  });

  it("remembers the current folder directly from its row", async () => {
    setDefaultSession({ folderContext: createFolderContext({ path: "C:/Notes" }) });
    useNamedFoldersStore.setState({ dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: "Bookmark folder" }));
    expect(keepNamedFolder).toHaveBeenCalledWith("Notes");
  });

  it("filters by name and path while retaining the bottom action", async () => {
    useNamedFoldersStore.setState({
      folders: [folder, { ...folder, id: "work", name: "Work", path: "C:/Office" }],
      dialogOpen: true,
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    const search = screen.getByRole("textbox", { name: "Search bookmarks…" });
    await user.type(search, "office");
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Personal notes" })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "no match");
    expect(screen.getByText("No bookmarks found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add bookmark…" })).toBeInTheDocument();
  });

  it("edits a bookmark even while its folder is active", async () => {
    useNamedFoldersStore.setState({
      folders: [{ ...folder, windowLabel: "main" }],
      activeId: folder.id,
      dialogOpen: true,
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    expect(screen.getByRole("button", { name: "Remove bookmark" })).toBeEnabled();
    await user.pointer({
      target: screen.getByRole("button", { name: "Personal notes" }),
      keys: "[MouseRight]",
    });
    expect(screen.queryByRole("menuitem", { name: /Close|Park/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Select folder" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Folder" })).toBeEnabled();
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Writing");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateNamedFolder).toHaveBeenCalledWith(
      { ...folder, windowLabel: "main" },
      "Writing",
      folder.path,
    );
    expect(removeNamedFolder).not.toHaveBeenCalled();
  });
  it("stages a selected folder until Add and leaves the session alone on Cancel", async () => {
    useNamedFoldersStore.setState({ dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: "Add bookmark…" }));
    await user.click(screen.getByRole("button", { name: "Select folder" }));
    expect(selectFolderContextPath).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Folder" })).toHaveValue("C:/Picked");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Picked");
    expect(addNamedFolder).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(addNamedFolder).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add bookmark…" }));
    await user.click(screen.getByRole("button", { name: "Select folder" }));
    await user.click(screen.getByRole("button", { name: "Add bookmark" }));
    expect(addNamedFolder).toHaveBeenCalledWith("Picked", "C:/Picked");
  });

  it("moves focus from search through matching rows with arrow keys", async () => {
    useNamedFoldersStore.setState({
      folders: [folder, { ...folder, id: "work", name: "Work" }],
      dialogOpen: true,
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("textbox", { name: "Search bookmarks…" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Personal notes" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Work" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Personal notes" })).toHaveFocus();
  });

  it("edits a closed folder location through the shared picker and returns focus", async () => {
    useNamedFoldersStore.setState({ folders: [folder], dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    const row = screen.getByRole("button", { name: folder.name });
    await user.pointer({ target: row, keys: "[MouseRight]" });
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Select folder" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(folder.name);
    expect(screen.getByRole("textbox", { name: "Folder" })).toHaveValue("C:/Picked");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateNamedFolder).toHaveBeenCalledWith(folder, folder.name, "C:/Picked");
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("opens a folder in a new window from its context menu", async () => {
    useNamedFoldersStore.setState({ folders: [folder], dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.pointer({
      target: screen.getByRole("button", { name: folder.name }),
      keys: "[MouseRight]",
    });
    await user.click(screen.getByRole("menuitem", { name: "Open in new window" }));
    expect(activateNamedFolder).toHaveBeenCalledWith(folder.id, true);
  });

  it("removes a parked entry without selecting it", async () => {
    useNamedFoldersStore.setState({ folders: [folder], dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: "Remove bookmark" }));
    expect(removeNamedFolder).toHaveBeenCalledWith(folder);
    expect(activateNamedFolder).not.toHaveBeenCalled();
  });

  it("keeps the picker open when a switch is canceled", async () => {
    useNamedFoldersStore.setState({ folders: [folder], dialogOpen: true });
    vi.mocked(activateNamedFolder).mockResolvedValueOnce(false);
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: folder.name }));
    expect(screen.getByRole("dialog", { name: "Bookmarks" })).toBeInTheDocument();
  });
  it("shows an Add failure in the form without clearing its values or the current session", async () => {
    setDefaultSession({ folderContext: createFolderContext({ path: "C:/Notes" }) });
    useNamedFoldersStore.setState({ dialogOpen: true, activeId: "personal" });
    vi.mocked(addNamedFolder).mockRejectedValueOnce({
      kind: "folderUnavailable",
      path: "C:/Missing",
      message: "The folder does not exist.",
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: "Add bookmark…" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Missing");
    await user.type(screen.getByRole("textbox", { name: "Folder" }), "C:/Missing");
    await user.click(screen.getByRole("button", { name: "Add bookmark" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The folder does not exist.");
    expect(screen.getByRole("textbox", { name: "Folder" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Missing");
    expect(useNamedFoldersStore.getState().activeId).toBe("personal");
    expect(activateNamedFolder).not.toHaveBeenCalled();
  });

  it("keeps an unbookmarked current folder in the list and allows bookmarking it again", async () => {
    setDefaultSession({ folderContext: createFolderContext({ path: "C:/Notes" }) });
    useNamedFoldersStore.setState({
      folders: [{ ...folder, windowLabel: "main" }],
      activeId: folder.contextId,
      dialogOpen: true,
    });
    vi.mocked(removeNamedFolder).mockImplementationOnce(async () => {
      useNamedFoldersStore.setState({ folders: [] });
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: "Remove bookmark" }));
    expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "true");
    expect(useNamedFoldersStore.getState().activeId).toBe(folder.contextId);
    await user.click(screen.getByRole("button", { name: "Bookmark folder" }));
    expect(keepNamedFolder).toHaveBeenCalledWith("Notes");
  });

  it("places Open in new window after the separated bookmark actions", async () => {
    useNamedFoldersStore.setState({ folders: [folder], dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.pointer({
      target: screen.getByRole("button", { name: folder.name }),
      keys: "[MouseRight]",
    });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Edit",
      "Remove",
      "Open in new window",
    ]);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
  });

  it("offers retained drafts even when no bookmarks remain", async () => {
    useNamedFoldersStore.setState({ folders: [], sessions: [folder], dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    await user.click(screen.getByRole("button", { name: "Recover drafts…" }));
    const recovery = screen.getByRole("dialog", { name: "Recover drafts" });
    await user.click(within(recovery).getByRole("button", { name: folder.name }));
    expect(activateNamedFolder).toHaveBeenCalledWith(folder.id, false, undefined, true);
  });
});
