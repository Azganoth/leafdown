import { MessageFormat } from "messageformat";

const message = new MessageFormat(
  navigator.language,
  ".input {$count :number}\n.match $count\none {{{$count} word}}\n* {{{$count} words}}",
);

document.body.textContent = message.format({ count: Number(location.hash.slice(1)) });
