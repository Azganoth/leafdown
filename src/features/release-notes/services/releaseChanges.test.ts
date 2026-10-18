import { describe, expect, it } from "vitest";

import { getReleaseChangeGroups, splitLeadSentence } from "./releaseChanges";

describe("release changes", () => {
  it("reads each group's entries, joining wrapped lines, and keeps other content", () => {
    expect(
      getReleaseChangeGroups(
        [
          "### Added",
          "",
          "- First entry.",
          "- Second entry that",
          "  wraps onto a second line.",
          "",
          "### Fixed",
          "",
          "A note before the list.",
          "",
          "- Only fix.",
          "",
          "### Removed",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      {
        name: "Added",
        entries: ["First entry.", "Second entry that wraps onto a second line."],
        rest: "",
      },
      { name: "Fixed", entries: ["Only fix."], rest: "A note before the list." },
    ]);
  });

  it("splits an entry after its first sentence", () => {
    expect(splitLeadSentence("Save faster. The file is written at once.")).toEqual([
      "Save faster.",
      "The file is written at once.",
    ]);
    expect(splitLeadSentence("Only one sentence.")).toEqual(["Only one sentence.", ""]);
  });

  it("does not end a sentence inside code or a link destination", () => {
    expect(
      splitLeadSentence("Fold with `Ctrl+.` and read [the guide](docs/a.b. c.md). Then more."),
    ).toEqual(["Fold with `Ctrl+.` and read [the guide](docs/a.b. c.md).", "Then more."]);
  });

  it("leaves an entry whole when its first sentence would cut through markup", () => {
    expect(splitLeadSentence("Choose **Help. Then check** for updates.")).toEqual([
      "",
      "Choose **Help. Then check** for updates.",
    ]);
  });
});
