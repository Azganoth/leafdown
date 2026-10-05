import type {
  DocumentEncoding,
  FileMetadataSnapshot,
  OpenMarkdownFileError,
} from "@/features/document";
import {
  createMarkdownSearchTextParser,
  findSearchableTextMatches,
  getSearchMatchContext,
  SEARCH_MATCH_CONTEXT_RADIUS,
  type DocumentReplacementPlan,
  type DocumentSearchMatches,
  type MarkdownSearchTextParser,
  type SearchableTextRange,
  type SearchMatchContext,
  type TextSearchQuery,
} from "@/features/editor";
import { AsyncLazy } from "@/lib/async";
import {
  CancellationError,
  CancellationTokenSource,
  isCancellationError,
  raceWithCancellation,
  throwIfCancelled,
  type CancellationToken,
} from "@/lib/cancellation";
import { handleUnexpectedError } from "@/lib/errors";
import { MutableDisposable, type Disposable } from "@/lib/lifecycle";
import { isSamePath, PathMap } from "@/lib/path";

import { planFileReplacement, type FolderReplaceSaveOptions } from "./folderReplacePlan";
import {
  readFolderSearchFiles,
  type FolderSearchFileOutcome,
  type ReadFolderSearchFilesArgs,
} from "./folderSearchApi";
import { FolderSearchTextCache, type CachedSearchText } from "./folderSearchTextCache";

/** How many matches a search keeps before it stops and offers to search further. */
export const FOLDER_SEARCH_MATCH_LIMIT = 10_000;
const READ_BATCH_SIZE = 64;
// Parsing runs on the main thread, so the run gives way between files once it has held it this long.
const SLICE_BUDGET_MS = 12;
const PUBLISH_INTERVAL_MS = 100;

export type FolderSearchFileVersion =
  | { source: "disk"; metadata: FileMetadataSnapshot; fingerprint: string }
  | { source: "editor" };

export interface FolderSearchMatch {
  /** The match's place among the file's matches in document order. */
  ordinal: number;
  context: SearchMatchContext;
}

/** What replacing a file's matches writes, planned against the version the file was read in. */
export type FolderReplaceFilePlan =
  | {
      source: "disk";
      content: string;
      encoding: DocumentEncoding;
      /** Whether the file is written as a save writes it, changing text outside the matches. */
      rewritesOtherText: boolean;
    }
  /** The open document is replaced in its editor while it still saves as `baseline`. */
  | { source: "editor"; baseline: string };

export interface FolderSearchFileResult {
  path: string;
  version: FolderSearchFileVersion;
  matches: FolderSearchMatch[];
  /** Whether the match limit cut the file's matches short. */
  clipped: boolean;
  /** The file's replacement while the search plans one, otherwise `null`. */
  replacement: FolderReplaceFilePlan | null;
}

export type FolderSearchSkipReason =
  | OpenMarkdownFileError["kind"]
  | "parseFailed"
  /** The file would not read as its matches replaced. */
  | "replacementRefused";

export interface FolderSearchSkippedFile {
  path: string;
  reason: FolderSearchSkipReason;
}

export type FolderSearchStatus = "searching" | "completed" | "cancelled" | "limited";

export interface FolderSearchResults {
  /** Changes whenever the query, its options, or the folder change, never on a refresh. */
  id: number;
  folderPath: string;
  query: TextSearchQuery;
  /** The text replacing every match while the search plans a replacement, otherwise `null`. */
  replacement: string | null;
  status: FolderSearchStatus;
  searchedFileCount: number;
  articleCount: number;
  matchCount: number;
  files: FolderSearchFileResult[];
  skipped: FolderSearchSkippedFile[];
}

/** The document the editor holds, searched as it stands rather than as its file does. */
export interface FolderSearchActiveDocument {
  path: string;
  readMatches: (
    query: TextSearchQuery,
    options: { finalizeProjection: boolean },
  ) => DocumentSearchMatches | null;
  planReplacement: (query: TextSearchQuery, replacement: string) => DocumentReplacementPlan | null;
}

