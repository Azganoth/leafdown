# Engineering Patterns

This document records recurring implementation practices: when to use them, what to avoid, and the failure modes they prevent. It does not define product behavior, architecture boundaries, or repository rules.

Use [Architecture](./architecture.md) for ownership and dependency direction, and this document for the reasoning behind local patterns.

## Foundations

### Path Identity

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
- Mapping through `getPathIdentityKey` outside low-level path utilities unless a plain string key is explicitly needed.

Why:

Leafdown treats Windows-drive and UNC paths as case-insensitive and normalizes slash style; other paths remain case-sensitive. Centralizing path identity keeps those rules consistent.

Example:

```ts
const expandedPaths = new PathSet(expandedDirectoryPaths);

if (expandedPaths.has(node.path)) {
  // Same folder identity, regardless of Windows casing or slash style.
}
```

### Disposables And Lifecycle

Use disposables for listeners, watchers, subscriptions, cancellation sources, and other resources that must be released when a scope ends.

Use:

- `toDisposable(fn)` to wrap a cleanup function.
- `DisposableStore` when one scope owns multiple disposables.
- `MutableDisposable` when a scope owns one replaceable disposable.
- `DisposableMap` when a scope owns keyed disposables, such as named native listeners.

Avoid:

- Keeping cleanup functions in loose arrays when the owner has a clear lifetime.
- Replacing an active listener without disposing the previous one.
- Letting async listener setup skip cleanup if the owner was disposed first.

Why:

Frontend code often crosses React, Tauri events, ProseMirror plugins, and async work. Explicit ownership prevents stale listeners and late async setup from surviving beyond the UI scope that created them.

Example:

```ts
const listeners = new DisposableMap<"changed" | "error", () => void>();

listeners.set("changed", await appWindow.listen(EVENT_NAME, handleEvent));
listeners.dispose();
```

### Cancellation

Use cancellation when async work can become stale before it finishes.

Use:

- `CancellationTokenSource` to create a cancellable scope.
- `CancellationToken.None` when an API requires a token but there is no cancellation scope.
- `throwIfCancelled(token)` at meaningful checkpoints.
- `raceWithCancellation(token, task)` when a task result should lose immediately to cancellation and the cancellation listener must be cleaned up.
- `runWithCancellation(token, task)` when the underlying operation cannot be stopped but stale results should be rejected after completion.

Avoid:

- Returning late async results after their owner changed or was disposed.
- Adding ad hoc `let disposed = false` guards for token-aware async work.
- Racing cancellation manually without disposing the cancellation listener.

Local disposed guards are still fine for effect-local setup and teardown when the underlying API is not cancellable.

Why:

Tauri API calls, image resolution, folder scans, and open-session transitions can finish after the user has moved on. Cancellation makes "this result is stale" explicit.

Example:

```ts
const result = await raceWithCancellation(cancellationToken, () =>
  resolveMarkdownImageTarget(payload),
);
```

### Async Task Runners

Use the shared async runners when a task has a recognizable scheduling rule.

Use:

- `RestartableTaskRunner` when starting a new run should cancel the previous run's token.
- `DebouncedTaskRunner` when repeated requests should collapse into one delayed run and callers need the resulting promise; use it for folder-watcher refreshes so filesystem event bursts coalesce before rescanning the article navigator.
- `TaskLimiter` when similar tasks should run with bounded concurrency.
- `SequentialTaskQueue` when tasks must run one at a time in request order.
- `AsyncLazy` when an expensive async value should load once and be shared.

Avoid:

- Hand-rolling queues with module-level promise variables when a shared runner fits exactly.
- Adding a new async primitive before there are real call sites.
- Using a runner when a plain `await` is clearer.

Why:

The runner names document the concurrency rule. They also centralize cancellation and error behavior that is easy to get subtly wrong.

Example:

```ts
const saveQueue = new SequentialTaskQueue();

export const saveDocument = () => saveQueue.run(saveDocumentNow);
```

## Frontend Patterns

### Commands

