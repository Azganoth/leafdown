// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { createFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession } from "@/test/utils/appStores";
import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import {
  activateNamedFolder,
  keepNamedFolder,
  removeNamedFolder,
  renameNamedFolder,
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

const folder = {
  id: "personal",
  name: "Personal notes",
  path: "C:/Notes",
  windowLabel: null,
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
    await user.click(screen.getByRole("button", { name: "Named folders" }));
    const dialog = screen.getByRole("dialog", { name: "Named folders" });
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

  it("names the current folder through a labelled form and rejects blank names", async () => {
    setDefaultSession({ folderContext: createFolderContext() });
    useNamedFoldersStore.setState({ dialogOpen: true });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    const keep = screen.getByRole("button", { name: "Keep this folder" });
    expect(keep).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Personal notes");
    await user.click(keep);
    expect(keepNamedFolder).toHaveBeenCalledWith("Personal notes");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue(""),
    );
  });

  it("renames an entry and keeps active entries unavailable for removal or relocation", async () => {
    useNamedFoldersStore.setState({
      folders: [{ ...folder, windowLabel: "main" }],
      activeId: folder.id,
      dialogOpen: true,
    });
    const { user } = renderWithUser(<NamedFoldersDialog />);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Locate folder…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const name = screen.getByRole("textbox", { name: "Display name" });
    await user.clear(name);
    await user.type(name, "Writing");
    await user.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    expect(renameNamedFolder).toHaveBeenCalledWith(folder.id, "Writing");
    expect(removeNamedFolder).not.toHaveBeenCalled();
  });
});