export interface FolderSearchHost {
  getActiveDocument: () => FolderSearchActiveDocument | null;
  /** Text read by earlier searches, which the host keeps, and clears, for as long as it holds. */
  textCache?: FolderSearchTextCache;
  readFiles?: (args: ReadFolderSearchFilesArgs) => Promise<FolderSearchFileOutcome[]>;
  createParser?: () => Promise<MarkdownSearchTextParser>;
}

/** Plans replacing every match, which a search does in full rather than stopping at its limit. */
export interface FolderReplaceRequest {
  text: string;
  save: FolderReplaceSaveOptions;
}

export interface FolderSearchRequest {
  folderPath: string;
  articlePaths: readonly string[];
  query: TextSearchQuery;
  replacement: FolderReplaceRequest | null;
  /** Searches the editor's document as the file holds it, as opening document Find does. */
  finalizeProjection: boolean;
}

interface ActiveSearch {
  id: number;
  folderPath: string;
  query: TextSearchQuery;
  replacement: FolderReplaceRequest | null;
  articlePaths: readonly string[];
  articleIndexes: PathMap<number>;
  files: PathMap<FolderSearchFileResult>;
  skipped: PathMap<FolderSearchSkippedFile>;
  /** The request that last wrote each file, so an older read never replaces a newer one. */
  writes: PathMap<number>;
  status: FolderSearchStatus;
  searchedFileCount: number;
  matchLimit: number;
  runId: number;
}

interface SequencedOutcome {
  outcome: FolderSearchFileOutcome;
  sequence: number;
}

const isSameQuery = (left: TextSearchQuery, right: TextSearchQuery) =>
  left.text === right.text &&
  left.caseSensitive === right.caseSensitive &&
  left.wholeWord === right.wholeWord;

/**
 * Whether results hold a complete replacement plan with something to write, made for the query,
 * options, and replacement given; a plan for text since changed is not one to write.
 */
export const hasCompleteReplacementPlan = (
  results: FolderSearchResults | null,
  current: { query: TextSearchQuery; replacement: string },
) =>
  results !== null &&
  results.replacement === current.replacement &&
  isSameQuery(results.query, current.query) &&
  results.status === "completed" &&
  results.files.some((file) => file.replacement !== null);

const isSameReplacement = (left: FolderReplaceRequest | null, right: FolderReplaceRequest | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.text === right.text &&
    left.save.defaultLineEnding === right.save.defaultLineEnding &&
    left.save.insertFinalNewline === right.save.insertFinalNewline);

const yieldToEventLoop = () => {
  const { scheduler } = globalThis as { scheduler?: { yield?: () => Promise<void> } };

  return scheduler?.yield
    ? scheduler.yield()
    : new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
};

const indexPaths = (paths: readonly string[]) => {
  const indexes = new PathMap<number>();

  paths.forEach((path, index) => indexes.set(path, index));

  return indexes;
};

/**
 * Searches a folder's articles one file at a time, giving way to the interface between files, and
 * publishes what it has found as it goes. Only the run started last writes results; a refresh of
 * the same search keeps the results in place and replaces each file's as it reaches it.
 */
export class FolderSearchEngine implements Disposable {
  private readonly parser = new AsyncLazy(() => this.createParser(), { retryOnFailure: true });
  private parserInstance: MarkdownSearchTextParser | null = null;
  private readonly ownsTexts: boolean;
  private readonly texts: FolderSearchTextCache;
  private readonly runCancellation = new MutableDisposable<CancellationTokenSource>();
  private search: ActiveSearch | null = null;
  private nextSearchId = 1;
  private nextRunId = 1;
  private nextSequence = 1;
  private publishTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  private isDisposed = false;

  constructor(
    private readonly host: FolderSearchHost,
    private readonly publish: (results: FolderSearchResults | null) => void,
  ) {
    this.ownsTexts = !host.textCache;
    this.texts = host.textCache ?? new FolderSearchTextCache();
  }

