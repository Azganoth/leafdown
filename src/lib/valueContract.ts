// A contract distinguishes a value it rewrote from one it accepted, because
// callers need that difference to know whether their source is stale.
export type ValueCheck<T> =
  | { readonly outcome: "valid"; readonly value: T }
  | { readonly outcome: "repaired"; readonly value: T }
  | { readonly outcome: "invalid" };

export interface ValueContract<T> {
  readonly check: (value: unknown) => ValueCheck<T>;
}

export type Contracted<C> = C extends ValueContract<infer T> ? T : never;

export type ContractShape = Record<string, ValueContract<unknown>>;

export type ShapeValue<Shape extends ContractShape> = {
  [Key in keyof Shape]?: Contracted<Shape[Key]>;
};

const valid = <T>(value: T): ValueCheck<T> => ({ outcome: "valid", value });
const repaired = <T>(value: T): ValueCheck<T> => ({ outcome: "repaired", value });
const INVALID = { outcome: "invalid" } as const;

export const booleanValue: ValueContract<boolean> = {
  check: (value) => (typeof value === "boolean" ? valid(value) : INVALID),
};

export const numberValue: ValueContract<number> = {
  check: (value) => (typeof value === "number" ? valid(value) : INVALID),
};

export const stringValue: ValueContract<string> = {
  check: (value) => (typeof value === "string" ? valid(value) : INVALID),
};

export const oneOf = <const T extends readonly unknown[]>(values: T): ValueContract<T[number]> => ({
  check: (value) => (values.includes(value) ? valid(value as T[number]) : INVALID),
});

export const listOf = <T>(contract: ValueContract<T>): ValueContract<T[]> => ({
  check: (value) => {
    if (!Array.isArray(value)) {
      return INVALID;
    }

    const items: T[] = [];
    let touched = false;

    for (const entry of value) {
      const checked = contract.check(entry);

      // A list with a hole is less recoverable than the default that replaces it.
      if (checked.outcome === "invalid") {
        return INVALID;
      }

      touched ||= checked.outcome === "repaired";
      items.push(checked.value);
    }

    return touched ? repaired(items) : valid(value as T[]);
  },
});

export const boundedList = <T>(
  contract: ValueContract<T[]>,
  limit: number,
): ValueContract<T[]> => ({
  check: (value) => {
    const result = contract.check(value);

    if (result.outcome === "invalid" || result.value.length <= limit) {
      return result;
    }

    return repaired(result.value.slice(0, limit));
  },
});

export const salvagedRecord = <Shape extends ContractShape>(
  shape: Shape,
): ValueContract<ShapeValue<Shape>> => ({
  check: (value) => {
    // Arrays pass the typeof check, and no contract shape accepts one.
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return INVALID;
    }

    const salvaged: Record<string, unknown> = {};
    let touched = false;

    for (const [key, entry] of Object.entries(value)) {
      // A "__proto__" key resolves to Object.prototype through a plain index,
      // which a truthiness check would accept as a contract.
      if (!Object.hasOwn(shape, key)) {
        touched = true;
        continue;
      }

      const checked = shape[key].check(entry);

      if (checked.outcome === "invalid") {
        touched = true;
        continue;
      }

      touched ||= checked.outcome === "repaired";
      salvaged[key] = checked.value;
    }

    return touched ? repaired(salvaged as ShapeValue<Shape>) : valid(value as ShapeValue<Shape>);
  },
});
