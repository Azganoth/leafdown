# Engineering Patterns

This document explains recurring implementation patterns in Leafdown. Keep it
focused on stable decisions: what to use, what to avoid, and what mistake the
pattern prevents.

Use `AGENTS.md` for hard repository rules. Use this document for the reasoning
behind local patterns.

## Path Identity

Use when comparing or storing native file and folder paths.

Use:

- `isSamePath(left, right)` for equality.
- `isSameNullablePath(left, right)` when both values may be `null`.
- `isSameOrParentPath(parent, child)` for containment.
- `PathSet` for sets of paths.
- `PathMap` when a map is keyed by path identity.

Avoid:

- Comparing paths with `===`.
- Using `Set<string>` or `Map<string, T>` with raw paths when identity matters.
- Mapping through `getPathIdentityKey` outside low-level path utilities unless a
  plain string key is explicitly needed.

Why:

Windows paths are case-insensitive and may use `\` or `/`. POSIX paths remain
case-sensitive. Centralizing path identity keeps those rules consistent.

Example:

```ts
const expandedPaths = new PathSet(expandedDirectoryPaths);

if (expandedPaths.has(node.path)) {
  // Same folder identity, regardless of Windows casing or slash style.
}
```

## Disposables And Lifecycle

Use disposables for listeners, watchers, subscriptions, cancellation sources,
and other resources that must be released when a scope ends.

Use:

- `toDisposable(fn)` to wrap a cleanup function.
- `DisposableStore` when one scope owns multiple disposables.
- `MutableDisposable` when a scope owns one replaceable disposable.
- `DisposableMap` when a scope owns keyed disposables, such as named native
  listeners.

Avoid:

- Keeping cleanup functions in loose arrays when the owner has a clear lifetime.
- Replacing an active listener without disposing the previous one.
- Letting async listener setup skip cleanup if the owner was disposed first.

Why:

Frontend code often crosses React, Tauri events, ProseMirror plugins, and async
work. Explicit ownership prevents stale listeners and late async setup from
surviving beyond the UI scope that created them.

Example:

```ts
const listeners = new DisposableMap<"changed" | "error", () => void>();

listeners.set("changed", await appWindow.listen(EVENT_NAME, handleEvent));
listeners.dispose();
```

## Cancellation

Use cancellation when async work can become stale before it finishes.

Use:

- `CancellationTokenSource` to create a cancellable scope.
- `CancellationToken.None` when an API requires a token but there is no
  cancellation scope.
- `throwIfCancelled(token)` at meaningful checkpoints.
- `raceWithCancellation(token, task)` when a task result should lose immediately to
  cancellation and the cancellation listener must be cleaned up.
- `runWithCancellation(token, task)` when the underlying operation cannot be
  stopped but stale results should be rejected after completion.

Avoid:

- Returning late async results after their owner changed or was disposed.
- Adding ad hoc `let disposed = false` guards for token-aware async work.
- Racing cancellation manually without disposing the cancellation listener.

Local disposed guards are still fine for effect-local setup and teardown when
the underlying API is not cancellable.

Why:

Tauri API calls, image resolution, folder scans, and open-session transitions
can finish after the user has moved on. Cancellation makes "this result is
stale" explicit.

Example:

```ts
const result = await raceWithCancellation(cancellationToken, () =>
  resolveMarkdownImageTarget(payload),
);
```

## Async Task Runners

Use the shared async runners when a task has a recognizable scheduling rule.

Use:

- `RestartableTaskRunner` when starting a new run should cancel the previous
  run's token.
- `DebouncedTaskRunner` when repeated requests should collapse into one delayed
  run and callers need the resulting promise.
- `TaskLimiter` when similar tasks should run with bounded concurrency.
- `SequentialTaskQueue` when tasks must run one at a time in request order.
- `AsyncLazy` when an expensive async value should load once and be shared.

Avoid:

- Hand-rolling queues with module-level promise variables when a shared runner
  fits exactly.
- Adding a new async primitive before there are real call sites.
- Using a runner when a plain `await` is clearer.

Why:

The runner names document the concurrency rule. They also centralize cancellation
and error behavior that is easy to get subtly wrong.

Example:

```ts
const saveQueue = new SequentialTaskQueue();

