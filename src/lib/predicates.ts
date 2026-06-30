export const isNonNullish = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined;

export function areNonNullish<T>(values: T[]): values is NonNullable<T>[];
export function areNonNullish<T>(values: readonly T[]): values is readonly NonNullable<T>[];
export function areNonNullish<T>(values: readonly T[]) {
  return values.every(isNonNullish);
}

export const isTruthy = <T>(value: T): value is Exclude<T, false | null | undefined> =>
  isNonNullish(value) && value !== false;
