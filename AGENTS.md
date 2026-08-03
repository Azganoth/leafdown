# AGENTS.md

## Workflow And Authorization

- Follow [`CONTRIBUTING.md`](./CONTRIBUTING.md) for documentation authority, issues, project management, branches, commits, pull requests, and releases. Read the relevant sections before acting.
- Creating an issue or pull request includes triaging it. Read `Maintainer Project Management` and `Pull Requests` before creating either.
- Treat planning, review, investigation, and diagnosis requests as read-only unless the user explicitly requests implementation or changes.
- When multiple commits have been agreed, complete and verify each stage before committing it.
- Never push, create or modify issues or Project items, open or merge pull requests, create tags or releases, or otherwise mutate remote GitHub state without explicit authorization.
- For release work, also read `.github/workflows/release.yml` and the Release issue reference; `CONTRIBUTING.md` covers release coordination, not automation.

## Core Implementation Rules

- Treat package and crate manifests as the source of truth for dependency versions and available APIs.
- Prefer features supported by the installed versions and established local patterns. Modernize code being changed when appropriate, but do not modernize unrelated code without an explicit request or agreed scope.
- Consult current official documentation when API behavior is uncertain.

## Architecture Boundaries

- Frontend code lives in `src/` and follows [`src/AGENTS.md`](./src/AGENTS.md). Rust and Tauri code lives in `src-tauri/` and follows [`src-tauri/AGENTS.md`](./src-tauri/AGENTS.md).
- Follow [`docs/architecture.md`](./docs/architecture.md) for feature ownership, dependency direction, domain vocabulary, runtime responsibilities, data flow, and security boundaries. Read the relevant sections before architectural or cross-feature changes.
- Keep filesystem access and native-shell operations behind Tauri/Rust boundaries.
- Preserve established ownership and dependency direction. Prefer existing local patterns and utilities before introducing new abstractions.

## Verification And Completion

- Run the smallest relevant checks while iterating, then expand verification in proportion to the final scope and risk.
- Use `pnpm check:frontend` for frontend-only changes, `pnpm check:backend` for Rust/Tauri-only changes, and `pnpm check` for cross-cutting changes.
- For documentation-only or repository-metadata changes, run targeted formatting or validation rather than the full application suite unless executable configuration is affected.
- Do not start browser or application verification for trivial UI or copy-only changes unless requested or the behavior depends on rendered interaction.
- Reread prose before committing it — code comments, documentation, commit bodies, and pull request text — as a reader who has only the diff, and cut what depends on having been in the session. Rationale a reader cannot recover stays; the account of how it was reached goes.
- Do not weaken or delete tests, fixtures, snapshots, coverage floors, lint rules, specifications, or acceptance criteria merely to obtain passing checks. Treat a necessary change to the verification oracle as a separate decision and support it with evidence.
- Terminate any development server or temporary verification process before finishing.
- Report the checks actually run, their results, and any remaining manual verification in the final response.
