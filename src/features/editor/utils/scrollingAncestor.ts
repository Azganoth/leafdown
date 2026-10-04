const SCROLLING_OVERFLOW_PATTERN = /auto|scroll|overlay/u;

export const findScrollingAncestor = (element: Element) => {
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (SCROLLING_OVERFLOW_PATTERN.test(getComputedStyle(current).overflowY)) {
      return current;
    }
  }

  return null;
};