export const saveDocument = () => saveQueue.run(saveDocumentNow);
```

## Commands

The command layer maps command IDs to application behavior. Feature-specific
execution should remain owned by the feature that understands the domain.

Use:

- `src/commands/metadata.ts` for labels and shortcuts.
- `src/commands/application.ts` for application command handlers and state
  getters.
- `src/commands/state.ts` for routing command state between editor and
  application commands.
- Feature APIs for the actual domain behavior.

Avoid:

- Putting editor, document, or folder business logic directly in menu
  components.
- Deep-importing feature internals into UI just to execute a command.
- Duplicating command availability checks in multiple UI surfaces.

Why:

Menus, shortcuts, context popups, and future command surfaces should agree on
labels, shortcuts, enabled state, and behavior.

Example:

```ts
const saveCommand = appCommand(file.saveDocument, file.getSaveDocumentState);
```

## Editor Plugins

Editor plugins should follow ProseMirror and Milkdown lifecycles. Keep plugin
state and DOM ownership explicit.

Use:

- Milkdown utilities and official plugins before custom ProseMirror behavior.
- ProseMirror plugin state for editor-derived state that must update with
  transactions.
- NodeView classes when the view owns DOM, subscriptions, or cancellable async
  work.
- Disposables and cancellation sources for plugin-owned resources.

Avoid:

- Treating plugin code like React component code.
- Keeping plugin-owned DOM/listeners without a clear `destroy` path.
- Updating external application state from every transaction when a smaller
  change check is available.

Why:

The editor has its own lifecycle and transaction model. Keeping ownership local
prevents stale views, duplicate listeners, and unnecessary React updates.

Example:

```ts
view: (view) => {
  let commandState = getEditorCommandState(view);

  return {
    update: (nextView) => {
      const nextCommandState = getEditorCommandState(nextView);

      if (commandStatesEqual(commandState, nextCommandState)) {
        return;
      }

      commandState = nextCommandState;
      onCommandStateChanged(nextCommandState);
    },
  };
};
```

## Stores And Persistence

Stores own UI or feature state. Persistence should be explicit about keys,
versions, defaults, and migrations.

Use:

- Store-local defaults for state owned by that store.
- Persisted key lists for fields that should cross app restarts.
- Versioned migrations for persisted state shape changes.
- Test helpers from `src/test/` for store setup.

Avoid:

- Persisting every store field by default.
- Hiding domain workflows inside stores when a service/workflow module is the
  clearer owner.
- Duplicating default values in tests instead of importing the default constants
  when those constants are part of the contract.

Why:

Zustand stores are easy to mutate from anywhere. Clear ownership and persistence
contracts keep app state predictable as settings and session workflows grow.

Example:

```ts
const SETTINGS_PERSISTED_KEYS = [
  "theme",
  "sidebarVisible",
] satisfies PersistedTauriStoreKey<SettingsPersistedState>[];
```

## Testing

Use shared test helpers before adding new mocks, factories, or setup.

Use:

- `src/test/mocks/` for shared external API mocks.
- `src/test/utils/` for store setup, Tauri helpers, React rendering, events, and
  editor helpers.
- `src/test/factories/` for reusable domain fixtures.
- Co-located tests for single modules.
- Feature-level `tests/` directories only for broader integration behavior.

Avoid:

- Recreating Tauri `invoke`, clipboard, toast, or platform mocks in individual
  test files.
- Leaving Zustand stores dirty between tests.
- Copying large object fixtures when a factory can express the relevant
  difference.
- Testing private implementation details when public behavior is enough.

Why:

Leafdown tests cross global stores, native boundaries, editor lifecycle state,
and DOM behavior. Shared helpers keep setup isolated and make failures easier to
read.

Example:

```ts
beforeEach(() => setDefaultSettings());

