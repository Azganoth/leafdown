import { describe, expect, it } from "vitest";

import { useCommandUIStore } from "../stores/commandUi";
import { openAbout } from "./help";

describe("help actions", () => {
  it("opens about dialog through UI store", () => {
    useCommandUIStore.getState().setAboutOpen(false);
    openAbout();
    expect(useCommandUIStore.getState().aboutOpen).toBe(true);
  });
});
