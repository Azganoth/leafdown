import { toSlashPath } from "@/lib/path";

export const joinMockPathSegments = (...segments: string[]) => {
  const [firstSegment, ...otherSegments] = segments.filter(Boolean).map(toSlashPath);

  if (!firstSegment) {
    return "";
  }

  return otherSegments.reduce((path, segment) => {
    const pathPrefix = path.replace(/\/+$/u, "");
    const pathSuffix = segment.replace(/^\/+/u, "");

    return pathPrefix ? `${pathPrefix}/${pathSuffix}` : `/${pathSuffix}`;
  }, firstSegment);
};

export const getMockPathExtension = (path: string) => {
  const basename = toSlashPath(path).replace(/\/+$/u, "").split("/").at(-1) ?? "";
  const extensionSeparatorIndex = basename.lastIndexOf(".");

  return extensionSeparatorIndex > 0 ? basename.slice(extensionSeparatorIndex + 1) : "";
};
