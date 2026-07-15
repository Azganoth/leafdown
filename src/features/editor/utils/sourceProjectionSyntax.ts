export const SUPPORTED_PROJECTION_MARK_NAMES = [
  "strong",
  "emphasis",
  "strike_through",
  "inlineCode",
] as const;

export type ProjectionEditKind = "delete" | "insert" | "replace";
export type ProjectionDelimiterSide = "closing" | "opening";
export type ProjectionMarkName = (typeof SUPPORTED_PROJECTION_MARK_NAMES)[number];
export type ProjectionMarkerCharacter = "*" | "_" | "~" | "`";

export interface ProjectionMarkDescriptor {
  attrs: Record<string, unknown>;
  marker: ProjectionMarkerCharacter;
  markName: ProjectionMarkName;
}

export interface ProjectionDelimiterBounds {
  closing: string;
  contentFrom: number;
  contentTo: number;
  marker: ProjectionMarkerCharacter;
  opening: string;
}

export interface ProjectionSourceContentBounds {
  from: number;
  to: number;
}

export interface ProjectionEditContext {
  delimiterSide: ProjectionDelimiterSide | null;
  kind: ProjectionEditKind;
}

export type ProjectionReplacement =
  | {
      marks: ProjectionMarkDescriptor[];
      text: string;
      type: "marked";
    }
  | {
      text: string;
      type: "literal";
    };

export type ParsedProjectionSource =
  | {
      closing: string;
      marks: ProjectionMarkDescriptor[];
      opening: string;
      text: string;
      type: "mark";
    }
  | { text: string; type: "literal" };

interface NestedProjectionSourceInput {
  closing: string;
  emphasisMarker: string;
  opening: string;
  strongMarker: string;
  text: string;
}

export const parseProjectionSource = (source: string): ParsedProjectionSource => {
  const inlineCode = parseInlineCodeProjectionSource(source);

  if (inlineCode) {
    return inlineCode;
  }

  const strikethrough = parseStrikethroughProjectionSource(source);

  if (strikethrough) {
    return strikethrough;
  }

  const delimited = parseDelimitedProjectionSource(source);

  const nested =
    delimited && shouldParseAsNestedProjection(delimited)
      ? parseNestedProjectionSource(source)
      : null;
  return nested ?? delimited ?? { text: source, type: "literal" };
};

export const normalizeProjectionSourceAfterEdit = (
  source: string,
  context: ProjectionEditContext,
) => getNormalizedDelimitedProjectionSource(source, context) ?? source;

export const getProjectionReplacement = (parsed: ParsedProjectionSource): ProjectionReplacement =>
  parsed.type === "mark"
    ? {
        marks: parsed.marks,
        text: parsed.text,
        type: "marked",
      }
    : {
        text: parsed.text,
        type: "literal",
      };

const getNormalizedDelimitedProjectionSource = (source: string, context: ProjectionEditContext) => {
  const bounds = getProjectionDelimiterBounds(source);

  if (!bounds || !bounds.closing || bounds.contentFrom >= bounds.contentTo) {
    return null;
  }

  if (bounds.marker === "`") {
    if (context.kind !== "insert" || context.delimiterSide !== null) {
      return null;
    }

    const markerLength = Math.min(bounds.opening.length, bounds.closing.length);
    const text = normalizeInlineCodeText(source.slice(markerLength, source.length - markerLength));

    return createInlineCodeProjectionSource(text);
  }

  const markerCount = getNormalizedMarkerCount(bounds, context);

  if (markerCount < 1 || markerCount > 3) {
    return null;
  }

  const normalizedMarker = bounds.marker.repeat(markerCount);
  const text = source.slice(bounds.contentFrom, bounds.contentTo);

  return `${normalizedMarker}${text}${normalizedMarker}`;
};

