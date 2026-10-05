import {
  getActiveDocumentKey,
  getSaveMarkdownFileErrorMessage,
  inspectMarkdownDocument,
  isInspectMarkdownFileError,
  type SaveMarkdownFileError,
} from "@/features/document";
import {
  hasCompleteReplacementPlan,
  preflightFolderReplacement,
  useFolderSearchStore,
  writeFolderReplacementFiles,
  type FolderReplaceFilePlan,
  type FolderReplacementArgs,
  type FolderReplacementFile,
  type FolderReplacementOutcome,
  type FolderReplaceReport,
  type FolderSearchFileResult,
  type FolderSearchResults,
} from "@/features/folder-search";
import { requestDecision } from "@/lib/confirmation";
import { handleUnexpectedError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { getPathParts, getRelativePath, isSamePath, PathMap } from "@/lib/path";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/toast";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import {
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentWithoutPrompts,
} from "./documentWorkflows";
import { refreshFolderSearch } from "./folderSearchWorkflows";
import { notifyOpenMarkdownFileError, openMarkdownFileAtPath } from "./openSession";

// Each request stays small enough to report progress between, and to hold no more text than a
// folder search read returns.
const MAX_FILES_PER_REQUEST = 32;
const MAX_CONTENT_PER_REQUEST = 4 * 1024 * 1024;

type PlannedFile<Source extends FolderReplaceFilePlan["source"] = FolderReplaceFilePlan["source"]> =
  FolderSearchFileResult & { replacement: Extract<FolderReplaceFilePlan, { source: Source }> };

const isPlanned = (file: FolderSearchFileResult): file is PlannedFile => file.replacement !== null;

const isDiskFile = (file: PlannedFile): file is PlannedFile<"disk"> =>
  file.replacement.source === "disk" && file.version.source === "disk";

const isEditorFile = (file: PlannedFile): file is PlannedFile<"editor"> =>
  file.replacement.source === "editor";

/**
 * Writes the replacement the folder search planned, file by file in the order it lists them. The
 * open document's unsaved changes are first saved or discarded, which plans again rather than
 * writing, so an Apply only ever writes what the preview showed.
 */
export const applyFolderReplacement = async () => {
  const { apply, caseSensitive, query, replaceOpen, replacement, results, wholeWord } =
    useFolderSearchStore.getState();

  if (
    apply.status === "applying" ||
    !replaceOpen ||
    !results ||
    !hasCompleteReplacementPlan(results, {
      query: { caseSensitive, text: query, wholeWord },
      replacement,
    })
  ) {
    return false;
  }

  const planned = sortByRelativePath(results.folderPath, results.files.filter(isPlanned));

  if (!(await settleActiveDocumentChanges(planned))) {
    return false;
  }

  const report: FolderReplaceReport = { written: [], stale: [], failed: [], notAttempted: [] };

  try {
    await commit(results, planned, report);
  } catch (error) {
    handleUnexpectedError(error, "applyFolderReplacement");
    recordNotAttempted(planned, report);
  }

  useFolderSearchStore.getState().setApplyState({ status: "done", report });
  notifyOutcome(report);
  refreshFolderSearch();

  return true;
};