vi.mocked(invoke).mockResolvedValue({ kind: "renderable", path: imagePath });
```

## Tauri API Modules

Raw Tauri `invoke` calls should live in feature-owned API modules. Other feature
services, hooks, commands, and plugins should call those typed wrappers instead
of repeating command strings.

Use:

- `src/features/<feature>/services/*Api.ts` for command constants, argument
  DTOs, result DTOs, error DTOs, event names, event payloads, and raw `invoke`
  wrappers.
- Higher-level service modules for dialogs, cancellation, store updates,
  user-facing notifications, and mapping backend DTOs into frontend domain
  shapes.
- API boundary tests to assert the raw command name and payload shape.

Avoid:

- Scattering raw command strings through hooks, plugins, command handlers, or
  tests that are not specifically testing the API boundary.
- Creating a global `src/lib/api.ts` registry for domain-specific commands.
- Putting UI concerns, toasts, stores, or workflow orchestration in API modules.

Why:

The Tauri API module is the local source of truth for the frontend side of a
Rust command contract. Keeping it feature-owned preserves domain boundaries
while avoiding stringly typed command calls across the app.

Example:

```ts
export const OPEN_MARKDOWN_FILE_COMMAND = "open_markdown_file";

export interface OpenMarkdownFileArgs {
  path: string;
}

export const openMarkdownFile = ({ path }: OpenMarkdownFileArgs) =>
  invoke<OpenMarkdownFileResult>(OPEN_MARKDOWN_FILE_COMMAND, { path });
```

## Tauri Boundary Errors

Tauri commands should return serializable success and error payloads. The frontend
should map those known payloads to user-facing messages close to the owning feature.

Use:

- Rust-side validation at the command boundary.
- Tagged error payloads with a stable `kind`.
- Specific variants for common recoverable IO cases such as invalid paths,
  missing resources, and permission denied.
- Feature-owned error message helpers.

Avoid:

- Treating backend error payloads as arbitrary unknown objects after the command
  contract has narrowed them.
- Reusing generic object-shape helpers when a feature-owned error union is more
  precise.
- Letting raw backend messages become the only user-facing error text.

Why:

The Tauri boundary is the contract between native IO and the frontend. Tagged
errors keep that contract testable and make frontend messaging consistent.

Example:

```ts
type OpenMarkdownDocumentError =
  | { kind: "missingFile"; path: string }
  | { kind: "permissionDenied"; path: string; message: string };
```

## Error Handling

Classify failures before choosing a handler.

Use:

- Feature-owned tagged unions and message helpers for domain errors.
- Local `catch` plus `notifyError(getXErrorMessage(error))` for expected domain
  errors at UI or command boundaries.
- Silent local handling for control-flow errors such as cancellation, stale async
  work, and user-cancelled pickers.
- `notifyOperationFailure(title, error, context)` for user-triggered operations
  that failed but do not have a feature-owned error contract.
- `handleUnexpectedError(error, context)` for internal failures that should be
  logged but do not need immediate user feedback.
- The diagnostics feature's unexpected-error reporter, installed once at
  startup, to mirror shared unexpected-error logs into the local Tauri log file
  as structured diagnostic events.
- Feature-owned diagnostic events for expected operation failures, folder watcher
  lifecycle/error transitions, clean shutdown, and slow operation timings when
  those events help support without adding active Markdown document text.
- Diagnostics feature helpers such as `writeDiagnosticOperationFailure`,
  `writeDiagnosticOperationWarning`, `writeDiagnosticOperationLifecycle`, and
  `writeSlowOperationDiagnostic` for operation-scoped logs, rather than
  hand-assembling repeated event envelopes at call sites.
- `installUnexpectedErrorHandlers()` once at startup to catch errors that escape
  local handling. Keep the returned cleanup wired into dev hot disposal.
- `UnexpectedErrorBoundary` around the main application surface for React render
  failures, including React component stack logging.
- `invariant(condition, message)` for programming assertions.

Avoid:

- Passing domain error payloads to `notifyOperationFailure`.
- Logging cancellation errors.
- Explicitly adding active Markdown document text to diagnostic logs or copied
  summaries.
- Uploading diagnostic logs automatically.
- Calling `console.error` outside the shared unexpected-error helper.
- Creating a global `AppError` hierarchy for feature-specific domain errors.
- Showing a toast for every unexpected internal failure.
- Relying on global error handlers instead of local handling for expected
  workflows.

Why:

Expected domain failures need precise user-facing recovery text. Unexpected
failures need consistent logging and enough context to debug. Keeping those paths
separate prevents generic "something failed" helpers from swallowing useful
domain information. Unexpected logs are lightly deduped to keep repeated global
events or render-loop failures from flooding the console and local log file.
Diagnostic logs are JSON Lines. The Rust log formatter owns the envelope fields:
UTC `timestamp`, diagnostic `runId`, stable frontend/backend `target`, and log
`level`. Frontend and backend log messages provide event-specific fields for
unexpected errors, expected operation failures and warnings, lifecycle events,
and slow operation timings.
Diagnostic entries may include operation labels, diagnostic run identifiers,
error messages, stack traces, React component stacks, and local file paths when
those paths are part of the failed workflow. Captured browser, editor, or library
error messages and stack traces may include user content if the thrown error
includes it; application code should not add active document text as diagnostic
context. Frontend diagnostic normalization truncates long strings and drops
unsupported `undefined` values, but it is not redaction.

Example:

```ts
try {
  await openMarkdownFileAtPath(path);
} catch (error) {
  notifyError(getOpenMarkdownFileErrorMessage(error));
}

try {
  await getCurrentWindow().setFullscreen(nextFullscreen);
} catch (error) {
  notifyOperationFailure("Could not update fullscreen mode.", error, "toggleFullscreen");
}

void createEditor().catch((error) => handleUnexpectedError(error, "createMilkdownEditor"));
```
