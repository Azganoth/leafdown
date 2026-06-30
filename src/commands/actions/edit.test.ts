import { describe, expect, it } from "vitest";

import { useSessionStore } from "@/features/session";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";

import { setCrlfLineEnding } from "./edit";

describe("edit actions", () => {
  it("routes document state commands to their feature APIs", () => {
    const activeDocument = createSavedDocument();

    setDefaultSession({ activeDocument });

    setCrlfLineEnding(createAppCommandContext({ activeDocument }));

    expect(useSessionStore.getState().activeDocument?.lineEnding).toBe("crlf");
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(true);
  });
});
