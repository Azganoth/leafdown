import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalization, localizer, resolveLocale, SYSTEM_LANGUAGE } from "./localizer";
import { createPseudoMessage, PSEUDO_LOCALE } from "./messages";

afterEach(() => {
  localizer.setLanguage("en", []);
});

describe("resolveLocale", () => {
  const available = ["en", "de", "pt-BR", "zh-Hant"];

  it.each([
    [SYSTEM_LANGUAGE, ["de-AT", "en-US"], "de"],
    [SYSTEM_LANGUAGE, ["fr-FR", "en-GB"], "en"],
    [SYSTEM_LANGUAGE, ["pt-br"], "pt-BR"],
    [SYSTEM_LANGUAGE, ["pt-PT"], "en"],
    [SYSTEM_LANGUAGE, ["zh-TW"], "zh-Hant"],
    [SYSTEM_LANGUAGE, ["zh-CN"], "en"],
    [SYSTEM_LANGUAGE, ["not a tag", "de"], "de"],
    [SYSTEM_LANGUAGE, [], "en"],
    ["pt-BR", ["de"], "pt-BR"],
    ["DE-de", ["pt-BR"], "de"],
    ["ja", ["de"], "de"],
    ["ja", ["fr"], "en"],
  ])("resolves %s with system %j to %s", (preference, system, expected) => {
    expect(resolveLocale(preference, system, available)).toBe(expected);
  });
});

describe("createLocalization", () => {
  it("formats plurals with the locale's plural categories", () => {
    const polish = createLocalization("pl", {
      "statusBar.words":
        "{count, plural, one {# słowo} few {# słowa} many {# słów} other {# słowa}}",
    });

    expect([1, 2, 5, 22, 1.5].map((count) => polish.t("statusBar.words", { count }))).toEqual([
      "1 słowo",
      "2 słowa",
      "5 słów",
      "22 słowa",
      "1,5 słowa",
    ]);
  });

  it("formats numbers, relative times, and lists for the locale", () => {
    const german = createLocalization("de", {});
    const now = Date.UTC(2026, 8, 26);

    expect(german.formatNumber(12345.5)).toBe("12.345,5");
    expect(german.formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, now)).toBe("vorgestern");
    expect(german.formatList(["a.md", "b.md", "c.md"])).toBe("a.md, b.md und c.md");
  });

  it("falls back to English for a missing message", () => {
    const german = createLocalization("de", { "command.file.new": "Neu" });

    expect(german.t("command.file.new")).toBe("Neu");
    expect(german.t("command.file.save")).toBe("Save");
  });

  it("falls back to English when a translation cannot format", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const german = createLocalization("de", {
      "statusBar.lineEnding": "Zeilenende: {lineEndingKind}",
    });

    expect(german.t("statusBar.lineEnding", { lineEnding: "CRLF" })).toBe("Line ending: CRLF");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("pseudo-locale", () => {
  it("accents and expands text while keeping arguments and plural branches", () => {
    const pseudo = createLocalization(PSEUDO_LOCALE);

    expect(pseudo.t("command.file.new")).toBe("⟦Ñéŵ··⟧");
    expect(pseudo.t("statusBar.words", { count: 1 })).toBe("⟦1 ŵöŕð····⟧");
    expect(pseudo.t("statusBar.words", { count: 3 })).toBe("⟦3 ŵöŕðš····⟧");
    expect(pseudo.t("statusBar.lineEnding", { lineEnding: "CRLF" })).toBe(
      "⟦Ļîñé éñðîñĝ: CRLF·······⟧",
    );
  });

  it("builds a message from every source message", () => {
    expect(createPseudoMessage("{count, plural, one {# a} other {# b}}")).toHaveLength(3);
  });
});

describe("localizer", () => {
  it("notifies once per locale change and sets the document language", () => {
    const listener = vi.fn();
    const disposable = localizer.onDidChange(listener);

    localizer.setLanguage(PSEUDO_LOCALE, []);
    localizer.setLanguage(PSEUDO_LOCALE, []);

    expect(listener).toHaveBeenCalledOnce();
    expect(localizer.current.locale).toBe(PSEUDO_LOCALE);
    disposable.dispose();
  });
});
