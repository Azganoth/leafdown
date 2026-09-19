const RELATIVE_TIME_UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
] as const satisfies readonly (readonly [Intl.RelativeTimeFormatUnit, number])[];

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatRelativeTime = (timestamp: number, now: number) => {
  // A clock set back after the time was recorded would otherwise read as the future.
  const elapsed = Math.max(0, now - timestamp);

  for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
    if (elapsed >= unitMs) {
      return relativeTimeFormat.format(-Math.floor(elapsed / unitMs), unit);
    }
  }

  return "just now";
};
