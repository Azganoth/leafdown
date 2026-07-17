# Documentation

## Documents

- [Specification](./specification.md): product behavior, states, editor
  behavior, workflows, and common rules.
- [Architecture](./architecture.md): stack, responsibilities, data contracts,
  data flow, security, and test focus.
- [Engineering Patterns](./patterns.md): recurring implementation patterns,
  when to use them, and the mistakes they prevent.
- [Decisions](./decisions.md): accepted product and technical decisions.
- [MVP](./mvp.md): MVP release goal, scope rule, acceptance criteria, and
  execution reference.
- [Backlog](./backlog.md): Post-MVP candidates and deferred ideas.
- [Changelog](../CHANGELOG.md): release notes for user-facing changes.

If documents overlap or appear to conflict, prefer them in this order:
Decisions, Specification, Architecture, Engineering Patterns, MVP, Backlog.

## Conventions

### Scope Labels

- `Post-MVP`: deferred until after the MVP.
- `Development-only`: available only in development builds.

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
