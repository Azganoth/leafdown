interface ModifierAliases {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

type ModifierKeys = Extract<keyof KeyboardEventInit, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

type ModifierEventInit = ModifierAliases & Pick<KeyboardEventInit, ModifierKeys>;

export type TestKeyboardEventOptions = Omit<KeyboardEventInit, ModifierKeys | "key"> &
  ModifierEventInit & {
    keyCode?: number;
  };

export type TestMouseEventOptions = Omit<MouseEventInit, ModifierKeys> & ModifierEventInit;

const normalizeModifierOptions = <T extends ModifierEventInit>(options: T) => {
  const { alt, ctrl, meta, shift, ...eventOptions } = options;

  return {
    ...eventOptions,
    altKey: eventOptions.altKey ?? alt ?? false,
    ctrlKey: eventOptions.ctrlKey ?? ctrl ?? false,
    metaKey: eventOptions.metaKey ?? meta ?? false,
    shiftKey: eventOptions.shiftKey ?? shift ?? false,
  };
};

export const createKeyboardEvent = (key: string, init: TestKeyboardEventOptions = {}) => {
  const { keyCode, ...eventInit } = normalizeModifierOptions(init);
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...eventInit,
  });

  if (keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: keyCode });
  }

  return event;
};

export const createKeyboardEventLike = (
  key: string,
  init: TestKeyboardEventOptions = {},
): KeyboardEvent =>
  ({
    key,
    ...normalizeModifierOptions(init),
  }) as KeyboardEvent;

export const dispatchDOMEvent = (target: EventTarget, type: string, init: EventInit = {}) => {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  target.dispatchEvent(event);

  return event;
};

export const dispatchBlur = (element: Element, init: FocusEventInit = {}) => {
  const event = new FocusEvent("blur", init);

  element.dispatchEvent(event);

  return event;
};

export const dispatchMouseEvent = (
  target: EventTarget,
  type: string,
  init: TestMouseEventOptions = {},
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...normalizeModifierOptions(init),
  });

  target.dispatchEvent(event);

  return event;
};

export const dispatchClick = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "click", { button: 0, ...init });

export const dispatchContextMenu = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "contextmenu", init);

export const dispatchInput = (element: Element, value: string, init: EventInit = {}) => {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error("dispatchInput expected an input or textarea element.");
  }

  element.value = value;

  return dispatchDOMEvent(element, "input", init);
};

export const dispatchKeyDown = (
  target: EventTarget,
  key: string,
  init: TestKeyboardEventOptions = {},
) => {
  const event = createKeyboardEvent(key, init);

  target.dispatchEvent(event);

  return event;
};

export const dispatchMouseDown = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "mousedown", init);

export const dispatchMouseUp = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "mouseup", init);