  /**
   * Starts a search, or refreshes the current one in place when only the articles changed. An empty
   * query reads no file.
   */
  start(request: FolderSearchRequest) {
    if (this.isDisposed) {
      return;
    }

    const current = this.search;
    const sameFolder = current !== null && isSamePath(current.folderPath, request.folderPath);

    if (!sameFolder && this.ownsTexts) {
      this.texts.clear();
    }

    if (request.query.text === "") {
      this.stop();
      this.search = null;
      this.publishNow();
      return;
    }

    const articleIndexes = indexPaths(request.articlePaths);
    const refreshesInPlace =
      current !== null &&
      sameFolder &&
      isSameQuery(current.query, request.query) &&
      isSameReplacement(current.replacement, request.replacement);

    if (current && refreshesInPlace) {
      current.articlePaths = request.articlePaths;
      current.articleIndexes = articleIndexes;
      this.forgetFilesOutside(current);
    } else {
      this.search = {
        id: this.nextSearchId++,
        folderPath: request.folderPath,
        query: request.query,
        replacement: request.replacement,
        articlePaths: request.articlePaths,
        articleIndexes,
        files: new PathMap(),
        skipped: new PathMap(),
        writes: new PathMap(),
        status: "searching",
        searchedFileCount: 0,
        matchLimit: FOLDER_SEARCH_MATCH_LIMIT,
        runId: 0,
      };
    }

    const search = this.search;

    if (!search) {
      return;
    }

    search.matchLimit = search.replacement ? Infinity : FOLDER_SEARCH_MATCH_LIMIT;

    if (request.finalizeProjection) {
      this.host.getActiveDocument()?.readMatches(search.query, { finalizeProjection: true });
    }

    this.run(search, 0);

    // Results kept in place are no longer complete once the run starts, so a plan among them stops
    // being one an Apply can write at once rather than at the next publication.
    if (refreshesInPlace) {
      this.publishNow();
      this.schedulePublish();
    }
  }

  /** Searches on from where the match limit stopped the search, keeping what it found. */
  searchFurther() {
    const search = this.search;

    if (!search || search.status !== "limited") {
      return;
    }

    const clippedIndex = search.articlePaths.findIndex((path) => search.files.get(path)?.clipped);
    const resumeIndex = clippedIndex === -1 ? search.searchedFileCount : clippedIndex;

    search.matchLimit += FOLDER_SEARCH_MATCH_LIMIT;
    this.run(search, resumeIndex);
  }

  /** Stops the search, keeping what it found so far. */
  cancel() {
    const search = this.search;

    if (!search || search.status !== "searching") {
      return;
    }

    this.stop();
    this.forgetFilesFrom(search, search.searchedFileCount);
    this.settle(search, "cancelled");
  }

  /** Searches one article again, from the editor when it holds the document. */
  refreshFile(path: string) {
    const search = this.search;

    if (!search || search.articleIndexes.get(path) === undefined) {
      return;
    }

    const capacity =
      search.matchLimit -
      this.countMatchesBefore(search, search.articlePaths.length) +
      (search.files.get(path)?.matches.length ?? 0);

    // Read from the editor at once, so a caller that refreshes and then marks a match knows the
    // results it marks are the ones shown.
    if (this.writeActiveDocument(search, path, capacity)) {
      this.settleIfIdle(search);
      this.publishNow();
      return;
    }

    const sequence = this.nextSequence++;

    void this.readFiles({ folderPath: search.folderPath, files: [{ path, knownMetadata: null }] })
      .then(async ([outcome]) => {
        const parser = await this.parser.value;

        if (this.search !== search || !outcome) {
          return;
        }

        this.applyOutcome(search, path, { outcome, sequence }, parser, capacity);
        this.settleIfIdle(search);
        this.schedulePublish();
      })
      .catch((error) => handleUnexpectedError(error, "refreshFolderSearchFile"));
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stop();
    globalThis.clearTimeout(this.publishTimeout);
    this.search = null;
    this.parserInstance?.dispose();
    this.parserInstance = null;
  }

  private stop() {
    this.runCancellation.clear();
  }

