import { localizer } from "./i18n/localizer";

const FILE_SIZE_BASE = 1024;
const FILE_SIZE_UNITS = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
  "petabyte",
] as const;

export const formatFileSize = (sizeBytes: number, localization = localizer.current) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new RangeError("File size must be a finite non-negative number.");
  }

  let unitIndex = 0;
  let scaledSize = sizeBytes;

  while (scaledSize >= FILE_SIZE_BASE && unitIndex < FILE_SIZE_UNITS.length - 1) {
    scaledSize /= FILE_SIZE_BASE;
    unitIndex += 1;
  }

  const fractionDigits = Number.isInteger(scaledSize) ? 0 : 1;

  return localization.t("fileSize", {
    count: scaledSize,
    size: localization.formatNumber(scaledSize, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
    unit: FILE_SIZE_UNITS[unitIndex],
  });
};