// Files are written in an order that depends only on their paths, not on how the navigator sorts.
const sortByRelativePath = (folderPath: string, files: PlannedFile[]) =>
  files
    .map((file) => ({ file, key: getRelativePath(folderPath, file.path) ?? file.path }))
    .toSorted((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map(({ file }) => file);

const settleActiveDocumentChanges = async (planned: readonly PlannedFile[]) => {
  const { activeDocument } = useSessionStore.getState();

  if (
    activeDocument?.status !== "saved" ||
    !activeDocument.isDirty ||
    !planned.some((file) => isSamePath(file.path, activeDocument.path))
  ) {
    return true;
  }

  const decision = await requestDecision({
    title: t("session.folderReplace.unsavedChanges.title"),
    message: t("session.folderReplace.unsavedChanges.message", {
      name: getPathParts(activeDocument.path).name,
    }),
    confirmLabel: t("session.folderReplace.unsavedChanges.save"),
    alternateLabel: t("session.folderReplace.unsavedChanges.discard"),
    cancelLabel: t("session.folderReplace.unsavedChanges.cancel"),
  });

  if (decision === "cancel") {
    return false;
  }

  const latest = useSessionStore.getState().activeDocument;

  if (latest?.status === "saved" && isSamePath(latest.path, activeDocument.path)) {
    if (decision === "confirm") {
      try {
        await saveActiveMarkdownDocument();
      } catch (error) {
        notifyError(getSaveMarkdownFileErrorMessage(error));
      }
    } else {
      try {
        await openMarkdownFileAtPath(latest.path, {
          discardConfirmed: true,
          encoding: latest.fileEncoding.name,
        });
      } catch (error) {
        notifyOpenMarkdownFileError(error);
      }
    }
  }

  refreshFolderSearch();

  return false;
};

const commit = async (
  results: FolderSearchResults,
  planned: readonly PlannedFile[],
  report: FolderReplaceReport,
) => {
  const total = planned.length;
  let completed = 0;
  const setProgress = (phase: "checking" | "writing") =>
    useFolderSearchStore.getState().setApplyState({ status: "applying", phase, completed, total });

  setProgress("checking");

  const preflight = await sendInBatches(
    preflightFolderReplacement,
    results.folderPath,
    planned.filter(isDiskFile).map(toReplacementFile),
  );

  setProgress("writing");

  let pending: PlannedFile<"disk">[] = [];
  let pendingContent = 0;
  let stopped = false;

  const flush = async () => {
    const batch = pending;

    pending = [];
    pendingContent = 0;

    if (batch.length === 0) {
      return;
    }

    if (stopped) {
      recordNotAttempted(batch, report);
    } else {
      try {
        const outcomes = await sendInBatches(
          writeFolderReplacementFiles,
          results.folderPath,
          batch.map(toReplacementFile),
        );

        batch.forEach((file) => recordOutcome(file, outcomes.get(file.path), report));
      } catch (error) {
        handleUnexpectedError(error, "writeFolderReplacementFiles");
        stopped = true;
        batch.forEach(({ path }) =>
          report.failed.push({ path, reason: "interrupted", unsavedInEditor: false }),
        );
      }
    }

    completed += batch.length;
    setProgress("writing");
  };

  for (const file of planned) {
    if (isEditorFile(file)) {
      await flush();

      if (stopped) {
        recordNotAttempted([file], report);
      } else {
        await commitActiveDocument(file, results, report);
      }

      completed += 1;
      setProgress("writing");
      continue;
    }

    if (!isDiskFile(file)) {
      continue;
    }

    const checked = preflight.get(file.path);

    // A file opened since the plan is the editor's to write, and its plan read the file instead.
    if (isActiveDocumentPath(file.path)) {
      report.stale.push({ path: file.path, reason: "changedInEditor", unsavedInEditor: false });
    } else if (checked?.kind !== "ready") {
      recordOutcome(file, checked, report);
    } else {
      pending.push(file);
      pendingContent += file.replacement.content.length;

      if (pending.length >= MAX_FILES_PER_REQUEST || pendingContent >= MAX_CONTENT_PER_REQUEST) {
        await flush();
      }

      continue;
    }

    completed += 1;
  }

  await flush();
};

const toReplacementFile = (file: PlannedFile<"disk">): FolderReplacementFile => {
  if (file.version.source !== "disk") {
    throw new Error("A planned file read from disk carries its disk version.");
  }

  return {
    path: file.path,
    content: file.replacement.content,
    encoding: file.replacement.encoding,
    expectedMetadata: file.version.metadata,
    expectedFingerprint: file.version.fingerprint,
  };
};

// The backend may answer for fewer files than it was sent, so the rest are sent again.
const sendInBatches = async (
  send: (args: FolderReplacementArgs) => Promise<FolderReplacementOutcome[]>,
  folderPath: string,
  files: readonly FolderReplacementFile[],
) => {
  const outcomes = new PathMap<FolderReplacementOutcome>();
  let remaining = files;

  while (remaining.length > 0) {
    let count = 0;
    let content = 0;

    while (
      count < remaining.length &&
      count < MAX_FILES_PER_REQUEST &&
      (count === 0 || content + remaining[count].content.length <= MAX_CONTENT_PER_REQUEST)
    ) {
      content += remaining[count].content.length;
      count += 1;
    }

    const answered = await send({ folderPath, files: remaining.slice(0, count) });

    if (answered.length === 0) {
      throw new Error("A folder replacement request answered for no file.");
    }

    answered.forEach((outcome) => outcomes.set(outcome.path, outcome));
    remaining = remaining.slice(answered.length);
  }

  return outcomes;
};

const recordOutcome = (
  file: PlannedFile,
  outcome: FolderReplacementOutcome | undefined,
  report: FolderReplaceReport,
) => {
  switch (outcome?.kind) {
    case "written":
      report.written.push({ path: file.path, matchCount: file.matches.length });
      return;
    case "stale":
      report.stale.push({
        path: file.path,
        reason: outcome.missing ? "missing" : "changedOnDisk",
        unsavedInEditor: false,
      });
      return;
    case "failed": {
      const { error } = outcome;

      report.failed.push({
        path: file.path,
        reason: error.kind,
        unsavedInEditor: false,
        ...(error.kind === "unrepresentableCharacters"
          ? { encoding: error.encoding, detail: error.characters.join(" ") }
          : "message" in error
            ? { detail: error.message }
            : {}),
      });
      return;
    }
    default:
      report.failed.push({ path: file.path, reason: "interrupted", unsavedInEditor: false });
  }
};

const recordNotAttempted = (files: readonly PlannedFile[], report: FolderReplaceReport) => {
  const recorded = new PathMap<true>();

  for (const { path } of [...report.written, ...report.stale, ...report.failed]) {
    recorded.set(path, true);
  }

  report.notAttempted.push(
    ...files.filter(({ path }) => !recorded.get(path)).map(({ path }) => path),
  );
};

const isActiveDocumentPath = (path: string) => {
  const { activeDocument } = useSessionStore.getState();

  return activeDocument?.status === "saved" && isSamePath(activeDocument.path, path);
};

/**
 * The open document takes the replacement in its editor, as one step to undo, and is then saved.
 * A document that changed since the plan, in the editor or on disk, is left as it is.
 */
const commitActiveDocument = async (
  file: PlannedFile<"editor">,
  results: FolderSearchResults,
  report: FolderReplaceReport,
) => {
  const stale = (reason: "changedInEditor" | "changedOnDisk" | "missing") =>
    report.stale.push({ path: file.path, reason, unsavedInEditor: false });
  const session = useSessionStore.getState();
  const document = session.activeDocument;

  if (document?.status !== "saved" || !isSamePath(document.path, file.path) || document.isDirty) {
    stale("changedInEditor");
    return;
  }

  if (document.externalChange) {
    stale(document.externalChange.kind === "missing" ? "missing" : "changedOnDisk");
    return;
  }

  let fileState;

  try {
    fileState = await inspectMarkdownDocument(document);
  } catch (error) {
    if (!isInspectMarkdownFileError(error)) {
      throw error;
    }

    report.failed.push({
      path: file.path,
      reason: error.kind === "permissionDenied" ? "permissionDenied" : "readFailed",
      unsavedInEditor: false,
      ...("message" in error ? { detail: error.message } : {}),
    });
    return;
  }

  if (fileState.kind === "missing") {
    stale("missing");
    return;
  }

  if (fileState.kind === "contentChanged") {
    stale("changedOnDisk");
    return;
  }

  const latest = useSessionStore.getState();
  const latestDocument = latest.activeDocument;

  if (
    latest.activeDocumentGeneration !== session.activeDocumentGeneration ||
    latestDocument !== document
  ) {
    stale("changedInEditor");
    return;
  }

  // A touch leaves the bytes the plan read, so Save is told the file's metadata as it now stands.
  if (fileState.kind === "metadataChanged") {
    latest.setActiveDocumentFileState(document.path, {
      metadata: fileState.metadata,
      externalChange: null,
    });
  }

  const documentKey = getActiveDocumentKey(document);
  const replaced = documentEditorBridge.applySearchReplacement(
    documentKey,
    results.query,
    results.replacement ?? "",
    file.replacement.baseline,
  );

  if (!replaced) {
    stale("changedInEditor");
    return;
  }

  let saved;

  try {
    saved = await saveActiveMarkdownDocumentWithoutPrompts(documentKey);
  } catch (error) {
    handleUnexpectedError(error, "saveFolderReplacementDocument");
    report.failed.push({ path: file.path, reason: "interrupted", unsavedInEditor: true });
    return;
  }

  switch (saved.kind) {
    case "saved":
      report.written.push({ path: file.path, matchCount: replaced });
      return;
    case "closed":
      report.failed.push({ path: file.path, reason: "interrupted", unsavedInEditor: false });
      return;
    case "failed":
      recordActiveDocumentSaveFailure(file.path, saved.error, report);
  }
};

const recordActiveDocumentSaveFailure = (
  path: string,
  error: SaveMarkdownFileError,
  report: FolderReplaceReport,
) => {
  switch (error.kind) {
    case "externalModification":
      report.stale.push({ path, reason: "changedOnDisk", unsavedInEditor: true });
      return;
    case "missingFile":
    case "missingParentFolder":
      report.stale.push({ path, reason: "missing", unsavedInEditor: true });
      return;
    case "unrepresentableCharacters":
      report.failed.push({
        path,
        reason: "unrepresentableCharacters",
        unsavedInEditor: true,
        encoding: error.encoding,
        detail: error.characters.join(" "),
      });
      return;
    case "permissionDenied":
      report.failed.push({
        path,
        reason: "permissionDenied",
        unsavedInEditor: true,
        detail: error.message,
      });
      return;
    default:
      report.failed.push({
        path,
        reason: "writeFailed",
        unsavedInEditor: true,
        ...("message" in error ? { detail: error.message } : {}),
      });
  }
};

const notifyOutcome = ({ failed, notAttempted, stale, written }: FolderReplaceReport) => {
  const files = written.length;
  const matches = written.reduce((count, { matchCount }) => count + matchCount, 0);
  const unchanged = stale.length + failed.length + notAttempted.length;

  if (unchanged === 0) {
    notifySuccess(t("session.folderReplace.applied", { files, matches }));
    return;
  }

  notifyWarning({
    title: t("session.folderReplace.applied", { files, matches }),
    description: t("session.folderReplace.unchanged", { count: unchanged }),
  });
};
