import { describe, expect, it } from "vitest";

import {
  booleanValue,
  boundedList,
  listOf,
  numberValue,
  oneOf,
  salvagedRecord,
  stringValue,
} from "./valueContract";

describe("leaf contracts", () => {
  it("accepts a value of the contracted type", () => {
    expect(booleanValue.check(true)).toEqual({ outcome: "valid", value: true });
    expect(numberValue.check(1)).toEqual({ outcome: "valid", value: 1 });
    expect(stringValue.check("home")).toEqual({ outcome: "valid", value: "home" });
  });

  it("rejects a value of another type", () => {
    expect(booleanValue.check("yes")).toEqual({ outcome: "invalid" });
    expect(numberValue.check("1")).toEqual({ outcome: "invalid" });
    expect(stringValue.check(7)).toEqual({ outcome: "invalid" });
  });
});

describe("oneOf", () => {
  const contract = oneOf(["light", "dark"] as const);

  it("accepts a listed value", () => {
    expect(contract.check("dark")).toEqual({ outcome: "valid", value: "dark" });
  });

  it("rejects an unlisted value", () => {
    expect(contract.check("midnight")).toEqual({ outcome: "invalid" });
  });
});

describe("listOf", () => {
  const contract = listOf(stringValue);

  it("accepts a list of contracted entries without copying it", () => {
    const value = ["a", "b"];
    const result = contract.check(value);

    expect(result).toEqual({ outcome: "valid", value });
    expect(result.outcome === "valid" && result.value).toBe(value);
  });

  it("accepts an empty list", () => {
    expect(contract.check([])).toEqual({ outcome: "valid", value: [] });
  });

  it("rejects the whole list when one entry fails", () => {
    expect(contract.check(["a", 7])).toEqual({ outcome: "invalid" });
  });

  it("rejects a value that is not a list", () => {
    expect(contract.check("a")).toEqual({ outcome: "invalid" });
  });

  it("propagates a repair from an entry contract", () => {
    expect(listOf(boundedList(listOf(stringValue), 1)).check([["a", "b"]])).toEqual({
      outcome: "repaired",
      value: [["a"]],
    });
  });
});

describe("boundedList", () => {
  const contract = boundedList(listOf(stringValue), 2);

  it("accepts a list within the limit", () => {
    expect(contract.check(["a", "b"])).toEqual({ outcome: "valid", value: ["a", "b"] });
  });

  it("repairs a list past the limit", () => {
    expect(contract.check(["a", "b", "c"])).toEqual({ outcome: "repaired", value: ["a", "b"] });
  });

  it("rejects a value the inner contract refuses", () => {
    expect(contract.check(["a", 7])).toEqual({ outcome: "invalid" });
  });
});

describe("salvagedRecord", () => {
  const contract = salvagedRecord({
    enabled: booleanValue,
    names: listOf(stringValue),
    version: numberValue,
  });

  it("accepts a fully valid record without copying it", () => {
    const value = { enabled: true, names: ["home"], version: 1 };
    const result = contract.check(value);

    expect(result).toEqual({ outcome: "valid", value });
    expect(result.outcome === "valid" && result.value).toBe(value);
  });

  it("accepts a partial record because absent keys fall back to store defaults", () => {
    expect(contract.check({ enabled: false })).toEqual({
      outcome: "valid",
      value: { enabled: false },
    });
  });

  it("repairs a record by dropping fields that fail their contract", () => {
    expect(contract.check({ enabled: "yes", names: ["home"], version: 1 })).toEqual({
      outcome: "repaired",
      value: { names: ["home"], version: 1 },
    });
  });

  it("repairs a record by dropping unknown keys", () => {
    expect(contract.check({ enabled: true, injected: "value" })).toEqual({
      outcome: "repaired",
      value: { enabled: true },
    });
  });

  it("drops an inherited key name instead of resolving it through the prototype", () => {
    // An object literal would set the prototype instead of creating an own key.
    const value = JSON.parse('{"__proto__": 1, "enabled": true}') as unknown;

    expect(contract.check(value)).toEqual({ outcome: "repaired", value: { enabled: true } });
  });

  it("propagates a repair from a nested contract", () => {
    const nested = salvagedRecord({ items: boundedList(listOf(stringValue), 1) });

    expect(nested.check({ items: ["a", "b"] })).toEqual({
      outcome: "repaired",
      value: { items: ["a"] },
    });
  });

  it("salvages the valid fields of a nested record", () => {
    const nested = salvagedRecord({
      theme: salvagedRecord({ font: stringValue, size: numberValue }),
    });

    expect(nested.check({ theme: { font: "Inter", size: "big" } })).toEqual({
      outcome: "repaired",
      value: { theme: { font: "Inter" } },
    });
  });

  it.each([
    ["an array", ["home"]],
    ["null", null],
    ["a primitive", "home"],
  ])("rejects %s", (_label, value) => {
    expect(contract.check(value)).toEqual({ outcome: "invalid" });
  });
});
