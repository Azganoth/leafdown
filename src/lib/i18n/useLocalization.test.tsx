// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { act, render, screen } from "@/test/utils/react";

import { localizer, t } from "./localizer";
import { PSEUDO_LOCALE } from "./messages";
import { useLocalization } from "./useLocalization";

function SnapshotLabel() {
  const { t: translate } = useLocalization();

  return <span data-testid="snapshot">{translate("command.file.save")}</span>;
}

function ModuleLabel() {
  useLocalization();

  return <span data-testid="module">{t("command.file.save")}</span>;
}

afterEach(() => {
  localizer.setLanguage("en", []);
});

describe("useLocalization", () => {
  it("re-translates a component that reads t from the snapshot", () => {
    render(<SnapshotLabel />);
    expect(screen.getByTestId("snapshot").textContent).toBe("Save");

    act(() => localizer.setLanguage(PSEUDO_LOCALE, []));
    expect(screen.getByTestId("snapshot").textContent).toBe("⟦Šáṽé··⟧");
    expect(document.documentElement.lang).toBe(PSEUDO_LOCALE);

    act(() => localizer.setLanguage("en", []));
    expect(screen.getByTestId("snapshot").textContent).toBe("Save");
  });

  it("keeps the module-level t cached by React Compiler across a switch", () => {
    expect(ModuleLabel.toString()).toContain("$[0]");
    render(<ModuleLabel />);

    act(() => localizer.setLanguage(PSEUDO_LOCALE, []));
    expect(screen.getByTestId("module").textContent).toBe("Save");
  });
});
