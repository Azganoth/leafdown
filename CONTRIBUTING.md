# Contributing

Leafdown is an open-source project that accepts community contributions through this public repository. Development is coordinated here:

- Product docs describe intended behavior.
- Issues track actionable work.
- The GitHub Project tracks maintainer prioritization and delivery state.
- Pull requests contain implementation and review.
- Milestones group work toward release targets.

## Before You Contribute

### Documentation And Change Authority

Follow the document purposes and precedence defined in [`docs/README.md`](./docs/README.md).

When a change affects product behavior, keep the owning docs and implementation aligned in the same change when practical.

Record notable user-facing changes in [`CHANGELOG.md`](./CHANGELOG.md) under `Unreleased` until they are assigned to a release version.

If a proposed implementation would change product direction, architecture, or release scope, reach agreement in an issue before substantial implementation. Update the owning documentation as part of the accepted change.

### AI-Assisted Contributions

AI assistance is allowed, but the human author remains responsible for understanding, reviewing, verifying, and explaining the contribution and for addressing review feedback. Do not submit generated changes that you cannot evaluate or maintain.

Do not provide vulnerability details, credentials, private files, personal information, or other sensitive material to external AI services.

### Contribution Terms

By submitting a contribution, you confirm that you have the right to contribute it under Leafdown's [GPL-3.0-or-later license](./LICENSE).

## Find Or Propose Work

