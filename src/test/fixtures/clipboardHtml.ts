export const START_FRAGMENT_MARKER = "<!--StartFragment-->";
export const END_FRAGMENT_MARKER = "<!--EndFragment-->";

// Windows delivers clipboard HTML as CF_HTML: a full document with the copied range
// delimited by fragment markers and padded with the whitespace real sources emit.
export const wrapCfHtmlFragment = (fragment: string) =>
  `<html>\r\n<body>\r\n  \r\n${START_FRAGMENT_MARKER}${fragment}${END_FRAGMENT_MARKER}\r\n  \r\n</body>\r\n</html>`;
