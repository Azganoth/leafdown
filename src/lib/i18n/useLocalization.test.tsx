// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { act, render, screen } from "@/test/utils/react";

// oxlint-disable-next-line no-restricted-imports -- The test shows why components must not call it.
import { localizer, t } from "./localizer";
import { PSEUDO_LOCALE } from "./pseudoLocale";
import { useLocalization } from "./useLocalization";

function SnapshotLabel() {
  const { t: translate } = useLocalization();

  return <span data-testid="snapshot">{translate("preferences.title")}</span>;
}

function ModuleLabel() {
  useLocalization();

  return <span data-testid="module">{t("preferences.title")}</span>;
}

afterEach(() => {
  localizer.setLanguage("en", []);
});

describe("useLocalization", () => {
  it("re-translates a component that reads t from the snapshot", () => {
    render(<SnapshotLabel />);
    expect(screen.getByTestId("snapshot")).toHaveTextContent("Preferences");

    act(() => localizer.setLanguage(PSEUDO_LOCALE, []));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("⟦Þŕéƒéŕéñçéš·····⟧");

    act(() => localizer.setLanguage("en", []));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("Preferences");
  });

  it("keeps a module-level t call cached by React Compiler across a switch", () => {
    render(<ModuleLabel />);

    act(() => localizer.setLanguage(PSEUDO_LOCALE, []));
    expect(screen.getByTestId("module")).toHaveTextContent("Preferences");
  });
});
