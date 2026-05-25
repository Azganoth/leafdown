# Contributing

Leafdown uses GitHub as the coordination layer around the codebase:

- Product docs describe intended behavior.
- Issues track actionable work.
- The GitHub Project shows planning and delivery state.
- Pull requests contain implementation and review.
- Milestones group work toward release targets.

Leafdown is open-source, and this repository is the source of truth for project
work, implementation, issues, pull requests, milestones, and planning.

## License

By contributing to Leafdown, you agree that your contributions are submitted
under the project license, currently GNU General Public License v3.0 or later
(`GPL-3.0-or-later`), unless otherwise documented.

## Source Of Truth

When a change affects product behavior, keep the owning docs and implementation
aligned in the same change when practical.

If docs overlap or appear to conflict, prefer them in this order:

1. [`docs/decisions.md`](./docs/decisions.md)
2. [`docs/specification.md`](./docs/specification.md)
3. [`docs/architecture.md`](./docs/architecture.md)
4. [`docs/mvp.md`](./docs/mvp.md)
5. [`docs/backlog.md`](./docs/backlog.md)

If a requested implementation would change product direction rather than simply
implement existing docs, discuss the direction first and update the docs as part
of the work.

## Issues & Project Management

Track actionable outcomes using single, focused issues.

Map work to the appropriate issue template:

- **Bug** for defects
- **Feature** for product or technical implementation work
- **Documentation** for documentation changes
- **Spike** for time-boxed investigation before committing to implementation
- **Release** for coordinating a release target and its checklist

Standard issues should include:

- A clear summary
- Expected behavior or intended outcome
- Related documentation links when product behavior is modified
- Acceptance criteria or a clear definition of done

Break down larger initiatives using sub-issues.

### Labels

Maintain a minimal, standard set of labels:

| Label           | Description                                              |
| --------------- | -------------------------------------------------------- |
| `Bug`           | Something isn't working                                  |
| `Feature`       | New feature or request                                   |
| `Documentation` | Improvements or additions to documentation               |
| `Spike`         | Investigation needed before committing to implementation |
| `Release`       | Coordination work for a release                          |
| `Duplicate`     | This issue or pull request already exists                |
| `Invalid`       | This doesn't seem right                                  |
| `Question`      | Further information is requested                         |
| `Wontfix`       | This will not be worked on                               |

The first five labels categorize the type of work; the remaining labels track triage or resolution states.

### Milestones

Milestones are reserved for concrete delivery targets, not status tracking or broad backlog categorization.

Current milestone convention:

- `MVP` — Work required to satisfy the [`MVP specification`](./docs/mvp.md) and ship the first usable release.

Subsequent milestones are created only for concrete release versions (e.g., `v0.1.0`, `v0.2.0`). For complex releases, coordinate the scope, checklist, and notes using a matching **Release** issue.

### Project Fields

The GitHub Project functions as the operational board. Leafdown uses a lightweight status pipeline:

1. `Backlog` — Captured, not yet shaped.
2. `Ready` — Clear definition of done; ready for implementation.
3. `In Progress` — Actively being implemented.
4. `Blocked` — Blocked by external dependencies or other tasks.
5. `Review` — Pull request open and awaiting review.
6. `Done` — Merged or closed.

Prioritize issues using the following urgency tiers:

1. `P0` — Critical; address immediately (core usage, release readiness, or project health is at risk).
2. `P1` — Important; resolve in the near term, typically ahead of standard planned work.
3. `P2` — Normal; standard planned work.
4. `P3` — Low; minor improvement or optimization to defer until capacity allows.

### Project Views

Standard views address common operational questions:

| View        | Layout            | Purpose                                                                                    |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `Triage`    | Table             | Shape and prioritize upcoming work with `Status = Backlog or Ready`, sorted by `Priority`. |
| `Work`      | Board by `Status` | Track execution work with `Status = Ready`, `In Progress`, `Blocked`, or `Review`.         |
| `Bug`       | Table             | Review bug work filtered by the `Bug` label.                                               |
| `Questions` | Table             | Review items needing clarification with the `Question` label.                              |
| `Done`      | Table             | Review completed work with `Status = Done`.                                                |

## Local Setup

Git hooks are configured via Husky upon running `pnpm install` to enforce basic linting and formatting. CI remains the final verification check before merge.

## Git Conventions

- Name task branches with the issue type followed by a short kebab-case topic, such as `feature/feature-name`, `spike/spike-name`.
- Format commit messages according to the Conventional Commits specification without the scope part (e.g., `feat: add markdown component`, `fix: handle missing file path`).

## Development Workflow

1. Document the task in a GitHub issue.
2. Assign the appropriate issue type, milestone, and project fields.
3. Move the issue to `Ready` once the requirements are defined.
4. Implement changes on a focused branch.
5. Open a pull request linked to the issue.
6. Transition the project item to `Review`.
7. Merge the pull request after approval and verification.
8. Verify that the linked issue is closed and transition the project item to `Done`.

## Pull Requests

Submit changes via focused branches and pull requests.

Pull Request requirements:

- Reference the associated issue.
- Use closing keywords (e.g., `Closes #123`) to automate issue resolution on merge.
- Maintain a single, focused objective where practical.
- Update documentation when behavior, architecture, or release scope changes.
- Document testing notes, trade-offs, or follow-up work.
- Use the established pull request body style:
  - `## Summary` with concise bullets covering the main implementation and test changes.
  - `## Related Issue` with `Closes #<issue-number>` when the PR completes an issue.
  - `## Notes` only when scope clarifications, intentional omissions, or follow-up context are useful. Do not include status updates for tests, linting, or formatting checks, as these are automated by CI.

Verify changes locally before merging. Use `pnpm check:frontend` for
frontend-only work, `pnpm check:backend` for Rust/Tauri-only work, and
`pnpm check` for cross-cutting updates. For manual testing of the editor and
file-tree, generate the local sample workspace by running `pnpm sample` and open
the `sample/` directory in the app.

## Common Commands

### Development

- Web dev server: `pnpm dev`
- Tauri dev app: `pnpm tauri dev`
- Generate sample workspace: `pnpm sample`

### Building

- Frontend build: `pnpm build`
- Tauri build: `pnpm tauri build`

### Linting & Formatting

- TypeScript check: `pnpm lint:tsc`
- Oxlint: `pnpm lint:oxlint`
- Rust lint: `pnpm lint:backend`
- Format: `pnpm format`

### Testing & Verification

- TypeScript/Vitest tests: `pnpm test:frontend`
- Rust tests: `pnpm test:backend`
- All tests: `pnpm test`
- Full check: `pnpm check`

`check:cargo-fmt` and `format:backend` use `cargo +nightly fmt`; verify the
nightly toolchain is installed before treating failures as code failures.
