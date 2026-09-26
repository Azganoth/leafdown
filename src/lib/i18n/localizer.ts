import { IntlMessageFormat, type PrimitiveType } from "intl-messageformat";

import { SignalSource } from "../signal";
import {
  createPseudoCatalog,
  PSEUDO_LOCALE,
  SOURCE_LOCALE,
  SOURCE_MESSAGES,
  type MessageCatalog,
  type MessageId,
  type MessageSource,
} from "./messages";

export type MessageValues = Record<string, PrimitiveType>;
export type Translate = (id: MessageId, values?: MessageValues) => string;

export const SYSTEM_LANGUAGE = "system";

export interface Localization {
  readonly locale: string;
  readonly t: Translate;
  readonly formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  readonly formatRelativeTime: (timestamp: number, now: number) => string;
  readonly formatList: (items: readonly string[]) => string;
}

const BUNDLED_CATALOGS = import.meta.glob<MessageCatalog>("../../locales/*.json", {
  eager: true,
  import: "default",
});

// A catalog in src/locales is exposed only once listed here; the catalog check holds each
// listed locale to the completeness floor.
export const SHIPPED_LOCALES: readonly string[] = [SOURCE_LOCALE];

const getBundledCatalog = (locale: string): MessageCatalog =>
  BUNDLED_CATALOGS[`../../locales/${locale}.json`] ?? {};

const loadCatalog = (locale: string): MessageCatalog =>
  import.meta.env.DEV && locale === PSEUDO_LOCALE
    ? createPseudoCatalog()
    : getBundledCatalog(locale);

export const getAvailableLocales = (): readonly string[] =>
  import.meta.env.DEV ? [...SHIPPED_LOCALES, PSEUDO_LOCALE] : SHIPPED_LOCALES;

const canonicalize = (tag: string) => {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
};

// RFC 4647 lookup, after likely-subtag maximization so "zh-TW" can reach "zh-Hant".
const getLookupCandidates = (tag: string) => {
  const locale = new Intl.Locale(tag);
  const maximized = locale.maximize();
  const candidates = [locale.toString()];

  for (const base of [maximized.toString(), locale.minimize().toString()]) {
    const subtags = base.split("-");

    while (subtags.length > 0) {
      candidates.push(subtags.join("-"));
      subtags.pop();
    }
  }

  return [...new Set(candidates)];
};

export const resolveLocale = (
  preference: string,
  systemLanguages: readonly string[],
  availableLocales: readonly string[] = getAvailableLocales(),
): string => {
  const available = new Map(availableLocales.map((locale) => [locale.toLowerCase(), locale]));
  const requested = preference === SYSTEM_LANGUAGE ? systemLanguages : [preference];

  for (const tag of requested) {
    const canonical = canonicalize(tag);

    if (!canonical) {
      continue;
    }

    for (const candidate of getLookupCandidates(canonical)) {
      const match = available.get(candidate.toLowerCase());

      if (match) {
        return match;
      }
    }
  }

  return preference === SYSTEM_LANGUAGE
    ? SOURCE_LOCALE
    : resolveLocale(SYSTEM_LANGUAGE, systemLanguages, availableLocales);
};

const RELATIVE_TIME_UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
] as const satisfies readonly (readonly [Intl.RelativeTimeFormatUnit, number])[];

const reportedFormatFailures = new Set<string>();

const reportFormatFailure = (locale: string, id: MessageId, error: unknown) => {
  const key = `${locale}\n${id}`;

  if (reportedFormatFailures.has(key)) {
    return;
  }

  reportedFormatFailures.add(key);
  console.warn(`Message "${id}" failed to format in ${locale}; using English.`, error);
};

const getFormat = (
  cache: Map<MessageId, IntlMessageFormat>,
  id: MessageId,
  source: MessageSource,
  formatLocale: string,
) => {
  let format = cache.get(id);

  if (!format) {
    format = new IntlMessageFormat(source, formatLocale);
    cache.set(id, format);
  }

  return format;
};

export const createLocalization = (locale: string, catalog = loadCatalog(locale)): Localization => {
  const formats = new Map<MessageId, IntlMessageFormat>();
  const sourceFormats = new Map<MessageId, IntlMessageFormat>();
  const numberFormat = new Intl.NumberFormat(locale);
  const relativeTimeFormat = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const listFormat = new Intl.ListFormat(locale, { type: "conjunction" });

  const formatSource = (id: MessageId, values?: MessageValues) =>
    String(getFormat(sourceFormats, id, SOURCE_MESSAGES[id], SOURCE_LOCALE).format(values));

  const t: Translate = (id, values) => {
    const translated = catalog[id];

    if (translated === undefined) {
      return formatSource(id, values);
    }

    try {
      return String(getFormat(formats, id, translated, locale).format(values));
    } catch (error) {
      reportFormatFailure(locale, id, error);
      return formatSource(id, values);
    }
  };

  return {
    locale,
    t,
    formatNumber: (value, options) =>
      options ? new Intl.NumberFormat(locale, options).format(value) : numberFormat.format(value),
    formatRelativeTime: (timestamp, now) => {
      // A clock set back after the time was recorded would otherwise read as the future.
      const elapsed = Math.max(0, now - timestamp);

      for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
        if (elapsed >= unitMs) {
          return relativeTimeFormat.format(-Math.floor(elapsed / unitMs), unit);
        }
      }

      return t("time.justNow");
    },
    formatList: (items) => listFormat.format(items),
  };
};

const changes = new SignalSource<Localization>();
let current = createLocalization(SOURCE_LOCALE);

const applyDocumentLanguage = (locale: string) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = new Intl.Locale(locale).getTextInfo?.().direction ?? "ltr";
};

export const localizer = {
  get current() {
    return current;
  },
  onDidChange: changes.signal,
  setLanguage(preference: string, systemLanguages: readonly string[] = getSystemLanguages()) {
    const locale = resolveLocale(preference, systemLanguages);

    if (locale === current.locale) {
      return;
    }

    current = createLocalization(locale);
    applyDocumentLanguage(locale);
    changes.notify(current);
  },
};

export const getSystemLanguages = (): readonly string[] =>
  typeof navigator === "undefined" ? [] : navigator.languages;

export const t: Translate = (id, values) => current.t(id, values);

export const getLanguageDisplayName = (locale: string, displayLocale = locale) =>
  new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
