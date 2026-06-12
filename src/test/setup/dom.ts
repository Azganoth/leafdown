import "@testing-library/jest-dom/vitest";

const createTestDomRect = (): DOMRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

const createTestDomRectList = (): DOMRectList => {
  const rect = createTestDomRect();

  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
    [Symbol.iterator]: function* iterateTestDomRects() {
      yield rect;
    },
  } as DOMRectList;
};

if (typeof Text !== "undefined") {
  const textPrototype = Text.prototype as Text & {
    getClientRects?: () => DOMRectList;
  };

  textPrototype.getClientRects ??= createTestDomRectList;
}