Product-facing labels, shortcuts, and availability belong in [Reference](./reference.md). [Architecture](./architecture.md#editor-architecture) defines which interaction layer owns command execution; this section explains how to realize that boundary.

The command layer maps command IDs to application behavior. Feature-specific execution remains owned by the feature that understands the domain.

Use:

- `src/commands/metadata.ts` for labels and shortcuts.
- `src/commands/application.ts` for application command handlers and state getters.
- `src/commands/state.ts` for routing command state between editor and application commands.
- `src/features/editor/commands/contract.ts` and `src/features/editor/commands/metadata.ts`, imported directly, when only editor command IDs, the command state shape, its derived constants, or command labels are needed.
- Feature APIs for the actual domain behavior.

Avoid:

- Putting editor, document, or folder business logic directly in menu components.
- Deep-importing feature internals into UI just to execute a command.
- Duplicating command availability checks in multiple UI surfaces.
- Reaching the editor command contract through `@/features/editor`.

Why:

Menus, shortcuts, context popups, and future command surfaces should agree on labels, shortcuts, enabled state, and behavior.

`@/features/editor` exports `MilkdownEditor`, so importing anything from that root loads Milkdown and Shiki. Executing a command needs the editor and should still go through the feature root; describing one does not. Keeping the contract in a Milkdown-free leaf module lets the command layer, the session bridge, and test infrastructure route and label commands without loading an editor they never render. `EDITOR_COMMANDS` satisfies the contract's manifest, so the two cannot drift.

Command metadata is descriptive across surfaces, but shortcut execution remains owned by the relevant layer:

- The window-level application hook derives its executable shortcuts from `APPLICATION_SHORTCUT_COMMAND_IDS`; it must not dispatch every command that happens to have shortcut metadata.
- Semantic editor shortcuts route canonical Leafdown editor command IDs from the editor keymap and consume recognized owned bindings even when the command is unavailable. Disable only the corresponding Milkdown semantic binding.
- Structural editor keys and native clipboard gestures remain with Milkdown, ProseMirror, or the browser. Focused text inputs and embedded editor inputs must not be captured by editor bindings or rerouted as editor commands by the application hook.

Example:

```ts
const saveCommand = appCommand(file.saveDocument, file.getSaveDocumentState);
```

### Editor Plugins

Editor plugins should follow ProseMirror and Milkdown lifecycles. Keep plugin state and DOM ownership explicit.

Before using a Milkdown API or plugin, confirm the installed package version and match Leafdown's established integration. Do not assume an upstream example applies unchanged.

Use:

- Milkdown utilities and official plugins before custom ProseMirror behavior.
- ProseMirror plugin state for editor-derived state that must update with transactions.
- NodeView classes when the view owns DOM, subscriptions, or cancellable async work.
- Disposables and cancellation sources for plugin-owned resources.

Avoid:

- Treating plugin code like React component code.
- Keeping plugin-owned DOM/listeners without a clear `destroy` path.
- Updating external application state from every transaction when a smaller change check is available.

Why:

The editor has its own lifecycle and transaction model. Keeping ownership local prevents stale views, duplicate listeners, and unnecessary React updates.

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

### Focus Visibility

Every control that can hold focus must render a visible focus indicator. Suppressing the native outline is fine; suppressing it without putting something in its place is the defect.

Use:

- `focus-visible:` for controls a pointer can also activate, so a click does not leave a ring behind. Menu items are the exception and use `focus:`, because their focus is roving and follows the pointer.
- The `Button` treatment, `focus-visible:border-ring` with `focus-visible:ring-3 focus-visible:ring-ring/50`, as the reference for hand-built surfaces.
- `outline-hidden` rather than `outline-none` when suppressing the native outline.
- Room for the ring wherever a control sits inside a clipping box. `overflow` and `contain: paint` both cut a `ring-*` box-shadow off at the boundary.

Avoid:

- `outline-hidden` or `outline-none` with no paired `focus-visible:` rule.
- Relying on `outline-ring/50` in `app.css` for the indicator. It sets outline color only, so it renders nothing until a style and width exist.
- Treating an open or active state as the focus indicator. They answer different questions and a keyboard user needs both.

Why:

Leafdown builds its own titlebar, menu shell, and navigator, so focus presentation is not inherited from a platform control. `outline-hidden` and `outline-none` are not interchangeable at the point where it matters: Tailwind compiles `outline-hidden` to a transparent outline and `outline-none` to `outline-style: none`, and under Windows High Contrast the transparent outline is repainted as a real one while `box-shadow` rings are dropped entirely. A ring is the indicator for ordinary rendering and the outline is the one that survives forced colors.

Example:

```tsx
<MenuPrimitive.Trigger className="outline-hidden select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted" />
```

### Keyboard Traversal

Use when a hand-built surface groups controls the user moves between: a toolbar, a tree, a menu, a row of window controls.

Use:

- One tab stop for the surface, roving to the control that last held focus, with every other control at `tabIndex={-1}`.
- Arrow keys, `Home`, and `End` for movement inside the surface, leaving `Tab` to leave it.
- A traversal model derived from the data when the surface owns its own movement, as `articleNavigatorTraversal.ts` does for the navigator's rows.
- Position data attributes read back off the DOM when a primitive already owns one axis, as the context popup does for vertical movement across the toolbar's horizontal roving focus.
- An explicit focus return when a surface that took focus closes.

Avoid:

- Giving every item in a composite surface its own tab stop.
- Opening a document, running a command, or otherwise acting on focus movement alone.
- Unmounting the control that holds the tab stop.
- Leaving focus on the document body after a surface closes.

Why:

Leafdown builds its own titlebar, menu bar, context popup, and navigator, so traversal is not inherited from a platform control and every part of it is Leafdown's to implement. A composite surface should cost one stop in the tab sequence rather than one per item, which is also what makes `Tab` a reliable way out. Moving focus and acting are separate: focus that selects would open every document arrowed past. Under virtualization the two rules meet, because the control holding the tab stop has to stay rendered even when it scrolls out of the window — unmounting it drops focus to the document body and leaves the surface with no tab stop at all. [Decisions](./decisions.md#expose-the-article-navigator-as-a-flattened-tree) records how the navigator resolves this, including why window controls stay out of the sequence entirely.

Example:

```tsx
<div role="treeitem" tabIndex={isTabStop ? 0 : -1} aria-level={depth} aria-selected={isActive} />
```

### Stores And Persistence

Stores own UI or feature state. Persisted state additionally declares a contract shape that validates and repairs whatever it loads from disk.

Use:

- Store-local defaults for state owned by that store.
- `definePersistedState` with one contract per field, closed by `satisfies Record<keyof State, unknown>`, so the sanitizer and the persisted key list both derive from that shape.
- The contracts in `src/lib/valueContract.ts` — `booleanValue`, `numberValue`, `stringValue`, `oneOf`, `listOf`, `boundedList`, and `salvagedRecord` — before writing a bespoke check.
- Versioned migrations for persisted state shape changes. They run before sanitizing, so a migration may leave a value the contracts then repair.
- Test helpers from `src/test/` for store setup.

Avoid:

- Persisting every store field by default.
- Writing a persisted key list by hand, or validating a field without declaring it in the shape.
- Inferring whether a load changed anything by comparing or cloning state. A contract reports `valid`, `repaired`, or `invalid` directly.
- Hiding domain workflows inside stores when a service/workflow module is the clearer owner.
- Duplicating default values in tests instead of importing the default constants when those constants are part of the contract.

Why:

Zustand stores are easy to mutate from anywhere, and persisted state arrives from a user-writable file. The sanitizer has to distinguish a value it accepted from one it rewrote, because that is what tells it the file on disk is stale; [Decisions](./decisions.md#own-persisted-state-contracts-instead-of-a-schema-library) records why a parse-style schema library cannot express that third outcome. Deriving the key list from the same shape closes what a hand-written list left open: `satisfies PersistedTauriStoreKey<State>[]` checked that each listed key was valid, never that every field was listed, so a new field could be validated and then silently never persisted.

Example:

```ts
const RECENT_ITEMS_CONTRACT = definePersistedState({
  recentFiles: boundedList(listOf(stringValue), RECENT_ITEM_LIMIT),
  recentFolders: boundedList(listOf(stringValue), RECENT_ITEM_LIMIT),
  version: numberValue,
} satisfies Record<keyof RecentItemsState, unknown>);
```

### Testing

Use shared test helpers before adding new mocks, factories, or setup.

Use:

- `src/test/mocks/` for shared external API mocks.
- `src/test/utils/` for store setup, Tauri helpers, React rendering, events, and editor helpers.
- `src/test/factories/` for reusable domain object builders.
- `src/test/fixtures/` for literal sample data such as Markdown, clipboard HTML, and paths.
- `src/test/setup/` for the Vitest setup files each project loads.
- Co-located tests for single modules.
- Feature-level `tests/` directories only for broader integration behavior.
- The `.test.tsx` extension for any test needing a DOM. The Vitest projects select the environment by extension: `.test.ts` runs under `node` and `.test.tsx` runs under `happy-dom`, regardless of whether the file contains JSX.

Avoid:

- Recreating Tauri `invoke`, clipboard, toast, or platform mocks in individual test files.
- Leaving Zustand stores dirty between tests.
- Copying large object fixtures when a factory can express the relevant difference.
- Testing private implementation details when public behavior is enough.

Why:

Leafdown tests cross global stores, native boundaries, editor lifecycle state, and DOM behavior. Shared helpers keep setup isolated and make failures easier to read.

Example:

```ts
beforeEach(() => setDefaultSettings());

vi.mocked(invoke).mockResolvedValue({ kind: "renderable", path: imagePath });
```

## Tauri Boundaries

### Tauri API Modules

Raw Tauri `invoke` calls for Leafdown Rust commands should live in feature-owned API modules. Other feature services, hooks, commands, and plugins should call those typed wrappers instead of repeating command strings. This boundary does not require wrappers for ordinary Tauri plugin APIs, such as window, dialog, or opener behavior.

Use:

- `src/features/<feature>/services/*Api.ts` for command constants, argument DTOs, result DTOs, error DTOs, event names, event payloads, and raw `invoke` wrappers.
- Higher-level service modules for dialogs, cancellation, store updates, user-facing notifications, and mapping backend DTOs into frontend domain shapes.
- API boundary tests to assert the raw command name and payload shape.

Avoid:

- Scattering raw command strings through hooks, plugins, command handlers, or tests that are not specifically testing the API boundary.
- Creating a global `src/lib/api.ts` registry for domain-specific commands.
- Putting UI concerns, toasts, stores, or workflow orchestration in API modules.

Why:

The Tauri API module is the local source of truth for the frontend side of a Rust command contract. Keeping it feature-owned preserves domain boundaries while avoiding stringly typed command calls across the app.

Example:

```ts
export const OPEN_MARKDOWN_FILE_COMMAND = "open_markdown_file";

export interface OpenMarkdownFileArgs {
  path: string;
}

export const openMarkdownFile = ({ path }: OpenMarkdownFileArgs) =>
  invoke<OpenMarkdownFileResult>(OPEN_MARKDOWN_FILE_COMMAND, { path });
```

### Tauri Boundary Errors

Tauri commands should return serializable success and error payloads. The frontend should map those known payloads to user-facing messages close to the owning feature. Use [Error Handling](#error-handling) after a feature receives a boundary error.

Use:

- Rust-side validation at the command boundary.
- Tagged error payloads with a stable `kind`.
- Specific variants for common recoverable IO cases such as invalid paths, missing resources, and permission denied.
- Feature-owned error message helpers.

Avoid:

- Treating backend error payloads as arbitrary unknown objects after the command contract has narrowed them.
- Reusing generic object-shape helpers when a feature-owned error union is more precise.
- Letting raw backend messages become the only user-facing error text.

Why:

The Tauri boundary is the contract between native IO and the frontend. Tagged errors keep that contract testable and make frontend messaging consistent.

Example:

```ts
type OpenMarkdownDocumentError =
  | { kind: "missingFile"; path: string }
  | { kind: "permissionDenied"; path: string; message: string };
```

## Failure And Diagnostics

### Error Handling

For serialized Tauri command errors, first follow [Tauri Boundary Errors](#tauri-boundary-errors). Then classify the received failure before choosing a handler.

Use:

- Local `catch` plus `notifyError(getXErrorMessage(error))` for expected domain errors at UI or command boundaries.
- Silent local handling for control-flow errors such as cancellation, stale async work, and user-cancelled pickers.
- `notifyOperationFailure(title, error, context)` for user-triggered operations that failed but do not have a feature-owned error contract.
- `handleUnexpectedError(error, context)` for internal failures that should be logged but do not need immediate user feedback.
- The diagnostics feature's unexpected-error reporter, installed once at startup, to mirror shared unexpected-error logs into the local Tauri log file as structured diagnostic events.
- Feature-owned diagnostic events for expected operation failures, folder watcher lifecycle/error transitions, confirmed app/window close lifecycle, and slow operation timings when they aid support. Use diagnostics helpers rather than hand-assembling repeated event envelopes.
- `installUnexpectedErrorHandlers()` once at startup to catch errors that escape local handling. Keep the returned cleanup wired into dev hot disposal.
- `UnexpectedErrorBoundary` around the main application surface for React render failures, including React component stack logging.
- `invariant(condition, message)` for programming assertions.

Avoid:

- Passing domain error payloads to `notifyOperationFailure`.
- Logging cancellation errors.
- Calling `console.error` outside the shared unexpected-error helper.
- Creating a global `AppError` hierarchy for feature-specific domain errors.
- Showing a toast for every unexpected internal failure.
- Relying on global error handlers instead of local handling for expected workflows.

Why:

Expected domain failures need precise user-facing recovery text. Unexpected failures need consistent logging and enough context to debug. Keeping those paths separate prevents generic "something failed" helpers from swallowing useful domain information. Unexpected logs are lightly deduped to keep repeated global events or render-loop failures from flooding the console and local log file.

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
