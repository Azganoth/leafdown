import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./formatRelativeTime";

const NOW = Date.UTC(2026, 8, 19, 12);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [59 * 1000, "just now"],
    [MINUTE, "1 minute ago"],
    [45 * MINUTE, "45 minutes ago"],
    [HOUR, "1 hour ago"],
    [23 * HOUR, "23 hours ago"],
    [DAY, "yesterday"],
    [6 * DAY, "6 days ago"],
    [7 * DAY, "last week"],
    [20 * DAY, "2 weeks ago"],
    [30 * DAY, "last month"],
    [100 * DAY, "3 months ago"],
    [365 * DAY, "last year"],
    [800 * DAY, "2 years ago"],
  ])("formats %s ms ago as %s", (elapsed, expected) => {
    expect(formatRelativeTime(NOW - elapsed, NOW)).toBe(expected);
  });

  it("reads a time after now as just now", () => {
    expect(formatRelativeTime(NOW + DAY, NOW)).toBe("just now");
  });
});
