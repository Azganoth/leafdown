import type { Localization, MessageId } from "./i18n";

const FILE_SIZE_BASE = 1024;
const FILE_SIZE_UNIT_MESSAGE_IDS = [
  "fileSize.bytes",
  "fileSize.kilobytes",
  "fileSize.megabytes",
  "fileSize.gigabytes",
  "fileSize.terabytes",
  "fileSize.petabytes",
] as const satisfies readonly MessageId[];

export const formatFileSize = (sizeBytes: number, localization: Localization) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new RangeError("File size must be a finite non-negative number.");
  }

  let unitIndex = 0;
  let scaledSize = sizeBytes;

  while (scaledSize >= FILE_SIZE_BASE && unitIndex < FILE_SIZE_UNIT_MESSAGE_IDS.length - 1) {
    scaledSize /= FILE_SIZE_BASE;
    unitIndex += 1;
  }

  const fractionDigits = Number.isInteger(scaledSize) ? 0 : 1;

  return localization.t(FILE_SIZE_UNIT_MESSAGE_IDS[unitIndex], {
    count: scaledSize,
    size: localization.formatNumber(scaledSize, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  });
};
