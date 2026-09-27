import { isStructurallySame, parse } from "@formatjs/icu-messageformat-parser";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE, SOURCE_MESSAGES } from "./messages";

type Catalog = Record<string, string>;

const LOCALES_DIRECTORY = join(import.meta.dirname, "..", "..", "locales");
const SOURCE_CATALOG: Catalog = SOURCE_MESSAGES;

const readCatalog = (locale: string) =>
  JSON.parse(readFileSync(join(LOCALES_DIRECTORY, `${locale}.json`), "utf8")) as Catalog;

const TRANSLATED_LOCALES = readdirSync(LOCALES_DIRECTORY)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/u, ""))
  .filter((locale) => locale !== SOURCE_LOCALE);

const parseMessage = (message: string) => parse(message, { requiresOtherClause: true });

const findCatalogProblems = (catalog: Catalog) => {
  const problems: string[] = [];

  for (const [id, message] of Object.entries(catalog)) {
    const source = SOURCE_CATALOG[id];

    if (source === undefined) {
      problems.push(`${id}: not in the source catalog`);
      continue;
    }

    try {
      const result = isStructurallySame(parseMessage(source), parseMessage(message));

      if (!result.success) {
        problems.push(`${id}: ${result.error?.message ?? "arguments differ from the source"}`);
      }
    } catch (error) {
      problems.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return problems;
};

describe("message catalogs", () => {
  it.each(Object.entries(SOURCE_CATALOG))("parses source message %s", (_id, message) => {
    expect(() => parseMessage(message)).not.toThrow();
  });

  it.each(TRANSLATED_LOCALES)("keeps the %s catalog aligned with the source", (locale) => {
    expect(findCatalogProblems(readCatalog(locale))).toEqual([]);
  });

  it("reports obsolete ids, renamed arguments, changed argument types, and bad syntax", () => {
    expect(
      findCatalogProblems({
        "preferences.title": "Einstellungen",
        "fileSize.bytes": "{count, plural, one {{size} Byte} other {{size} Bytes}}",
        "fileSize.kilobytes": "{grosse} KB",
        "preferences.language.system": "System ({language, number})",
        "preferences.language.label": "Sprache {",
        "preferences.removed": "Entfernt",
      }),
    ).toEqual([
      expect.stringMatching(/^fileSize\.kilobytes: /u),
      expect.stringMatching(/^preferences\.language\.system: /u),
      expect.stringMatching(/^preferences\.language\.label: /u),
      "preferences.removed: not in the source catalog",
    ]);
  });
});
