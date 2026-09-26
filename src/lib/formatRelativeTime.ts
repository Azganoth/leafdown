import { localizer } from "./i18n/localizer";

export const formatRelativeTime = (timestamp: number, now: number) =>
  localizer.current.formatRelativeTime(timestamp, now);
