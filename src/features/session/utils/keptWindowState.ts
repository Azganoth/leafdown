import {
  LEGACY_ENCODING_NAMES,
  LINE_ENDINGS,
  type DocumentEncoding,
  type FileMetadataSnapshot,
  type LineEnding,
} from "@/features/document";
import type { EditorViewState } from "@/features/editor";
import {
  booleanValue,
  eitherOf,
  nullable,
  numberValue,
  oneOf,
  salvagedList,
  strictRecord,
  stringValue,
  type ValueContract,
} from "@/lib/valueContract";

import type { DocumentTab, SessionState } from "../stores/session";

export const KEPT_WINDOW_STATE_VERSION = 1;

interface KeptTabFields {
  /** Names the snapshot holding the document's unsaved text, which a dirty document always has. */
  snapshotId: string | null;
  isDirty: boolean;
  encoding: DocumentEncoding;
  viewState: EditorViewState | null;
}

export interface KeptSavedTab extends KeptTabFields {
  kind: "saved";
  path: string;
  preview: boolean;
  lineEnding: LineEnding | null;
  fileEncoding: DocumentEncoding;
  /** The version of the file the unsaved text was based on. */
  metadata: FileMetadataSnapshot;
  fingerprint: string;
}

export interface KeptUntitledTab extends KeptTabFields {
  kind: "untitled";
  id: string;
  lineEnding: LineEnding;
}

export type KeptTab = KeptSavedTab | KeptUntitledTab;

export interface KeptWindowState {
  version: typeof KEPT_WINDOW_STATE_VERSION;
  folderPath: string | null;
  activeTabIndex: number | null;
  tabs: KeptTab[];
}

const ENCODING_NAMES = ["UTF-8", "UTF-16LE", "UTF-16BE", ...LEGACY_ENCODING_NAMES] as const;

const encodingValue: ValueContract<DocumentEncoding> = {
  check: (value) => {
    const checked = strictRecord({ name: oneOf(ENCODING_NAMES), bom: booleanValue }).check(value);

    // Only the Unicode encodings have a byte order mark.
    return checked.outcome !== "invalid" &&
      checked.value.bom &&
      (LEGACY_ENCODING_NAMES as readonly string[]).includes(checked.value.name)
      ? { outcome: "invalid" }
      : (checked as ReturnType<ValueContract<DocumentEncoding>["check"]>);
  },
};

const viewStateValue = nullable(
  strictRecord({ anchor: numberValue, head: numberValue, focused: booleanValue }),
);

const savedTabValue = strictRecord({
  kind: oneOf(["saved"] as const),
  path: stringValue,
  snapshotId: nullable(stringValue),
  isDirty: booleanValue,
  preview: booleanValue,
  lineEnding: nullable(oneOf(LINE_ENDINGS)),
  encoding: encodingValue,
  fileEncoding: encodingValue,
  metadata: strictRecord({ sizeBytes: numberValue, modifiedAtUnixMs: numberValue }),
  fingerprint: stringValue,
  viewState: viewStateValue,
}) satisfies ValueContract<KeptSavedTab>;

const untitledTabValue = strictRecord({
  kind: oneOf(["untitled"] as const),
  id: stringValue,
  snapshotId: nullable(stringValue),
  isDirty: booleanValue,
  lineEnding: oneOf(LINE_ENDINGS),
  encoding: encodingValue,
  viewState: viewStateValue,
}) satisfies ValueContract<KeptUntitledTab>;

/** A tab that cannot be read back is dropped, and the window keeps the rest. */
const keptWindowStateValue = strictRecord({
  version: oneOf([KEPT_WINDOW_STATE_VERSION] as const),
  folderPath: nullable(stringValue),
  activeTabIndex: nullable(numberValue),
  tabs: salvagedList(eitherOf(savedTabValue, untitledTabValue)),
}) satisfies ValueContract<KeptWindowState>;

export const parseKeptWindowState = (value: unknown): KeptWindowState | null => {
  const checked = keptWindowStateValue.check(value);

  return checked.outcome === "invalid" ? null : checked.value;
};

/** Describes the window's tabs as the session keeps them, given each tab's snapshot and caret. */
export const toKeptWindowState = (
  { folderContext, folderContextLoad, tabs, activeTabId }: SessionState,
  describeTab: (tab: DocumentTab) => Pick<KeptTabFields, "snapshotId" | "viewState">,
): KeptWindowState => {
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  return {
    version: KEPT_WINDOW_STATE_VERSION,
    folderPath: folderContext?.path ?? folderContextLoad?.path ?? null,
    activeTabIndex: activeTabIndex === -1 ? null : activeTabIndex,
    tabs: tabs.map((tab): KeptTab => {
      const { document } = tab;
      const fields = {
        ...describeTab(tab),
        isDirty: document.isDirty,
        encoding: document.encoding,
      };

      return document.status === "saved"
        ? {
            ...fields,
            kind: "saved",
            path: document.path,
            preview: tab.preview,
            lineEnding: document.lineEnding,
            fileEncoding: document.fileEncoding,
            metadata: document.metadata,
            fingerprint: document.fingerprint,
          }
        : {
            ...fields,
            kind: "untitled",
            id: document.id,
            lineEnding: document.lineEnding,
          };
    }),
  };
};

export const getKeptSnapshotIds = (state: KeptWindowState) =>
  state.tabs.flatMap((tab) => (tab.snapshotId ? [tab.snapshotId] : []));