  private run(search: ActiveSearch, fromIndex: number) {
    const cancellation = new CancellationTokenSource();
    const runId = this.nextRunId++;

    this.runCancellation.value = cancellation;
    search.runId = runId;
    search.status = "searching";
    search.searchedFileCount = fromIndex;
    this.schedulePublish();

    void this.runFrom(search, fromIndex, cancellation.token).catch((error) => {
      if (search.runId !== runId || this.search !== search || search.status !== "searching") {
        return;
      }

      if (!isCancellationError(error)) {
        handleUnexpectedError(error, "runFolderSearch");
      }

      this.settle(search, "cancelled");
    });
  }

  private async runFrom(search: ActiveSearch, fromIndex: number, token: CancellationToken) {
    const parser = await raceWithCancellation(token, () => this.parser.value);
    const reader = this.createOutcomeReader(search, fromIndex, token);
    let keptMatchCount = this.countMatchesBefore(search, fromIndex);
    let sliceStartedAt = performance.now();

    for (let index = fromIndex; index < search.articlePaths.length; index += 1) {
      const path = search.articlePaths[index];
      const outcome = await reader.next(path);

      throwIfCancelled(token);

      const capacity = search.matchLimit - keptMatchCount;

      if (!this.writeActiveDocument(search, path, capacity)) {
        this.applyOutcome(search, path, outcome, parser, capacity);
      }

      search.searchedFileCount = index + 1;
      keptMatchCount += search.files.get(path)?.matches.length ?? 0;

      const filesRemain = index + 1 < search.articlePaths.length;

      if (search.files.get(path)?.clipped || (filesRemain && keptMatchCount >= search.matchLimit)) {
        this.forgetFilesFrom(search, index + 1);
        this.settle(search, "limited");
        return;
      }

      if (performance.now() - sliceStartedAt >= SLICE_BUDGET_MS) {
        this.schedulePublish();
        await yieldToEventLoop();
        throwIfCancelled(token);
        sliceStartedAt = performance.now();
      }
    }

    this.settle(search, "completed");
  }

  // Reads the articles a batch at a time, with the next batch requested while this one is searched.
  private createOutcomeReader(search: ActiveSearch, fromIndex: number, token: CancellationToken) {
    let requestIndex = fromIndex;
    let buffered: SequencedOutcome[] = [];
    let pending: Promise<SequencedOutcome[]> | null = null;

    const request = () => {
      const sequence = this.nextSequence++;
      const files = search.articlePaths
        .slice(requestIndex, requestIndex + READ_BATCH_SIZE)
        .map((path) => ({ path, knownMetadata: this.getKnownMetadata(search, path) }));
      const outcomes = this.readFiles({ folderPath: search.folderPath, files }).then((read) => {
        if (read.length === 0) {
          throw new Error("A folder search read returned no files.");
        }

        requestIndex += read.length;

        return read.map((outcome) => ({ outcome, sequence }));
      });

      // A read still pending when the run is cancelled settles with nobody waiting on it.
      outcomes.catch(() => {});

      return outcomes;
    };

    return {
      next: async (path: string) => {
        throwIfCancelled(token);

        if (buffered.length === 0) {
          const read = pending ?? request();

          buffered = await raceWithCancellation(token, () => read);
          pending = requestIndex < search.articlePaths.length ? request() : null;
        }

        const next = buffered.shift();

        if (!next || !isSamePath(next.outcome.path, path)) {
          throw new Error("A folder search read answered for another file.");
        }

        return next;
      },
    };
  }

  // A replacement is planned from a file's text, so a file whose kept text has matches is read again.
  private getKnownMetadata(search: ActiveSearch, path: string) {
    const cached = this.texts.get(path);

    if (
      !cached ||
      (search.replacement && findSearchableTextMatches(cached.text, search.query).length > 0)
    ) {
      return null;
    }

    return cached.metadata;
  }

  private writeActiveDocument(search: ActiveSearch, path: string, capacity = Infinity) {
    const active = this.host.getActiveDocument();

    if (!active || !isSamePath(active.path, path)) {
      return false;
    }

    if (search.replacement) {
      return this.writeActiveDocumentReplacement(search, active, path);
    }

    const found = active.readMatches(search.query, { finalizeProjection: false });

    if (!found) {
      return false;
    }

    search.skipped.delete(path);
    this.writeMatches(
      search,
      path,
      found.text,
      found.matches,
      { source: "editor" },
      {
        capacity,
        sequence: this.nextSequence++,
      },
    );

    return true;
  }

