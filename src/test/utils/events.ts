import { TEXT_HTML_MIME_TYPE } from "@/lib/mime";

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

export const createClipboardData = (
  initialData: Readonly<Record<string, string>> = {},
): DataTransfer => {
  const data = new Map(Object.entries(initialData));

  return {
    clearData: (format?: string) => {
      if (format) {
        data.delete(format);
      } else {
        data.clear();
      }
    },
    getData: (format: string) => data.get(format) ?? "",
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    get types() {
      return [...data.keys()];
    },
  } as unknown as DataTransfer;
};

export const parseClipboardHtml = (source: DataTransfer | string) => {
  const template = document.createElement("template");
  template.innerHTML = typeof source === "string" ? source : source.getData(TEXT_HTML_MIME_TYPE);

  return template.content;
};

const isClipboardDataTransfer = (
  value: DataTransfer | Readonly<Record<string, string>>,
): value is DataTransfer => typeof (value as DataTransfer).getData === "function";

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

export const dispatchClipboardEvent = (
  target: EventTarget,
  type: "copy" | "cut" | "paste",
  data: DataTransfer | Readonly<Record<string, string>> = {},
) => {
  const clipboardData = isClipboardDataTransfer(data) ? data : createClipboardData(data);
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;

  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  target.dispatchEvent(event);

  return { clipboardData, event };
};

export const dispatchMouseDown = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "mousedown", init);

export const dispatchMouseUp = (element: Element, init: TestMouseEventOptions = {}) =>
  dispatchMouseEvent(element, "mouseup", init);
