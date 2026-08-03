# Rust And Tauri Instructions

## Tauri Command Boundaries

- Keep Tauri commands thin. Delegate reusable filesystem, parsing, validation, and domain behavior to testable Rust functions or modules.
- Treat all frontend command arguments as untrusted input. Validate paths, identifiers, options, and other payload values before processing them.
- Use explicit serializable command payload and error types. Keep internal implementation errors behind stable boundary contracts.
- Keep synchronous commands short and non-blocking. When an async command performs blocking filesystem or CPU work, offload that work with `tauri::async_runtime::spawn_blocking` and handle task-join failures explicitly.

## Error Handling And Visibility

- Represent recoverable failures with `Result` and domain-specific error variants that preserve useful operation, path, or failure context.
- Do not use `unwrap` or `expect` with user-controlled input, filesystem results, or other runtime failures in production code. They are acceptable in tests and for genuinely infallible invariants when the reason is evident.
- Use the narrowest appropriate visibility. Prefer private items, `pub(super)` for parent-module internals, and `pub(crate)` for crate-wide APIs. Use bare `pub` only for intentional cross-crate APIs, such as the library entry point used by `src/main.rs`.

## Code Conventions

- Group imports as std, then external crates, then `super`/`crate`, separated by blank lines. `cargo fmt` sorts within a group but will not create or merge them, so place new imports yourself.

## Testing

- Co-locate focused unit tests with their Rust module and reuse `crate::test_utils`, including `TestDirectory`, for temporary filesystem setup.
- Update `command_contract_tests.rs` when command payloads, serialized errors, or cross-command workflows change.
- Follow the backend-relevant cases in the [`docs/architecture.md` verification strategy](../docs/architecture.md#verification-strategy), especially filesystem failures, path handling, encoding, size limits, symlinks, and security boundaries.

## Filesystem And Side Effects

- Design file-changing operations to leave existing user data intact on failure wherever practical. Preserve the documented behavior for symlinks, path boundaries, encoding, size limits, metadata freshness, and watcher interactions rather than treating an apparently successful write as sufficient.
- Verify filesystem semantics with real temporary files and operating-system failure paths when mocks would remove the behavior under test.