export const getProjectionDelimiterBounds = (source: string): ProjectionDelimiterBounds | null => {
  const openingMatch = /^(?<opening>\*+|_+|~+|`+)/u.exec(source);

  if (!openingMatch?.groups) {
    return null;
  }

  const opening = openingMatch.groups.opening;
  const marker = getMarkerCharacterFromSource(opening);
  const closingMatch = /(\*+|_+|~+|`+)$/u.exec(source.slice(opening.length));
  const closing = closingMatch?.[0] ?? "";

  if (closing && getMarkerCharacterFromSource(closing) !== marker) {
    return null;
  }

  return {
    closing,
    contentFrom: opening.length,
    contentTo: source.length - closing.length,
    marker,
    opening,
  };
};

export const isProjectionMarkerText = (text: string) => /^[*_~`]+$/u.test(text);

export const isProjectionMarkName = (markName: string): markName is ProjectionMarkName =>
  SUPPORTED_PROJECTION_MARK_NAMES.includes(markName as ProjectionMarkName);

export const areProjectionMarksEqual = (
  left: ProjectionMarkDescriptor[],
  right: ProjectionMarkDescriptor[],
) =>
  left.length === right.length &&
  left.every(
    (leftMark, index) =>
      leftMark.markName === right[index]?.markName && leftMark.marker === right[index]?.marker,
  );

export const getSourceMarkers = (marks: ProjectionMarkDescriptor[], text = "") => {
  const inlineCode = marks.find((mark) => mark.markName === "inlineCode");

  if (inlineCode) {
    const marker = getInlineCodeMarker(text);

    return { closing: marker, opening: marker };
  }

  const strikethrough = marks.find((mark) => mark.markName === "strike_through");
  const nestedMarks = marks.filter((mark) => mark.markName !== "strike_through");
  const nestedMarkers = getSourceMarkersWithoutStrikethrough(nestedMarks);

  if (strikethrough) {
    const strikethroughMarker = getSourceMarker("strike_through", strikethrough.marker);

    return {
      closing: `${nestedMarkers.closing}${strikethroughMarker}`,
      opening: `${strikethroughMarker}${nestedMarkers.opening}`,
    };
  }

  return nestedMarkers;
};

export const createProjectionSource = (marks: ProjectionMarkDescriptor[], text: string) => {
  if (marks.some((mark) => mark.markName === "inlineCode")) {
    return createInlineCodeProjectionSource(text);
  }

  const sourceMarkers = getSourceMarkers(marks, text);

  return `${sourceMarkers.opening}${text}${sourceMarkers.closing}`;
};

export const getProjectionSourceContentBounds = (source: string): ProjectionSourceContentBounds => {
  const parsed = parseProjectionSource(source);

  if (parsed.type === "literal") {
    return { from: 0, to: source.length };
  }

  const isInlineCode = parsed.marks.some((mark) => mark.markName === "inlineCode");
  const delimiterBounds = getProjectionDelimiterBounds(source);

  if (!isInlineCode || !delimiterBounds) {
    return {
      from: parsed.opening.length,
      to: source.length - parsed.closing.length,
    };
  }

  const text = source.slice(delimiterBounds.contentFrom, delimiterBounds.contentTo);
  const paddingLength = hasNormalizableInlineCodePadding(text) ? 1 : 0;

  return {
    from: delimiterBounds.contentFrom + paddingLength,
    to: delimiterBounds.contentTo - paddingLength,
  };
};

const getSourceMarkersWithoutStrikethrough = (marks: ProjectionMarkDescriptor[]) => {
  const strong = marks.find((mark) => mark.markName === "strong");
  const emphasis = marks.find((mark) => mark.markName === "emphasis");

  if (strong && emphasis) {
    const strongMarker = getSourceMarker("strong", strong.marker);
    const emphasisMarker = getSourceMarker("emphasis", emphasis.marker);

    return {
      closing: `${strongMarker}${emphasisMarker}`,
      opening: `${emphasisMarker}${strongMarker}`,
    };
  }

  const mark = marks[0];
  const marker = mark ? getSourceMarker(mark.markName, mark.marker) : "";

  return {
    closing: marker,
    opening: marker,
  };
};

const parseDelimitedProjectionSource = (source: string): ParsedProjectionSource | null => {
  const match = /^(?<opening>\*{1,3}|_{1,3})(?<text>.+?)(?<closing>\*{1,3}|_{1,3})$/u.exec(source);

  if (!match?.groups) {
    return null;
  }

  const { opening, text, closing } = match.groups;

  if (
    opening.length !== closing.length ||
    getMarkerCharacterFromSource(opening) !== getMarkerCharacterFromSource(closing)
  ) {
    return null;
  }

  const marks = getProjectionMarksForMarkerCount(opening.length, opening);

  if (!marks) {
    return null;
  }

  return {
    closing,
    marks,
    opening,
    text,
    type: "mark",
  };
};

const parseStrikethroughProjectionSource = (source: string): ParsedProjectionSource | null => {
  const text = getWrappedText(source, "~~", "~~");

  if (text === null) {
    return null;
  }

  const nested = parseProjectionSource(text);
  const marks = [
    createProjectionMarkDescriptorFromSource("strike_through", "~~"),
    ...(nested.type === "mark" ? nested.marks : []),
  ];

  return {
    closing: `${nested.type === "mark" ? nested.closing : ""}~~`,
    marks,
    opening: `~~${nested.type === "mark" ? nested.opening : ""}`,
    text: nested.type === "mark" ? nested.text : text,
    type: "mark",
  };
};

const parseInlineCodeProjectionSource = (source: string): ParsedProjectionSource | null => {
  const opening = /^`+/u.exec(source)?.[0];
  const closing = /`+$/u.exec(source)?.[0];

  if (!opening || !closing || opening.length !== closing.length) {
    return null;
  }

  const text = source.slice(opening.length, source.length - closing.length);

  if (!text || hasMatchingBacktickRun(text, opening.length)) {
    return null;
  }

  return {
    closing,
    marks: [createProjectionMarkDescriptorFromSource("inlineCode", opening)],
    opening,
    text: normalizeInlineCodeText(text),
    type: "mark",
  };
};

const hasMatchingBacktickRun = (text: string, length: number) =>
  Array.from(text.matchAll(/`+/gu)).some((match) => match[0].length === length);

