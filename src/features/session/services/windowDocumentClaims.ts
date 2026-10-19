import { handleUnexpectedError } from "@/lib/errors";
import { DisposableStore, toDisposable, type Disposable } from "@/lib/lifecycle";
import { PathSet } from "@/lib/path";
import { SignalSource } from "@/lib/signal";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { useSessionStore, type SessionState } from "../stores/session";
import { claimWindowDocument, setWindowDocuments, type WindowDocument } from "./windowDocumentsApi";

interface PendingClaim {
  path: string;
}

const pendingClaims = new Set<PendingClaim>();
const claimReleased = new SignalSource();

export class DocumentOwnedByContext extends Error {
  constructor(
    readonly contextId: string,
    readonly path: string,
  ) {
    super("Document belongs to another context.");
  }
}

/**
 * Claims a saved document for this window before it opens or saves to it, so another window cannot
 * open the same file meanwhile. Resolves `null` when another window holds the file, which then
 * shows it if `activate` is set. The claim lasts until it is disposed, once a tab holds the
 * document or the attempt ended without one.
 */
export const claimDocumentForWindow = async (
  path: string,
  { activate }: { activate: boolean },
): Promise<Disposable | null> => {
  const result = await claimWindowDocument(path, activate);

  if (result.kind === "ownedByContext") {
    if (activate) {
      throw new DocumentOwnedByContext(result.contextId, path);
    }
    return null;
  }

  if (result.kind === "openElsewhere") {
    return null;
  }

  const claim: PendingClaim = { path };

  pendingClaims.add(claim);

  return toDisposable(() => {
    if (pendingClaims.delete(claim)) {
      claimReleased.notify();
    }
  });
};

const collectWindowDocuments = (state: Pick<SessionState, "tabs">) => {
  const paths = new PathSet();
  const documents: WindowDocument[] = [];
  const add = (path: string, unsaved: boolean) => {
    if (!paths.has(path)) {
      paths.add(path);
      documents.push({ path, unsaved });
    }
  };

  for (const { document } of state.tabs) {
    if (document.status === "saved") {
      add(document.path, document.isDirty);
    }
  }

  for (const { path } of pendingClaims) {
    add(path, false);
  }

  return documents;
};

/**
 * Keeps the backend's record of this window's saved documents, and of whether each has unsaved
 * changes, in step with its tabs and its pending claims.
 */
export class WindowDocumentsSync implements Disposable {
  private readonly subscriptions = new DisposableStore();
  private lastSentKey: string | null = null;
  // A claim is recorded by the backend without passing through this window's list, so giving it
  // back must send the list even when it looks unchanged.
  private resendRequested = false;
  private isSending = false;
  private isDisposed = false;

  constructor() {
    this.subscriptions.add(
      toDisposable(
        useNamedFoldersStore.subscribe((state, previous) => {
          if (!state.transitioning && previous.transitioning) {
            this.resendRequested = true;
            void this.send();
          }
        }),
      ),
    );
    this.subscriptions.add(
      useSessionStore.subscribe((state, previous) => {
        if (state.tabs !== previous.tabs) {
          void this.send();
        }
      }),
    );
    this.subscriptions.add(
      claimReleased.signal(() => {
        this.resendRequested = true;
        void this.send();
      }),
    );
    void this.send();
  }

  dispose() {
    this.isDisposed = true;
    this.subscriptions.dispose();
  }

  // One request at a time, sending again until the list it sent is the list the window holds.
  private async send() {
    if (this.isSending) {
      return;
    }

    this.isSending = true;

    try {
      while (!this.isDisposed) {
        if (useNamedFoldersStore.getState().transitioning) {
          return;
        }
        const documents = collectWindowDocuments(useSessionStore.getState());
        const key = JSON.stringify(documents);

        if (key === this.lastSentKey && !this.resendRequested) {
          return;
        }

        this.resendRequested = false;
        await setWindowDocuments(documents);
        this.lastSentKey = key;
      }
    } catch (error) {
      this.lastSentKey = null;
      handleUnexpectedError(error, "setWindowDocuments");
    } finally {
      this.isSending = false;
    }
  }
}
