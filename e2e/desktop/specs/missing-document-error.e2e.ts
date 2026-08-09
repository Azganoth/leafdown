import { $, expect } from "@wdio/globals";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

describe("desktop backend error propagation", () => {
  it("records a real missing-file IPC error as a structured frontend diagnostic", async () => {
    const { missingDocumentPath } = await getDesktopE2ERunContext();

    await openRecentPath(missingDocumentPath);

    await waitForDiagnosticRecord(
      (record) =>
        record.event === "operationFailed" &&
        record.feature === "document" &&
        record.operation === "openMarkdownDocument" &&
        record.errorKind === "missingFile" &&
        record.path === missingDocumentPath,
    );

    await expect($('[contenteditable="true"]')).not.toExist();
  });
});
