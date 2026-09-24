interface SourceProjectionSelectionTarget {
  from: number;
  originalSource: string;
  to: number;
}

interface SourceProjectionSelectionSession {
  from: number;
  target: { originalContentSize: number };
  to: number;
}

interface SourceProjectionSelectionResult {
  replacementSize: number;
}

export const mapSelectionPositionOutsideSourceProjection = (
  position: number,
  target: SourceProjectionSelectionTarget,
  boundary: "exclusive" | "inclusive" = "inclusive",
) => {
  const isBefore = boundary === "inclusive" ? position <= target.from : position < target.from;
  const isAfter = boundary === "inclusive" ? position >= target.to : position > target.to;

  if (isBefore) {
    return position;
  }

  if (isAfter) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return null;
};

export const mapSelectionPositionFromSourceProjection = (
  position: number,
  session: SourceProjectionSelectionSession,
  result: SourceProjectionSelectionResult,
  preservedContentSize = 0,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return (
      session.from +
      result.replacementSize +
      Math.max(0, position - session.to - preservedContentSize)
    );
  }

  return null;
};
