import { describe, expect, it, vi } from "vitest";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { addNamedFolder, updateNamedFolder } from "./namedFolderForms";
import { editNamedFolder } from "./namedFoldersApi";
import { createBookmark, refreshNamedFolders } from "./namedFolderWorkflows";
import { openFolderContextAtPath } from "./openSession";

vi.mock("./namedFoldersApi", () => ({ editNamedFolder: vi.fn(async () => undefined) }));
vi.mock("./namedFolderWorkflows", () => ({
  createBookmark: vi.fn(async () => true),
  refreshNamedFolders: vi.fn(async () => undefined),
}));
vi.mock("./openSession", () => ({ openFolderContextAtPath: vi.fn(async () => true) }));
const folder = {
  id: "notes",
  name: "Notes",
  path: "C:/Notes",
  windowLabel: null,
  contextId: "personal",
  hasUnsavedDrafts: true,
};

describe("named folder forms", () => {
  it("creates a bookmark without opening its folder", async () => {
    expect(await addNamedFolder("Writing", "C:/Writing")).toBe(true);
    expect(createBookmark).toHaveBeenCalledWith("Writing", "C:/Writing");
    expect(openFolderContextAtPath).not.toHaveBeenCalled();
  });
  it("rejects blank edit fields without persisting", async () => {
    expect(await updateNamedFolder(folder, " ", folder.path)).toBe(false);
    expect(await updateNamedFolder(folder, "Writing", " ")).toBe(false);
    expect(editNamedFolder).not.toHaveBeenCalled();
  });
  it("saves name and a changed location together at the current revision", async () => {
    useNamedFoldersStore.setState({ revision: 5 });
    expect(await updateNamedFolder(folder, " Writing ", " C:/Writing ")).toBe(true);
    expect(editNamedFolder).toHaveBeenCalledWith(folder.id, {
      name: "Writing",
      path: "C:/Writing",
      expectedRevision: 5,
    });
    expect(refreshNamedFolders).toHaveBeenCalled();
  });
  it("omits equivalent paths so active folders can still be renamed", async () => {
    await updateNamedFolder({ ...folder, windowLabel: "main" }, "Writing", "c:\\notes");
    expect(editNamedFolder).toHaveBeenCalledWith(folder.id, {
      name: "Writing",
      expectedRevision: useNamedFoldersStore.getState().revision,
    });
  });
  it("preserves an edit failure without reporting success", async () => {
    vi.mocked(editNamedFolder).mockRejectedValueOnce(new Error("Conflict"));
    await expect(updateNamedFolder(folder, "Writing", "C:/Writing")).rejects.toThrow("Conflict");
    expect(refreshNamedFolders).not.toHaveBeenCalled();
  });
});
