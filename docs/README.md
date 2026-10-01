# Documentation

## Documents

- [Specification](./specification.md): product behavior, states, editor behavior, workflows, and common rules.
- [Architecture](./architecture.md): stack, responsibilities, data contracts, data flow, security, and test focus.
- [Engineering Patterns](./patterns.md): recurring implementation patterns, when to use them, and the mistakes they prevent.
- [Decisions](./decisions.md): accepted product and technical decisions.
- [Reference](./reference.md): settings, menus, shortcuts, contextual availability, and checked state.
- [Help](./help/getting-started.md): bundled user-facing guides for getting started, Markdown, file and folder workflows, and settings.

If product documents overlap or appear to conflict, prefer them in this order: Decisions, Specification, Architecture. Reference owns the detailed settings and command inventory: it lists what exists, while Specification states how it behaves. A surface's keyboard behavior belongs to Specification even though Reference inventories its shortcuts.

Engineering Patterns provides implementation guidance rather than product direction. It yields to Architecture for ownership and dependency boundaries.

Help pages explain shipped behavior to app users. Review affected pages when product behavior changes; Decisions, Specification, and Reference retain their ownership and precedence above these explanations.

## Repository Guidance

- [Contributing](../CONTRIBUTING.md): contribution workflow and project conventions.
- [Security](../SECURITY.md): private vulnerability reporting and supported versions.
- [Changelog](../CHANGELOG.md): release notes for user-facing changes.

## Work Tracking

The [issue tracker](https://github.com/Azganoth/leafdown/issues) is the source of truth for actionable work. The [Leafdown Project](https://github.com/users/Azganoth/projects/7) captures unshaped ideas as draft items and tracks prioritization and delivery state. [Contributing](../CONTRIBUTING.md) owns the issue lifecycle, triage fields, and Project statuses.

## Conventions

### Decision Records

Decisions use a lightweight ADR format:

- `Decision`
- `Rationale`
- `Consequences`

`Consequences` records what follows from the decision, not the investigation behind it.

## Development Corpus

- [`../corpus/`](../corpus/): committed manual Markdown corpus covering CommonMark, GFM, nonstandard extensions, practical documents, syntax interactions, malformed input, byte and grammar boundaries, and focused environment scenarios.
