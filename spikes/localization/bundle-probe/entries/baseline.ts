const locale = navigator.language;
const plural = new Intl.PluralRules(locale);
const number = new Intl.NumberFormat(locale);
const WORDS = { one: "{count} word", other: "{count} words" } as Record<string, string>;

const format = (count: number) =>
  (WORDS[plural.select(count)] ?? WORDS.other).replace("{count}", number.format(count));

document.body.textContent = format(Number(location.hash.slice(1)));
