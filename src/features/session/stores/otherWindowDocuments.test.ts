import { describe, expect, it } from "vitest";

import { isUnsavedInOtherWindow, useOtherWindowDocumentsStore } from "./otherWindowDocuments";

describe("other windows' documents", () => {
  it("records the unsaved documents of every window but this one", () => {
    useOtherWindowDocumentsStore.getState().applySnapshot(
      {
        revision: 1,
        windows: [
          { windowLabel: "main", documents: [{ path: "C:/Notes/mine.md", unsaved: true }] },
          {
            windowLabel: "window-2",
            documents: [
              { path: "C:/Notes/Draft.md", unsaved: true },
              { path: "C:/Notes/clean.md", unsaved: false },
            ],
          },
        ],
      },
      "main",
    );

    expect(isUnsavedInOtherWindow("c:\\notes\\draft.md")).toBe(true);
    expect(isUnsavedInOtherWindow("C:/Notes/clean.md")).toBe(false);
    expect(isUnsavedInOtherWindow("C:/Notes/mine.md")).toBe(false);
  });

  it("ignores a snapshot older than the one it holds", () => {
    const { applySnapshot } = useOtherWindowDocumentsStore.getState();

    applySnapshot(
      {
        revision: 3,
        windows: [{ windowLabel: "window-2", documents: [] }],
      },
      "main",
    );
    applySnapshot(
      {
        revision: 2,
        windows: [
          { windowLabel: "window-2", documents: [{ path: "C:/Notes/a.md", unsaved: true }] },
        ],
      },
      "main",
    );

    expect(isUnsavedInOtherWindow("C:/Notes/a.md")).toBe(false);
    expect(useOtherWindowDocumentsStore.getState().revision).toBe(3);
  });
});
