# Documentation

## Documents

- [Specification](./specification.md): product behavior, states, editor
  behavior, workflows, and common rules.
- [Architecture](./architecture.md): stack, responsibilities, data contracts,
  data flow, security, and test focus.
- [Engineering Patterns](./patterns.md): recurring implementation patterns,
  when to use them, and the mistakes they prevent.
- [Decisions](./decisions.md): accepted product and technical decisions.
- [Reference](./reference.md): settings, menus, shortcuts,
  contextual availability, and checked state.
- [Backlog](./backlog.md): unshaped, unscheduled ideas that have not yet become
  actionable issues.

If product documents overlap or appear to conflict, prefer them in this order:
Decisions, Specification, Architecture, Backlog.

Engineering Patterns provides implementation guidance rather than product
direction. It yields to Architecture for ownership and dependency boundaries.

## Repository Guidance

- [Contributing](../CONTRIBUTING.md): contribution workflow and project
  conventions.
- [Security](../SECURITY.md): private vulnerability reporting and supported
  versions.
- [Changelog](../CHANGELOG.md): release notes for user-facing changes.

## Work Tracking

The [issue tracker](https://github.com/Azganoth/leafdown/issues) is the source
of truth for actionable work. The [Leafdown Project](https://github.com/users/Azganoth/projects/7)
tracks prioritization and delivery state. When a backlog idea becomes actionable,
promote it to an issue and remove the corresponding backlog entry to avoid
duplicate tracking.

## Conventions

### Decision Records

Decisions use a lightweight ADR format:

- `Status`
- `Decision`
- `Rationale`
- `Consequences`

## Development Corpus

- [`../corpus/`](../corpus/): committed manual Markdown corpus covering
  CommonMark, GFM, nonstandard extensions, practical documents, syntax
  interactions, malformed input, byte and grammar boundaries, and focused
  environment scenarios.

## Spikes

- [Milkdown API Plan](./spikes/milkdown-api-plan.md): package, import,
  lifecycle, highlighting, HTML safety, settings, and follow-up issue guidance
  for the Milkdown editor foundation.
- [Source Projection](./spikes/source-projection.md): architecture, adapter
  contract, and original spike guidance for seamless editable Markdown source.
