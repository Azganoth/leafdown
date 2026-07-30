export const isNonNullish = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined;

export function areNonNullish<T>(values: T[]): values is NonNullable<T>[];
export function areNonNullish<T>(values: readonly T[]): values is readonly NonNullable<T>[];
export function areNonNullish<T>(values: readonly T[]) {
  return values.every(isNonNullish);
}

export const isTruthy = <T>(value: T): value is Exclude<T, false | null | undefined> =>
  isNonNullish(value) && value !== false;

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const isOneOf = <const T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] => values.includes(value);
