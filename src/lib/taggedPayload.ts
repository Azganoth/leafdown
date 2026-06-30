const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isTaggedPayload = <const PayloadKind extends string>(
  value: unknown,
  kinds: readonly PayloadKind[],
): value is { kind: PayloadKind } & Record<string, unknown> =>
  isRecord(value) &&
  typeof value.kind === "string" &&
  (kinds as readonly string[]).includes(value.kind);
