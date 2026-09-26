import { isStructurallySame, parse } from "@formatjs/icu-messageformat-parser";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SHIPPED_LOCALES } from "./localizer";
import { SOURCE_LOCALE, SOURCE_MESSAGES } from "./messages";

const LOCALES_DIRECTORY = join(import.meta.dirname, "..", "..", "locales");
const SHIPPED_COMPLETENESS_FLOOR = 1;

const readCatalog = (locale: string) =>
  JSON.parse(readFileSync(join(LOCALES_DIRECTORY, `${locale}.json`), "utf8")) as Record<
    string,
    string
  >;

const translatedLocales = readdirSync(LOCALES_DIRECTORY)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/u, ""))
  .filter((locale) => locale !== SOURCE_LOCALE);

const checkCatalog = (catalog: Record<string, string>) => {
  const problems: string[] = [];

  for (const [id, message] of Object.entries(catalog)) {
    const source = (SOURCE_MESSAGES as Record<string, string>)[id];

    if (source === undefined) {
      problems.push(`${id}: obsolete, not in the source catalog`);
      continue;
    }

    try {
      const result = isStructurallySame(
        parse(source, { requiresOtherClause: true }),
        parse(message, { requiresOtherClause: true }),
      );

      if (!result.success) {
        problems.push(`${id}: ${result.error?.message ?? "structure differs"}`);
      }
    } catch (error) {
      problems.push(`${id}: ${(error as Error).message}`);
    }
  }

  const completeness =
    Object.keys(catalog).filter((id) => id in SOURCE_MESSAGES).length /
    Object.keys(SOURCE_MESSAGES).length;

  return { completeness, problems };
};

describe("message catalogs", () => {
  it.each(Object.entries(SOURCE_MESSAGES))("parses source message %s", (_id, message) => {
    expect(() => parse(message, { requiresOtherClause: true })).not.toThrow();
  });

  it("keeps every translated catalog aligned with the source", () => {
    const problemsByLocale = Object.fromEntries(
      translatedLocales.map((locale) => [locale, checkCatalog(readCatalog(locale)).problems]),
    );

    expect(problemsByLocale).toEqual(
      Object.fromEntries(translatedLocales.map((locale) => [locale, []])),
    );
  });

  it("holds every shipped locale to the completeness floor", () => {
    const incomplete = SHIPPED_LOCALES.filter(
      (locale) =>
        locale !== SOURCE_LOCALE &&
        checkCatalog(readCatalog(locale)).completeness < SHIPPED_COMPLETENESS_FLOOR,
    );

    expect(incomplete).toEqual([]);
  });

  it("reports obsolete ids, missing arguments, and changed argument types", () => {
    const { completeness, problems } = checkCatalog({
      "command.file.new": "Neu",
      "statusBar.words": "{count, plural, one {# Wort} other {# Wörter}}",
      "statusBar.partialCount": "{selected, number} von {totl}",
      "statusBar.readingTime": "{minutes} Min.",
      "command.file.removed": "Entfernt",
    });

    expect(problems).toEqual([
      expect.stringMatching(/^statusBar\.partialCount: /u),
      expect.stringMatching(/^statusBar\.readingTime: /u),
      "command.file.removed: obsolete, not in the source catalog",
    ]);
    expect(completeness).toBeCloseTo(4 / Object.keys(SOURCE_MESSAGES).length);
  });
});
