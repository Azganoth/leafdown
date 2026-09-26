export const toSlashPath = (path: string) => path.replaceAll("\\", "/");

const WINDOWS_DRIVE_PATH_PATTERN = /^[a-z]:($|\/)/iu;
const SLASH_ONLY_PATH_PATTERN = /^\/+$/u;
const WINDOWS_DRIVE_ROOT_PATTERN = /^([a-z]:)\/+$/iu;
const WINDOWS_DRIVE_RELATIVE_ROOT_PATTERN = /^([a-z]:)(?:\/|$)/iu;
const WINDOWS_UNC_ROOT_PATTERN = /^\/\/([^/]+)\/([^/]+)(?:\/|$)/u;

interface PathRoot {
  caseInsensitive: boolean;
  components: string[];
  root: string;
}

const isWindowsPath = (path: string) =>
  WINDOWS_DRIVE_PATH_PATTERN.test(path) || path.startsWith("//");

const trimTrailingPathSeparators = (path: string) => {
  if (SLASH_ONLY_PATH_PATTERN.test(path)) {
    return "/";
  }

  const windowsDriveRootMatch = path.match(WINDOWS_DRIVE_ROOT_PATTERN);

  if (windowsDriveRootMatch) {
    return `${windowsDriveRootMatch[1]}/`;
  }

  return path.replace(/\/+$/u, "");
};

export interface PathParts {
  name: string;
  parent: string;
}

export const getPathParts = (path: string): PathParts => {
  const normalizedPath = trimTrailingPathSeparators(toSlashPath(path));
  const separatorIndex = normalizedPath.lastIndexOf("/");

  // A root keeps its separator through trimming, and a bare name never had one.
  if (separatorIndex === -1 || normalizedPath.endsWith("/")) {
    return { name: normalizedPath, parent: "" };
  }

  return {
    name: normalizedPath.slice(separatorIndex + 1),
    parent: trimTrailingPathSeparators(normalizedPath.slice(0, separatorIndex + 1)),
  };
};

export const getPathIdentityKey = (path: string) => {
  const normalizedPath = trimTrailingPathSeparators(toSlashPath(path));

  return isWindowsPath(normalizedPath) ? normalizedPath.toLowerCase() : normalizedPath;
};

export const isSamePath = (leftPath: string, rightPath: string) =>
  getPathIdentityKey(leftPath) === getPathIdentityKey(rightPath);

export const isSameOrParentPath = (parentPath: string, childPath: string) => {
  const parentKey = getPathIdentityKey(parentPath);
  const childKey = getPathIdentityKey(childPath);

  if (parentKey === childKey) {
    return true;
  }

  if (!parentKey) {
    return false;
  }

  const parentPrefix = parentKey.endsWith("/") ? parentKey : `${parentKey}/`;

  return childKey.startsWith(parentPrefix);
};

export const isSameNullablePath = (leftPath: string | null, rightPath: string | null) =>
  leftPath === null || rightPath === null
    ? leftPath === rightPath
    : isSamePath(leftPath, rightPath);

/**
 * Moves `path` from under `fromPath` to under `toPath`, keeping the separators and casing of the
 * part below `fromPath`. Returns `null` when `path` is not `fromPath` or inside it.
 */
export const rebasePath = (path: string, fromPath: string, toPath: string) => {
  if (isSamePath(path, fromPath)) {
    return toPath;
  }

  if (!isSameOrParentPath(fromPath, path)) {
    return null;
  }

  const fromPrefixLength = trimTrailingPathSeparators(toSlashPath(fromPath)).replace(
    /\/$/u,
    "",
  ).length;
  const childSuffix = path.slice(fromPrefixLength).replace(/^[\\/]+/u, "");
  const separator = toPath.includes("\\") ? "\\" : "/";

  return `${toPath.replace(/[\\/]+$/u, "")}${separator}${childSuffix}`;
};

export const getRelativePath = (fromFolderPath: string, targetPath: string) => {
  const from = splitPathRoot(fromFolderPath);
  const target = splitPathRoot(targetPath);

  if (!samePathComponent(from.root, target.root, from.caseInsensitive || target.caseInsensitive)) {
    return null;
  }

  let sharedLength = 0;

  while (
    sharedLength < from.components.length &&
    sharedLength < target.components.length &&
    samePathComponent(
      from.components[sharedLength],
      target.components[sharedLength],
      from.caseInsensitive,
    )
  ) {
    sharedLength += 1;
  }

  const parentSegments = Array.from({ length: from.components.length - sharedLength }, () => "..");
  const targetSegments = target.components.slice(sharedLength);

  return [...parentSegments, ...targetSegments].join("/") || ".";
};

const splitPathRoot = (path: string): PathRoot => {
  const slashPath = toSlashPath(path);
  const driveMatch = slashPath.match(WINDOWS_DRIVE_RELATIVE_ROOT_PATTERN);

  if (driveMatch) {
    return {
      caseInsensitive: true,
      components: slashPath.slice(driveMatch[0].length).split("/").filter(Boolean),
      root: driveMatch[1],
    };
  }

  const uncMatch = slashPath.match(WINDOWS_UNC_ROOT_PATTERN);

  if (uncMatch) {
    return {
      caseInsensitive: true,
      components: slashPath.slice(uncMatch[0].length).split("/").filter(Boolean),
      root: `//${uncMatch[1]}/${uncMatch[2]}`,
    };
  }

  return {
    caseInsensitive: false,
    components: slashPath
      .replace(/^\/+|\/+$/gu, "")
      .split("/")
      .filter(Boolean),
    root: slashPath.startsWith("/") ? "/" : "",
  };
};

const samePathComponent = (left: string, right: string, caseInsensitive: boolean) =>
  caseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;

export class PathSet implements Iterable<string> {
  private readonly pathsByKey = new Map<string, string>();

  constructor(paths?: Iterable<string>) {
    if (!paths) {
      return;
    }

    for (const path of paths) {
      this.add(path);
    }
  }

  get size() {
    return this.pathsByKey.size;
  }

  add(path: string) {
    const pathKey = getPathIdentityKey(path);

    if (!this.pathsByKey.has(pathKey)) {
      this.pathsByKey.set(pathKey, path);
    }

    return this;
  }

  clear() {
    this.pathsByKey.clear();
  }

  delete(path: string) {
    return this.pathsByKey.delete(getPathIdentityKey(path));
  }

  *entries(): IterableIterator<[string, string]> {
    for (const path of this.pathsByKey.values()) {
      yield [path, path];
    }
  }

  forEach(callback: (path: string, samePath: string, set: this) => void, thisArg?: unknown) {
    for (const path of this.pathsByKey.values()) {
      callback.call(thisArg, path, path, this);
    }
  }

  has(path: string) {
    return this.pathsByKey.has(getPathIdentityKey(path));
  }

  keys() {
    return this.values();
  }

  values() {
    return this.pathsByKey.values();
  }

  [Symbol.iterator]() {
    return this.values();
  }
}

export class PathMap<T> {
  private readonly valuesByKey = new Map<string, T>();

  get(path: string) {
    return this.valuesByKey.get(getPathIdentityKey(path));
  }

  set(path: string, value: T) {
    this.valuesByKey.set(getPathIdentityKey(path), value);

    return this;
  }
}
