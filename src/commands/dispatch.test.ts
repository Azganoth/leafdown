import { beforeEach, describe, expect, it, vi } from "vitest";

import { documentEditorBridge } from "@/features/session";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";

import { APPLICATION_COMMANDS } from "./application";
import { APP_COMMAND_IDS, dispatchAppCommand } from "./dispatch";

vi.mock("@/features/session", async (importOriginal) => {
  const session = await importOriginal<typeof import("@/features/session")>();

  return {
    ...session,
    documentEditorBridge: {
      ...session.documentEditorBridge,
      runCommand: vi.fn(),
    },
  };
});

describe("app command dispatch", () => {
  beforeEach(() => {
    vi.mocked(documentEditorBridge.runCommand).mockReset();
  });

  it("routes editor commands to the active document editor bridge", async () => {
    vi.mocked(documentEditorBridge.runCommand).mockReturnValue(true);

    const dispatched = await dispatchAppCommand(
      "edit.undo",
      createAppCommandContext({ activeDocument: createSavedDocument() }),
    );

    expect(dispatched).toBe(true);
    expect(documentEditorBridge.runCommand).toHaveBeenCalledWith(
      TEST_MARKDOWN_FILE_PATH,
      "edit.undo",
    );
  });

  it("returns the editor bridge result for editor commands", async () => {
    vi.mocked(documentEditorBridge.runCommand).mockReturnValue(false);

    expect(
      await dispatchAppCommand(
        "edit.undo",
        createAppCommandContext({ activeDocument: createSavedDocument() }),
      ),
    ).toBe(false);
  });

  it("ignores editor commands when there is no active document", async () => {
    const dispatched = await dispatchAppCommand("edit.undo", createAppCommandContext());

    expect(dispatched).toBe(false);
    expect(documentEditorBridge.runCommand).not.toHaveBeenCalled();
  });

  it("runs application commands", async () => {
    const originalRun = APPLICATION_COMMANDS["help.about"].run;
    const run = vi.fn();

    APPLICATION_COMMANDS["help.about"].run = run;

    try {
      expect(await dispatchAppCommand("help.about", createAppCommandContext())).toBe(true);
      expect(run).toHaveBeenCalledOnce();
    } finally {
      APPLICATION_COMMANDS["help.about"].run = originalRun;
    }
  });

  it("registers each app command ID once", () => {
    expect(new Set(APP_COMMAND_IDS).size).toBe(APP_COMMAND_IDS.length);
  });
});