const normalizeInlineCodeText = (text: string) => {
  const normalizedLineEndings = text.replaceAll(/\r\n?|\n/gu, " ");

  return hasNormalizableInlineCodePadding(normalizedLineEndings)
    ? normalizedLineEndings.slice(1, -1)
    : normalizedLineEndings;
};

const hasNormalizableInlineCodePadding = (text: string) =>
  text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "";

const createInlineCodeProjectionSource = (text: string) => {
  const marker = getInlineCodeMarker(text);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";

  return `${marker}${padding}${text}${padding}${marker}`;
};

const shouldParseAsNestedProjection = (parsed: ParsedProjectionSource) => {
  if (parsed.type !== "mark" || parsed.marks.length !== 1) {
    return false;
  }

  const nestedMarkName = parsed.marks[0].markName === "strong" ? "emphasis" : "strong";

  return getSourceMarkerOptions(nestedMarkName).some(
    (marker) => getWrappedText(parsed.text, marker, marker) !== null,
  );
};

const getNormalizedMarkerCount = (
  bounds: ProjectionDelimiterBounds,
  context: ProjectionEditContext,
) => {
  if (bounds.marker === "~" || bounds.marker === "`") {
    return 0;
  }

  if (context.delimiterSide === "opening") {
    return Math.min(bounds.opening.length, 3);
  }

  if (context.delimiterSide === "closing") {
    return Math.min(bounds.closing.length, 3);
  }

  return context.kind === "insert"
    ? Math.min(Math.max(bounds.opening.length, bounds.closing.length), 3)
    : Math.min(bounds.opening.length, bounds.closing.length, 3);
};

const getProjectionMarksForMarkerCount = (markerCount: number, markerSyntax: string) => {
  switch (markerCount) {
    case 1:
      return [createProjectionMarkDescriptorFromSource("emphasis", markerSyntax)];

    case 2:
      return [createProjectionMarkDescriptorFromSource("strong", markerSyntax)];

    case 3:
      return [
        createProjectionMarkDescriptorFromSource("strong", markerSyntax),
        createProjectionMarkDescriptorFromSource("emphasis", markerSyntax),
      ];

    default:
      return null;
  }
};

