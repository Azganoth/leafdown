import { getPathParts, getRelativePath, toSlashPath } from "@/lib/path";

export interface WikiCompletionFile {
  path: string;
  sourcePath: string;
  label: string;
}

export const getWikiCompletionFiles = (
  paths: readonly string[],
  documentPath: string | null,
  folderContextPath: string | null,
  query: string,
): WikiCompletionFile[] => {
  const base = documentPath ? getPathParts(documentPath).parent : folderContextPath;
  if (!base) return [];
  const normalizedQuery = query.toLocaleLowerCase();
  return paths
    .flatMap((path) => {
      const relative = getRelativePath(base, path);
      if (!relative || relative === ".") return [];
      const sourcePath = toSlashPath(relative);
      const name = getPathParts(path).name;
      if (
        normalizedQuery &&
        !sourcePath.toLocaleLowerCase().includes(normalizedQuery) &&
        !name.toLocaleLowerCase().includes(normalizedQuery)
      )
        return [];
      return [{ path, sourcePath, label: sourcePath }];
    })
    .toSorted((left, right) => left.sourcePath.localeCompare(right.sourcePath));
};