  private writeActiveDocumentReplacement(
    search: ActiveSearch,
    active: FolderSearchActiveDocument,
    path: string,
  ) {
    const plan = active.planReplacement(search.query, search.replacement?.text ?? "");

    if (!plan) {
      return false;
    }

    const sequence = this.nextSequence++;

    if (plan.matches.length > 0 && plan.replaced === null) {
      this.skip(search, path, "replacementRefused", sequence);
      return true;
    }

    search.skipped.delete(path);
    this.writeMatches(
      search,
      path,
      plan.text,
      plan.replaced === plan.baseline ? [] : plan.matches,
      { source: "editor" },
      { capacity: Infinity, sequence },
      { source: "editor", baseline: plan.baseline },
    );

    return true;
  }

  private applyOutcome(
    search: ActiveSearch,
    path: string,
    { outcome, sequence }: SequencedOutcome,
    parser: MarkdownSearchTextParser,
    capacity = Infinity,
  ) {
    if (sequence < (search.writes.get(path) ?? 0)) {
      return;
    }

    switch (outcome.kind) {
      case "unchanged": {
        const cached = this.texts.get(path);

        if (cached) {
          this.writeText(search, path, cached, { capacity, sequence });
        }

        return;
      }
      case "read": {
        if (search.replacement) {
          this.applyReplacementOutcome(search, path, outcome, parser, sequence);
          return;
        }

        const cached = this.texts.get(path);
        let text = cached?.fingerprint === outcome.fingerprint ? cached.text : null;

        if (text === null) {
          try {
            text = parser.read(outcome.content);
          } catch (error) {
            handleUnexpectedError(error, "parseFolderSearchFile");
            this.skip(search, path, "parseFailed", sequence);
            return;
          }
        }

        const entry = { metadata: outcome.metadata, fingerprint: outcome.fingerprint, text };

        this.texts.set(path, entry);
        this.writeText(search, path, entry, { capacity, sequence });
        return;
      }
      case "skipped":
        this.skip(search, path, outcome.error.kind, sequence);
        return;
      case "notArticle":
        this.texts.delete(path);
        search.files.delete(path);
        search.skipped.delete(path);
        search.writes.set(path, sequence);
    }
  }

  private applyReplacementOutcome(
    search: ActiveSearch,
    path: string,
    outcome: Extract<FolderSearchFileOutcome, { kind: "read" }>,
    parser: MarkdownSearchTextParser,
    sequence: number,
  ) {
    const replacement = search.replacement;

    if (!replacement) {
      return;
    }

    let plan;
    let file;

    try {
      plan = parser.planReplacement(outcome.content, search.query, replacement.text);
      file =
        plan.matches.length > 0
          ? planFileReplacement(parser, outcome.content, outcome.lineEnding, plan, replacement.save)
          : null;
    } catch (error) {
      handleUnexpectedError(error, "planFolderReplacement");
      this.skip(search, path, "parseFailed", sequence);
      return;
    }

    const { fingerprint, metadata } = outcome;

    this.texts.set(path, { metadata, fingerprint, text: plan.text });

    if (file?.kind === "refused") {
      this.skip(search, path, "replacementRefused", sequence);
      return;
    }

    search.skipped.delete(path);
    this.writeMatches(
      search,
      path,
      plan.text,
      file?.kind === "planned" ? plan.matches : [],
      { source: "disk", metadata, fingerprint },
      { capacity: Infinity, sequence },
      file?.kind === "planned"
        ? {
            source: "disk",
            content: file.content,
            encoding: outcome.encoding,
            rewritesOtherText: file.rewritesOtherText,
          }
        : null,
    );
  }

  private skip(
    search: ActiveSearch,
    path: string,
    reason: FolderSearchSkipReason,
    sequence: number,
  ) {
    this.texts.delete(path);
    search.files.delete(path);
    search.skipped.set(path, { path, reason });
    search.writes.set(path, sequence);
  }