const parseNestedProjectionSource = (source: string): ParsedProjectionSource | null => {
  for (const strongMarker of getSourceMarkerOptions("strong")) {
    for (const emphasisMarker of getSourceMarkerOptions("emphasis")) {
      const strongOuterText = getWrappedText(
        source,
        `${strongMarker}${emphasisMarker}`,
        `${emphasisMarker}${strongMarker}`,
      );

      if (strongOuterText !== null) {
        return createNestedProjectionSource({
          closing: `${emphasisMarker}${strongMarker}`,
          emphasisMarker,
          opening: `${strongMarker}${emphasisMarker}`,
          strongMarker,
          text: strongOuterText,
        });
      }

      const emphasisOuterText = getWrappedText(
        source,
        `${emphasisMarker}${strongMarker}`,
        `${strongMarker}${emphasisMarker}`,
      );

      if (emphasisOuterText !== null) {
        return createNestedProjectionSource({
          closing: `${strongMarker}${emphasisMarker}`,
          emphasisMarker,
          opening: `${emphasisMarker}${strongMarker}`,
          strongMarker,
          text: emphasisOuterText,
        });
      }
    }
  }

  return null;
};

const createNestedProjectionSource = ({
  closing,
  emphasisMarker,
  opening,
  strongMarker,
  text,
}: NestedProjectionSourceInput): ParsedProjectionSource => ({
  closing,
  marks: [
    createProjectionMarkDescriptorFromSource("strong", strongMarker),
    createProjectionMarkDescriptorFromSource("emphasis", emphasisMarker),
  ],
  opening,
  text,
  type: "mark",
});

const getWrappedText = (source: string, opening: string, closing: string) => {
  if (
    source.length <= opening.length + closing.length ||
    !source.startsWith(opening) ||
    !source.endsWith(closing)
  ) {
    return null;
  }

  return source.slice(opening.length, source.length - closing.length);
};

export const createProjectionMarkDescriptor = (
  markName: ProjectionMarkName,
  attrs: Record<string, unknown> = {},
): ProjectionMarkDescriptor => {
  const marker = getMarkerCharacterFromAttrs(markName, attrs);

  return {
    attrs: { ...attrs, marker },
    marker,
    markName,
  };
};

const createProjectionMarkDescriptorFromSource = (
  markName: ProjectionMarkName,
  markerSyntax: string,
): ProjectionMarkDescriptor => {
  const marker = getMarkerCharacterFromSource(markerSyntax);

  return {
    attrs: { marker },
    marker,
    markName,
  };
};

const getSourceMarkerOptions = (markName: ProjectionMarkName) =>
  markName === "strong"
    ? (["**", "__"] as const)
    : markName === "strike_through"
      ? (["~~"] as const)
      : markName === "inlineCode"
        ? (["`"] as const)
        : (["*", "_"] as const);

const getMarkerCharacterFromSource = (markerSyntax: string): ProjectionMarkerCharacter =>
  markerSyntax.startsWith("`")
    ? "`"
    : markerSyntax.startsWith("~")
      ? "~"
      : markerSyntax.startsWith("_")
        ? "_"
        : "*";

const getMarkerCharacterFromAttrs = (
  markName: ProjectionMarkName,
  attrs: Record<string, unknown>,
): ProjectionMarkerCharacter =>
  markName === "strike_through"
    ? "~"
    : markName === "inlineCode"
      ? "`"
      : String(attrs.marker ?? "*") === "_"
        ? "_"
        : "*";

const getSourceMarker = (markName: ProjectionMarkName, marker: ProjectionMarkerCharacter) =>
  markName === "strong" || markName === "strike_through" ? marker.repeat(2) : marker;

const getInlineCodeMarker = (text: string) => {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/gu), (match) => match[0].length),
  );

  return "`".repeat(longestBacktickRun + 1);
};
