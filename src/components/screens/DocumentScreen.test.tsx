import { invoke } from "@tauri-apps/api/core";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { ActiveDocumentState } from "@/features/document";
import { useSessionStore } from "@/features/session";
import { resetAppStores } from "@/test/fixtures/appStores";
import { renderWithUser, screen } from "@/test/utils/react";
import { DocumentScreen } from "./DocumentScreen";

vi.mock("@/features/editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/editor")>()),
  MilkdownEditor: ({ onOpenMarkdownPath }: { onOpenMarkdownPath: (path: string) => void }) => (
    <button type="button" onClick={() => onOpenMarkdownPath("C:/Notes/missing.md")}>
      Open Markdown link
    </button>
  ),
}));

const activeDocument: ActiveDocumentState = {
  status: "saved",
  path: "C:/Notes/readme.md",
  content: "[Missing](missing.md)",
  isDirty: false,
  lineEnding: "lf",
  metadata: { sizeBytes: 21, modifiedAtUnixMs: 1 },
};

describe("DocumentScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppStores();
    useSessionStore.getState().setActiveDocument(activeDocument);
  });

  it("reports document-specific errors when a Markdown link cannot be opened", async () => {
    vi.mocked(invoke).mockRejectedValue({
      kind: "missingFile",
      path: "C:/Notes/missing.md",
    });

    const { user } = renderWithUser(<DocumentScreen document={activeDocument} />);

    await user.click(screen.getByRole("button", { name: "Open Markdown link" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Markdown file not found.", {
        description: "C:/Notes/missing.md",
      });
    });
  });
});
