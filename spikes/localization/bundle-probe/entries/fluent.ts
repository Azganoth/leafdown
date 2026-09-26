import { FluentBundle, FluentResource } from "@fluent/bundle";

const bundle = new FluentBundle(navigator.language);
bundle.addResource(
  new FluentResource(
    "words = { $count ->\n    [one] { $count } word\n   *[other] { $count } words\n}\n",
  ),
);

const message = bundle.getMessage("words");
document.body.textContent = message?.value
  ? bundle.formatPattern(message.value, { count: Number(location.hash.slice(1)) })
  : "";
