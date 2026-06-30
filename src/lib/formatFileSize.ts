const FILE_SIZE_BASE = 1024;
const FILE_SIZE_UNITS = ["bytes", "KB", "MB", "GB", "TB", "PB"] as const;

export const formatFileSize = (sizeBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new RangeError("File size must be a finite non-negative number.");
  }

  if (sizeBytes < FILE_SIZE_BASE) {
    return `${sizeBytes} ${sizeBytes === 1 ? "byte" : "bytes"}`;
  }

  let unitIndex = 0;
  let scaledSize = sizeBytes;

  while (scaledSize >= FILE_SIZE_BASE && unitIndex < FILE_SIZE_UNITS.length - 1) {
    scaledSize /= FILE_SIZE_BASE;
    unitIndex += 1;
  }

  const formattedSize = Number.isInteger(scaledSize)
    ? scaledSize.toString()
    : scaledSize.toFixed(1);

  return `${formattedSize} ${FILE_SIZE_UNITS[unitIndex]}`;
};
