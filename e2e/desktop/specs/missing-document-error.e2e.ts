import { $, expect } from "@wdio/globals";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

describe("desktop backend error propagation", () => {
  it("surfaces a real missing-file IPC error with structured diagnostics", async () => {
    const { missingDocumentPath } = await getDesktopE2ERunContext();

    await openRecentPath(missingDocumentPath);

    const toast = $('[data-slot="toast"][data-type="error"]');
    await expect(toast).toHaveText(expect.stringContaining("Markdown file not found."));
    await expect(toast).toHaveText(expect.stringContaining(missingDocumentPath));

    await waitForDiagnosticRecord(
      (record) =>
        record.event === "operationFailed" &&
        record.feature === "document" &&
        record.operation === "openMarkdownDocument" &&
        record.errorKind === "missingFile" &&
        record.path === missingDocumentPath,
      "missing-document-diagnostic.json",
    );
  });
});