Track actionable outcomes using single, focused issues. Maintainers shape and schedule them as described under [Maintainer Project Management](#maintainer-project-management).

To find appropriate work, browse the Project's `Ready` items or open issues. Comment on an issue before beginning substantial work so ownership and direction can be confirmed.

Use the repository's [issue chooser](https://github.com/Azganoth/leafdown/issues/new/choose) to report bugs, request features, suggest documentation improvements, or ask for support. Report suspected security vulnerabilities privately according to [`SECURITY.md`](./SECURITY.md).

## Local Development

Windows is Leafdown's current development and polish target. Keep changes cross-platform aware; platform-specific setup for Linux and macOS is not yet documented here.

Before cloning the repository, install:

- Git
- Node.js 24 (or later)
- Rust (through `rustup`; the repository pins the toolchain version)
- [Tauri v2 prerequisites for Windows](https://v2.tauri.app/start/prerequisites/#windows)

After forking and cloning the repository, install the required toolchains and project dependencies from the repository root:

```powershell
corepack enable pnpm
corepack install
pnpm install
rustup toolchain install
```

> Corepack installs the exact pnpm version configured by the repository. `pnpm install` then installs project dependencies and configures the Husky Git hooks used for basic linting and formatting checks. `rustup toolchain install` takes no toolchain argument because [`rust-toolchain.toml`](./rust-toolchain.toml) pins the version and components.

Start the desktop application with:

```powershell
pnpm tauri dev
```

> `pnpm dev` starts only the web frontend and cannot exercise Leafdown's native filesystem and shell behavior.

Verify a fresh development environment with:

```powershell
pnpm check
```

Run the assembled desktop E2E suite, which requires Windows, with:

```powershell
pnpm test:e2e:desktop
```

This explicit suite is not part of `pnpm check`; CI runs it as its own job on every pull request and every push to `main`, so it is enforced without changing what you run locally. It builds an isolated debug binary with test-only WebDriver capabilities, then runs one embedded WebDriver worker at a time on port 4445 across fresh application sessions. The embedded provider does not require an external WebDriver. Keep port 4445 available while it runs. The test identifier, persisted store, and target directory are separate from ordinary Leafdown builds.

The runner resets only the isolated E2E persisted store, leaving the application to write its own defaults, creates temporary filesystem fixtures, and removes both after the suite. Each run writes ignored runner, frontend, backend, and focused diagnostic evidence under `e2e/desktop/artifacts/<run>/<scenario>/`. A failed test also captures a screenshot, the real diagnostics summary, the test error, and a semantic UI snapshot that excludes editor content. A failed run additionally writes `fixture-manifest.json` under `e2e/desktop/artifacts/<run>/`, recording each temporary fixture's path, expected and actual hash and size, and modification time before cleanup removes it. Local artifacts are retained until manually deleted. Treat them as potentially sensitive because diagnostics and errors may contain local paths. CI uploads the same evidence only when the job fails, retained for seven days; those artifacts contain runner paths rather than a contributor's.

To verify the failure-evidence path, run the suite with the forced-failure flag:

```powershell
$env:LEAFDOWN_E2E_FORCE_FAILURE=1; pnpm test:e2e:desktop; $env:LEAFDOWN_E2E_FORCE_FAILURE=$null
```

The Diagnostics scenario should fail, retain its evidence, clean its fixture and store state, and return a nonzero exit code.

Before substantial implementation, read the relevant sections of [`docs/architecture.md`](./docs/architecture.md) and [`docs/patterns.md`](./docs/patterns.md).

For documentation-only or repository-metadata changes, run targeted formatting or validation instead of the full application suite unless executable configuration is affected. For example:

```powershell
pnpm exec oxfmt --check CONTRIBUTING.md
```

## Development Workflow

For substantial work, start from an accepted issue. For a small, self-contained correction, confirm that a direct pull request is appropriate.

### Branches And Commits

- Name maintainer-owned task branches with a type prefix followed by a short kebab-case topic, using `bug/`, `feature/`, `docs/`, `chore/`, `spike/`, or `release/`. External fork branches may follow this convention but are not required to.
- Format pull request titles according to the Conventional Commits specification without the scope part (e.g., `feat: add markdown component`, `fix: handle missing file path`).
- Keep intermediate commit messages clear and meaningful, and do not prefix them according to Conventional Commits. Branches are squash merged, so only the pull request title reaches `main` and the prefix is discarded.
- Give an intermediate commit a body only when the diff does not carry the reasoning: rationale, a constraint, a rejected alternative, or a non-obvious consequence. Verification evidence, commands run, and per-file summaries belong in the pull request body, not here.
- Leave out how the work unfolded. A body that refers to a sibling commit, or to what an earlier attempt got wrong, describes a sequence the squash merge discards. A commit that exists only because of staging order, such as documentation held back until its code lands, tends to produce such a body; commit the documentation with the change it describes instead.

1. Fork the repository if needed, then create a focused branch for the change.
2. Implement the change, including relevant tests and documentation.
3. Run the checks appropriate to the affected area.
4. Open a focused pull request referencing the issue when one exists.

## Pull Requests

Open a focused pull request and complete the repository's [`pull request template`](./.github/pull_request_template.md).

Pull request requirements:

- Reference the associated issue when one exists.
- Use closing keywords (e.g., `Closes #123`) when the pull request completes an issue so it closes automatically on merge.
- Update documentation when behavior, architecture, or release scope changes.
- Update the changelog for notable user-facing changes.
- Provide meaningful verification evidence and disclose anything that was not verified.

After submission, CI runs the automated checks. Maintainers apply a type label, assign the pull request's owner, and review the scope, implementation, and verification evidence; priority and Project status stay on the issue. Contributors should address review feedback or explain unresolved trade-offs. Maintainers squash merge accepted pull requests using the pull request title as the commit title on `main`. The pull request body becomes that commit's body and is the permanent record of the change; intermediate commits do not survive the merge. That is why the pull request body carries verification evidence and intermediate commit messages do not.

Verify changes locally before merging. Use `pnpm check:frontend` for frontend-only work, `pnpm check:backend` for Rust/Tauri-only work, and `pnpm check` for cross-cutting updates. For manual testing of Markdown and the article navigator, open the committed `corpus/` directory or one of its focused scenario directories in the app.

Frontend checks enforce a coverage floor. It is a ratchet set just below the measured numbers rather than a target: a change that falls below it needs tests, not a lower floor, and the floor is raised when the measured numbers move up.

## Maintainer Project Management

Maintainers own issue classification, scheduling, and project state. Contributors only need to provide the information requested by the relevant issue template; maintainers triage contributor-reported issues after they are opened.

When creating maintainer-owned issues directly, use the matching reference structure as the minimum:

- [`Bug`](./.github/maintainer-issue-templates/bug.md)
- [`Feature`](./.github/maintainer-issue-templates/feature.md)
- [`Documentation`](./.github/maintainer-issue-templates/documentation.md)
- [`Maintenance`](./.github/maintainer-issue-templates/maintenance.md)
- [`Spike`](./.github/maintainer-issue-templates/spike.md)
- [`Release`](./.github/maintainer-issue-templates/release.md)
- [`Tracking`](./.github/maintainer-issue-templates/tracking.md)

Keep optional sections only when they add useful context. Use permanent links for repository code and documentation when historical context depends on a specific revision.

A maintainer-created issue is triaged at creation rather than in a later pass: apply its type label, owning assignee, and priority, adding a milestone only when it targets a concrete release version. Project automation adds the item and sets its initial status; correct that status when the default does not fit.

Use a parent tracking issue when independently actionable issues deliver one bounded outcome and share scope, decisions, dependencies, or completion criteria. Do not use parents for topical collections, releases, or open-ended backlogs; use labels, milestones, or the Project instead.

Keep each sub-issue understandable and deliverable on its own. The parent records only shared scope, decisions, dependencies, and completion criteria. Use GitHub's native sub-issue relationship rather than a duplicated checklist, and close the parent after all required sub-issues and group-level verification are complete.

For a spike, record the conclusion, tradeoffs, and evidence in the issue's `Outcome` section, linking prototype or verification pull requests. Update the owning documentation when the accepted outcome changes durable direction; otherwise the issue and linked pull requests remain the record.

### Labels

Maintain a minimal, standard set of labels:

| Label               | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `Bug`               | Something isn't working                                                  |
| `Feature`           | New feature or request                                                   |
| `Documentation`     | Improvements or additions to documentation                               |
| `Maintenance`       | Chore, refactor, dependency, or test work without user-facing change     |
| `Question`          | Question or support request                                              |
| `Spike`             | Investigation needed before committing to implementation                 |
| `Release`           | Coordination work for a release                                          |
| `Tracking`          | Coordination work for a bounded outcome delivered through sub-issues     |
| `Duplicate`         | This issue or pull request already exists                                |
| `Needs information` | Waiting for clarification, reproduction details, or other reporter input |

The first eight labels categorize the type of work; the remaining labels track triage or resolution states.

### Milestones

Milestones are reserved for concrete delivery targets, not status tracking or broad backlog categorization.

Future milestones are created only for concrete release versions (e.g., `v0.2.0`). For complex releases, coordinate the scope, checklist, and notes using a matching **Release** issue.

### Project Fields

The GitHub Project functions as the operational board. Leafdown uses a lightweight status pipeline. Draft items capture unshaped ideas and are neither repository issues nor accepted work, while focused issues are the primary implementation items. Linked pull requests are not added as separate operational cards.

1. `Backlog` — Captured, not yet shaped.
2. `Ready` — Clear definition of done; ready for implementation.
3. `In Progress` — Actively being implemented.
4. `Review` — Pull request open and awaiting review.
5. `Blocked` — Unable to proceed because of a dependency or other impediment.
6. `Done` — Merged or closed.

Closed items are archived from the board automatically after a settling period and remain retrievable from the project's archived items.

A tracking parent appears on the board like any other issue, where its `Sub-issues progress` field reports group completion. Sub-issues remain the implementation items and move independently. Use `Backlog` or `Ready` before delivery, `In Progress` while work is active, `Blocked` only for a group-level impediment, and `Done` when closed. Child pull requests do not move the parent to `Review`.

Prioritize issues using the following urgency tiers:

1. `P0` — Critical; address immediately (core usage, release readiness, or project health is at risk).
2. `P1` — Important; resolve in the near term, typically ahead of standard planned work.
3. `P2` — Normal; standard planned work.
4. `P3` — Low; minor improvement or optimization to defer until capacity allows.

### Status Workflow

1. Capture unshaped ideas as Project drafts in `Backlog`.
2. Convert a draft to a focused issue once its intended outcome is clear, applying the same creation-time triage.
3. Move the issue to `Ready` once it carries a clear summary, its expected behavior or intended outcome, related documentation links when product behavior is modified, and acceptance criteria or a clear definition of done.
4. Move the issue to `In Progress` when work begins, assigning it if it was not assigned at creation.
5. Move an item to `Blocked` when work cannot proceed, then return it to the appropriate active status once the impediment is resolved.
6. Move the issue to `Review` when its linked pull request opens.
7. After merge or closure, confirm that the issue is closed and the project item is `Done`.

The [Leafdown Project](https://github.com/users/Azganoth/projects/7) contains the current views and configured automations. Maintainers remain responsible for verifying and correcting project state when needed.

## Command Reference

| Task                        | Command                 |
| --------------------------- | ----------------------- |
| Run the desktop application | `pnpm tauri dev`        |
| Run the web frontend only   | `pnpm dev`              |
| Run the desktop E2E suite   | `pnpm test:e2e:desktop` |
| Check frontend changes      | `pnpm check:frontend`   |
| Check backend changes       | `pnpm check:backend`    |
| Check the whole repository  | `pnpm check`            |
| Format the repository       | `pnpm format`           |
| Build the desktop app       | `pnpm tauri build`      |

Treat [`package.json`](./package.json) as the source of truth for individual lint, test, formatting, and build scripts. Backend checks and formatting use the pinned Rust toolchain.
