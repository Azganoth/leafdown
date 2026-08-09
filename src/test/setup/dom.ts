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

// happy-dom implements no Web Animations API. Base UI reads `getAnimations()` to wait out
// transitions before it settles a popup or scroll area, and treats an empty list as "settled".
if (typeof Element !== "undefined") {
  const elementPrototype = Element.prototype as Element & {
    getAnimations?: () => Animation[];
  };

  elementPrototype.getAnimations ??= () => [];
}

// happy-dom performs no layout, so the document element measures 0x0 and anything clipping
// against the viewport reads every element as fully off screen. A browser reports the layout
// viewport here.
if (typeof document !== "undefined") {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    get: () => window.innerWidth,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    get: () => window.innerHeight,
  });
}
