const CF_HTML_START_FRAGMENT_MARKER = "<!--StartFragment-->";
const CF_HTML_END_FRAGMENT_MARKER = "<!--EndFragment-->";
const PROSEMIRROR_SLICE_ATTRIBUTE_PATTERN = /<[a-z][^>]*\sdata-pm-slice\s*=/iu;

export const normalizeProseMirrorClipboardHtml = (html: string) => {
  const startMarkerIndex = html.indexOf(CF_HTML_START_FRAGMENT_MARKER);
  const endMarkerIndex = html.indexOf(CF_HTML_END_FRAGMENT_MARKER);

  if (
    startMarkerIndex < 0 ||
    endMarkerIndex < startMarkerIndex + CF_HTML_START_FRAGMENT_MARKER.length ||
    startMarkerIndex !== html.lastIndexOf(CF_HTML_START_FRAGMENT_MARKER) ||
    endMarkerIndex !== html.lastIndexOf(CF_HTML_END_FRAGMENT_MARKER)
  ) {
    return html;
  }

  const fragment = html.slice(
    startMarkerIndex + CF_HTML_START_FRAGMENT_MARKER.length,
    endMarkerIndex,
  );

  return PROSEMIRROR_SLICE_ATTRIBUTE_PATTERN.test(fragment) ? fragment : html;
};
