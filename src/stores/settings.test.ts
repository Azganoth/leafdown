import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultSettings } from "@/test/utils/stores";
import { useSettingsStore } from "./settings";

describe("settings store", () => {
  beforeEach(() => {
    setDefaultSettings();
  });

  it("resets appearance settings while restoring the default override path", async () => {
    setDefaultSettings({
      theme: "dark",
    });

    await useSettingsStore.getState().reset();

    expect(useSettingsStore.getState()).toMatchObject({
      theme: "system",
    });
  });
});
