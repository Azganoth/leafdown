# Frontend Instructions

## Architecture And Organization

- Organize domain-owned frontend code by feature under `src/features/<feature-name>/`.
- Use standard feature subdirectories such as `components/`, `hooks/`, `commands/`, `services/`, `stores/`, `plugins/`, `utils/`, and `tests/`.
- Colocate types with the module that owns the concept. Use a `types/` directory only for a coherent set of shared domain contracts without a clearer owner.
- Keep feature roots limited to their public `index.ts` API and standard subdirectories unless an established local structure provides a clear reason otherwise.
- Keep application composition in `src/components/layout/` and `src/components/screens/`. These components may compose multiple feature APIs but must not own domain workflows.
- Keep application command registration in `src/commands/`. The command layer maps command IDs to feature APIs; feature-specific execution remains owned by the relevant feature.
- Keep generic UI primitives in `src/components/ui/` and domain-agnostic utilities in `src/lib/`. Global use alone does not make domain-owned behavior generic.
- Keep domain features independent of higher-level orchestration, command registration, and application-composition layers. Dependencies should flow from those layers toward domain features.
- Import other features through their root `index.ts` public API rather than through deep feature paths.

## Styling And UI Primitives

- Reuse theme tokens from `src/App.css` for standard application surfaces, text, borders, focus states, and semantic colors.
- Reuse existing primitives from `src/components/ui/` before introducing another component or abstraction.
- Use `cn` from `src/lib/cn.ts` for conditional Tailwind class composition.
- When behavior-rich accessible primitives are needed, prefer the installed Radix primitives over recreating interaction, focus, or accessibility behavior.
- If a change requires a new generic UI primitive that has not already been authorized, explain the required primitive and request direction before implementing it.

## Interaction And Accessibility

- Preserve semantic roles and names, keyboard and pointer reachability, focus ownership and return, disabled-state behavior, selection behavior, and established dismissal rules when changing interactive surfaces.
- Test behavior through the public interaction rather than component internals. Use manual Tauri verification for accessibility-tree output, focus behavior, virtualization, native window interaction, or layout that the automated DOM environment cannot observe.

## React And TypeScript Conventions

- Keep components and hooks pure, with side effects outside render.
- Use effects only to synchronize with external systems. Compute derived data during render and perform interaction-driven side effects in event handlers.
- Define components at module scope using function declarations. Never define components inside other components.
- Prefer arrow functions for non-component frontend functions. Use function declarations when required or clearly improved by generators, overloads, dynamic `this` or `arguments`, or constructible functions.
- Use interfaces for object shapes and React props. Use type aliases for unions, primitives, tuples, mapped types, and complex utility types.
- Rely on React Compiler for routine memoization. Use `useMemo`, `useCallback`, or `React.memo` only when measured performance or a stable-identity contract requires explicit control.
- Prefer composition or an existing feature store over deep prop drilling. Do not introduce global state solely to avoid passing a small number of props.
- Read a store through a selector, one field at a time, as `useStore((state) => state.field)`. Use `useStore.getState()` for one-shot reads outside React. Calling a store hook with no selector subscribes the component to every field it holds.
- Name reusable configuration values, thresholds, timeouts, and other non-obvious constants. Use `UPPER_SNAKE_CASE` for immutable module-level constants and constant manifest arrays.

## Shared Foundations

- Compare, store, and key native paths through the [path identity helpers](../docs/patterns.md#path-identity) rather than `===`, `Set<string>`, or `Map<string, T>`. Windows casing and slash style make raw string equality wrong.
- Classify a failure before handling it, following the [error handling patterns](../docs/patterns.md#error-handling) for expected domain errors, silent control-flow errors, operation failures without a feature-owned contract, and unexpected internal errors.

## Resource Lifecycles

- Follow the [disposable and lifecycle patterns](../docs/patterns.md#disposables-and-lifecycle) for listeners, watchers, subscriptions, cancellation sources, and other resources with scoped ownership.
- Ensure asynchronously created resources are disposed immediately if their owning scope ends before setup completes.

## Milkdown And Editor

- Use `@milkdown/kit` re-exports, including `@milkdown/kit/prose/*`, instead of installing or importing underlying Milkdown or ProseMirror packages that Kit already provides.
- Prefer existing Milkdown presets, plugins, composables, and utilities before adding custom ProseMirror behavior.
- For custom plugins and node views, follow the [editor plugin patterns](../docs/patterns.md#editor-plugins) for state ownership, DOM ownership, lifecycle cleanup, disposables, and cancellation.
- Preserve Markdown round-trip behavior when changing schemas, parsing, serialization, clipboard handling, or document transformations, and cover those changes with focused tests.

## Testing

- Follow the [testing patterns](../docs/patterns.md#testing) and reuse helpers, mocks, factories, fixtures, and setup from `src/test/` before creating new test infrastructure.
- Co-locate tests that cover a single module. Use a feature-level `tests/` directory for broader integration behavior spanning multiple modules.
