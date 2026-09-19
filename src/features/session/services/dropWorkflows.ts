import { getActiveDocumentKey } from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { getPathParts, toSlashPath } from "@/lib/path";
import { notifyWarning } from "@/lib/toast";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { inspectDroppedPath, type DroppedPath } from "./dropApi";
import { openFolderContextAtPath, openMarkdownFileAtPath } from "./openSession";

interface PathRoot {
  caseInsensitive: boolean;
  components: string[];
  root: string;
}

const WINDOWS_DRIVE_ROOT_PATTERN = /^([a-z]:)(?:\/|$)/iu;
const WINDOWS_UNC_ROOT_PATTERN = /^\/\/([^/]+)\/([^/]+)(?:\/|$)/u;

export const handleDroppedPaths = async (paths: string[]) => {
  if (paths.length !== 1) {
    notifyWarning("Drop one item at a time.");
    return false;
  }

  const droppedPath = await inspectDroppedPath({ path: paths[0] });

  if (droppedPath.kind === "unsupported") {
    notifyWarning("Drop a Markdown file or folder.", droppedPath.path);
    return false;
  }

  const setting =
    droppedPath.kind === "folder"
      ? useSettingsStore.getState().whenDroppingFolder
      : useSettingsStore.getState().whenDroppingMarkdownFile;

  if (setting === "open") {
    return openDroppedPath(droppedPath);
  }

  return insertDroppedPathLink(droppedPath);
};

const openDroppedPath = (droppedPath: Exclude<DroppedPath, { kind: "unsupported" }>) =>
  droppedPath.kind === "folder"
    ? openFolderContextAtPath(droppedPath.path)
    : openMarkdownFileAtPath(droppedPath.path);

const insertDroppedPathLink = (droppedPath: Exclude<DroppedPath, { kind: "unsupported" }>) => {
  const activeDocument = useSessionStore.getState().activeDocument;

  if (!activeDocument) {
    notifyWarning("Open a document before inserting a dropped link.");
    return false;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const label = getPathParts(droppedPath.path).name;
  const target =
    activeDocument.status === "saved"
      ? (getRelativePath(getPathParts(activeDocument.path).parent, droppedPath.path) ??
        toSlashPath(droppedPath.path))
      : toSlashPath(droppedPath.path);

  if (!documentEditorBridge.insertLink(documentKey, label, target)) {
    notifyWarning("Place the caret in the document before inserting a dropped link.");
    return false;
  }

  return true;
};

export const getRelativePath = (fromFolderPath: string, targetPath: string) => {
  const from = splitPath(fromFolderPath);
  const target = splitPath(targetPath);

  if (!sameComponent(from.root, target.root, from.caseInsensitive || target.caseInsensitive)) {
    return null;
  }

  let sharedLength = 0;

  while (
    sharedLength < from.components.length &&
    sharedLength < target.components.length &&
    sameComponent(
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

const splitPath = (path: string): PathRoot => {
  const slashPath = toSlashPath(path);
  const driveMatch = slashPath.match(WINDOWS_DRIVE_ROOT_PATTERN);

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

const sameComponent = (left: string, right: string, caseInsensitive: boolean) =>
  caseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;
