import { IntlMessageFormat } from "intl-messageformat";

const message = new IntlMessageFormat(
  "{count, plural, one {# word} other {# words}}",
  navigator.language,
);

document.body.textContent = String(message.format({ count: Number(location.hash.slice(1)) }));
