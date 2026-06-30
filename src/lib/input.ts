import { isMacPlatform } from "./platform";

export const formatKeyboardKey = (key: string) => (key.length === 1 ? key.toUpperCase() : key);

export const hasNoShortcutModifier = (event: KeyboardEvent | MouseEvent) =>
  !event.altKey && !event.ctrlKey && !event.metaKey;

export const hasPointerCoordinates = (event: MouseEvent) =>
  event.clientX !== 0 || event.clientY !== 0;

export const isPrimaryModifierEvent = (event: KeyboardEvent | MouseEvent) =>
  isMacPlatform() ? event.metaKey : event.ctrlKey;

export const hasNonPrimaryModifierEvent = (event: KeyboardEvent | MouseEvent) =>
  isMacPlatform() ? event.ctrlKey : event.metaKey;

export const isUndoKey = (event: KeyboardEvent) =>
  isPrimaryModifierEvent(event) && normalizeKeyboardKey(event.key) === "z" && !event.shiftKey;

export const isRedoKey = (event: KeyboardEvent) => {
  const key = normalizeKeyboardKey(event.key);

  return isPrimaryModifierEvent(event) && (key === "y" || (key === "z" && event.shiftKey));
};

export const normalizeKeyboardKey = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