  private writeText(
    search: ActiveSearch,
    path: string,
    { fingerprint, metadata, text }: CachedSearchText,
    write: { capacity: number; sequence: number },
  ) {
    search.skipped.delete(path);
    this.writeMatches(
      search,
      path,
      text,
      findSearchableTextMatches(text, search.query),
      { source: "disk", metadata, fingerprint },
      write,
    );
  }

  private writeMatches(
    search: ActiveSearch,
    path: string,
    text: string,
    ranges: readonly SearchableTextRange[],
    version: FolderSearchFileVersion,
    { capacity, sequence }: { capacity: number; sequence: number },
    replacement: FolderReplaceFilePlan | null = null,
  ) {
    search.writes.set(path, sequence);

    if (ranges.length === 0) {
      search.files.delete(path);
      return;
    }

    const kept = ranges.slice(0, Math.max(capacity, 1));

    search.files.set(path, {
      path,
      version,
      matches: kept.map((range, ordinal) => ({
        ordinal,
        context: getSearchMatchContext(text, range, SEARCH_MATCH_CONTEXT_RADIUS),
      })),
      clipped: kept.length < ranges.length,
      replacement,
    });
  }

  private settle(search: ActiveSearch, status: Exclude<FolderSearchStatus, "searching">) {
    search.status = status;
    this.publishNow();
  }

  private settleIfIdle(search: ActiveSearch) {
    if (search.status === "searching") {
      return;
    }

    search.status = search.articlePaths.some((path) => search.files.get(path)?.clipped)
      ? "limited"
      : search.status === "limited"
        ? "completed"
        : search.status;
  }

  private countMatchesBefore(search: ActiveSearch, index: number) {
    let count = 0;

    for (const path of search.articlePaths.slice(0, index)) {
      count += search.files.get(path)?.matches.length ?? 0;
    }

    return count;
  }

  // A stopped run leaves files past it unsearched, so results it never reached are not shown as
  // though it had.
  private forgetFilesFrom(search: ActiveSearch, index: number) {
    for (const path of search.articlePaths.slice(index)) {
      search.files.delete(path);
      search.skipped.delete(path);
    }
  }

  private forgetFilesOutside(search: ActiveSearch) {
    const kept = new PathMap<FolderSearchFileResult>();
    const keptSkipped = new PathMap<FolderSearchSkippedFile>();

    for (const path of search.articlePaths) {
      const file = search.files.get(path);
      const skipped = search.skipped.get(path);

      if (file) kept.set(path, file);
      if (skipped) keptSkipped.set(path, skipped);
    }

    search.files = kept;
    search.skipped = keptSkipped;
  }

  private schedulePublish() {
    if (this.publishTimeout !== undefined) {
      return;
    }

    this.publishTimeout = globalThis.setTimeout(() => this.publishNow(), PUBLISH_INTERVAL_MS);
  }

  private publishNow() {
    globalThis.clearTimeout(this.publishTimeout);
    this.publishTimeout = undefined;

    if (this.isDisposed) {
      return;
    }

    const search = this.search;

    if (!search) {
      this.publish(null);
      return;
    }

    const files: FolderSearchFileResult[] = [];
    const skipped: FolderSearchSkippedFile[] = [];
    let matchCount = 0;

    for (const path of search.articlePaths) {
      const file = search.files.get(path);
      const skippedFile = search.skipped.get(path);

      if (file) {
        files.push(file);
        matchCount += file.matches.length;
      }

      if (skippedFile) {
        skipped.push(skippedFile);
      }
    }

    this.publish({
      id: search.id,
      folderPath: search.folderPath,
      query: search.query,
      replacement: search.replacement?.text ?? null,
      status: search.status,
      searchedFileCount: search.searchedFileCount,
      articleCount: search.articlePaths.length,
      matchCount,
      files,
      skipped,
    });
  }

  private readFiles(args: ReadFolderSearchFilesArgs) {
    return (this.host.readFiles ?? readFolderSearchFiles)(args);
  }

  private async createParser() {
    const parser = await (this.host.createParser ?? createMarkdownSearchTextParser)();

    if (this.isDisposed) {
      parser.dispose();
      throw new CancellationError();
    }

    this.parserInstance = parser;

    return parser;
  }
}
