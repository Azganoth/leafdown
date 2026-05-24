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
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });

    await useSettingsStore.getState().reset();

    expect(useSettingsStore.getState()).toMatchObject({
      theme: "system",
      autoPairBracketsAndQuotes: true,
      softWrapCodeBlocks: false,
    });
  });

  it("updates editor behavior settings", () => {
    useSettingsStore.getState().setAutoPairBracketsAndQuotes(false);
    useSettingsStore.getState().setSoftWrapCodeBlocks(true);

    expect(useSettingsStore.getState()).toMatchObject({
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });
  });
});
