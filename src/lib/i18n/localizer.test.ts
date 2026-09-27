// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalization, localizer, resolveLocale, SYSTEM_LANGUAGE } from "./localizer";
import { createPseudoMessage, PSEUDO_LOCALE } from "./pseudoLocale";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
    ["not a tag", ["pt-BR"], "pt-BR"],
  ])("resolves %s with system %j to %s", (preference, system, expected) => {
    expect(resolveLocale(preference, system, available)).toBe(expected);
  });
});

describe("createLocalization", () => {
  it("formats plurals with the locale's plural categories", () => {
    const polish = createLocalization("pl", {
      "fileSize.bytes":
        "{count, plural, one {{size} bajt} few {{size} bajty} other {{size} bajtów}}",
    });

    expect(
      [1, 2, 5, 22].map((count) => polish.t("fileSize.bytes", { count, size: count })),
    ).toEqual(["1 bajt", "2 bajty", "5 bajtów", "22 bajty"]);
  });

  it("formats numbers, relative times, and lists for the locale", () => {
    const german = createLocalization("de", {});
    const now = Date.UTC(2026, 8, 26);

    expect(german.formatNumber(12345.5)).toBe("12.345,5");
    expect(german.formatRelativeTime(now - 2 * DAY, now)).toBe("vorgestern");
    expect(german.formatList(["a.md", "b.md", "c.md"])).toBe("a.md, b.md und c.md");
  });

  it("falls back to English for a missing message", () => {
    const german = createLocalization("de", { "preferences.title": "Einstellungen" });

    expect(german.t("preferences.title")).toBe("Einstellungen");
    expect(german.t("preferences.restoreDefaults")).toBe("Restore defaults");
  });

  it("falls back to English once per message when a translation cannot format", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const german = createLocalization("de", {
      "preferences.language.system": "System ({sprache})",
    });

    expect(german.t("preferences.language.system", { language: "Deutsch" })).toBe(
      "System (Deutsch)",
    );
    expect(german.t("preferences.language.system", { language: "Deutsch" })).toBe(
      "System (Deutsch)",
    );
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 8, 19, 12);
  const english = createLocalization("en");

  it.each([
    [0, "just now"],
    [59 * 1000, "just now"],
    [MINUTE, "1 minute ago"],
    [45 * MINUTE, "45 minutes ago"],
    [HOUR, "1 hour ago"],
    [23 * HOUR, "23 hours ago"],
    [DAY, "yesterday"],
    [6 * DAY, "6 days ago"],
    [7 * DAY, "last week"],
    [20 * DAY, "2 weeks ago"],
    [30 * DAY, "last month"],
    [100 * DAY, "3 months ago"],
    [365 * DAY, "last year"],
    [800 * DAY, "2 years ago"],
  ])("formats %s ms ago as %s", (elapsed, expected) => {
    expect(english.formatRelativeTime(now - elapsed, now)).toBe(expected);
  });

  it("reads a time after now as just now", () => {
    expect(english.formatRelativeTime(now + DAY, now)).toBe("just now");
  });
});

describe("pseudo-locale", () => {
  it("accents and expands text while keeping arguments and plural branches", () => {
    const pseudo = createLocalization(PSEUDO_LOCALE);

    expect(pseudo.t("preferences.title")).toBe("⟦Þŕéƒéŕéñçéš·····⟧");
    expect(pseudo.t("fileSize.bytes", { count: 1, size: "1" })).toBe("⟦1 ƀýţé····⟧");
    expect(pseudo.t("fileSize.bytes", { count: 3, size: "3" })).toBe("⟦3 ƀýţéš····⟧");
    expect(pseudo.t("preferences.language.system", { language: "English" })).toBe(
      "⟦Šýšţéɱ (English)······⟧",
    );
  });

  it("builds a message from each branch of a plural", () => {
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
    expect(document.documentElement.lang).toBe(PSEUDO_LOCALE);
    expect(document.documentElement.dir).toBe("ltr");
    disposable.dispose();
  });

  it("resolves an unshipped language as the system language", () => {
    localizer.setLanguage("ja", [PSEUDO_LOCALE]);

    expect(localizer.current.locale).toBe(PSEUDO_LOCALE);
  });
});
