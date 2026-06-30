export const toSlashPath = (path: string) => path.replaceAll("\\", "/");

const WINDOWS_DRIVE_PATH_PATTERN = /^[a-z]:($|\/)/iu;
const SLASH_ONLY_PATH_PATTERN = /^\/+$/u;
const WINDOWS_DRIVE_ROOT_PATTERN = /^([a-z]:)\/+$/iu;

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

interface PathMapEntry<Value> {
  path: string;
  value: Value;
}

export class PathMap<Value> implements Iterable<[string, Value]> {
  private readonly entriesByKey = new Map<string, PathMapEntry<Value>>();

  constructor(entries?: Iterable<readonly [string, Value]>) {
    if (!entries) {
      return;
    }

    for (const [path, value] of entries) {
      this.set(path, value);
    }
  }

  get size() {
    return this.entriesByKey.size;
  }

  clear() {
    this.entriesByKey.clear();
  }

  delete(path: string) {
    return this.entriesByKey.delete(getPathIdentityKey(path));
  }

  entries(): IterableIterator<[string, Value]> {
    return this[Symbol.iterator]();
  }

  forEach(callback: (value: Value, path: string, map: this) => void, thisArg?: unknown) {
    for (const [path, value] of this) {
      callback.call(thisArg, value, path, this);
    }
  }

  get(path: string) {
    return this.entriesByKey.get(getPathIdentityKey(path))?.value;
  }

  has(path: string) {
    return this.entriesByKey.has(getPathIdentityKey(path));
  }

  *keys(): IterableIterator<string> {
    for (const entry of this.entriesByKey.values()) {
      yield entry.path;
    }
  }

  set(path: string, value: Value) {
    this.entriesByKey.set(getPathIdentityKey(path), { path, value });

    return this;
  }

  *values(): IterableIterator<Value> {
    for (const entry of this.entriesByKey.values()) {
      yield entry.value;
    }
  }

  *[Symbol.iterator](): IterableIterator<[string, Value]> {
    for (const entry of this.entriesByKey.values()) {
      yield [entry.path, entry.value];
    }
  }
}

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
