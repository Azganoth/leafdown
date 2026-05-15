# Documentation

## Documents

- [Specification](./specification.md): product behavior, states, editor
  behavior, workflows, and common rules.
- [Architecture](./architecture.md): stack, responsibilities, data contracts,
  data flow, security, and test focus.
- [Decisions](./decisions.md): accepted product and technical decisions.
- [MVP](./mvp.md): MVP release goal, scope rule, acceptance criteria, and
  execution reference.
- [Backlog](./backlog.md): Post-MVP candidates and deferred ideas.

If documents overlap or appear to conflict, prefer them in this order: Decisions, Specification, Architecture, MVP, Backlog.

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

## Development Fixtures

- [`../sample/`](../sample/): manual development workspace for testing Markdown rendering, file-tree scanning, local images/links, and loading edge cases. This directory is not committed; generate it locally by running `pnpm sample`.
