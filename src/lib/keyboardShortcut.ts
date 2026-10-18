import { formatKeyboardKey } from "./input";
import { isMacPlatform } from "./platform";

export interface KeyboardShortcut {
  key: string;
  alt?: boolean;
  mod?: boolean;
  shift?: boolean;
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Escape: "Esc",
};
const KEY_NAMES: Record<string, string> = {
  ArrowUp: "Up Arrow",
  ArrowDown: "Down Arrow",
  ArrowLeft: "Left Arrow",
  ArrowRight: "Right Arrow",
  PageUp: "Page Up",
  PageDown: "Page Down",
};

const KEY_ALIASES: Record<string, string> = {
  Ctrl: "Control",
  Cmd: "Command",
  Esc: "Escape",
  PgUp: "PageUp",
  PgDn: "PageDown",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
};

const MODIFIERS = ["Mod", "Control", "Alt", "Shift", "Command"];
const MAC_MODIFIERS = ["Control", "Alt", "Shift", "Command"];
const MAC_KEY_LABELS: Record<string, string> = { Control: "⌃", Alt: "⌥", Shift: "⇧", Command: "⌘" };
const NAMED_KEYS = [
  ...MODIFIERS,
  ...Object.keys(KEY_LABELS),
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "Space",
  "Insert",
  "ContextMenu",
];

const canonicalKey = (key: string) => (Object.hasOwn(KEY_ALIASES, key) ? KEY_ALIASES[key] : key);
const modifierRank = (key: string) => {
  const index = MAC_MODIFIERS.indexOf(key);
  return index === -1 ? MAC_MODIFIERS.length : index;
};

export const getShortcutKeys = ({ alt, key, mod, shift }: KeyboardShortcut) => [
  ...(mod ? ["Mod"] : []),
  ...(alt ? ["Alt"] : []),
  ...(shift ? ["Shift"] : []),
  key,
];

export const presentKeyboardKeys = (keys: readonly string[]) => {
  const mac = isMacPlatform();
  const names = keys.map((key) => {
    const name = canonicalKey(key);
    return name === "Mod" ? (mac ? "Command" : "Control") : name;
  });
  if (mac) {
    names.sort((a, b) => modifierRank(a) - modifierRank(b));
  }

  return names.map((name) => {
    const accessible = Object.hasOwn(KEY_NAMES, name)
      ? KEY_NAMES[name]
      : !mac && name === "Control"
        ? "Ctrl"
        : mac && name === "Alt"
          ? "Option"
          : formatKeyboardKey(name);
    const symbol = mac && Object.hasOwn(MAC_KEY_LABELS, name) ? MAC_KEY_LABELS[name] : undefined;
    const label = Object.hasOwn(KEY_LABELS, name) ? KEY_LABELS[name] : undefined;
    return { label: symbol ?? label ?? accessible, accessible };
  });
};

export const parseKeyboardKeys = (text: string): string[] | null => {
  const keys = (text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.split("+")).map(
    canonicalKey,
  );
  const key = keys.at(-1) ?? "";
  const modifiers = keys.slice(0, -1);
  if (
    modifiers.some((modifier) => !MODIFIERS.includes(modifier)) ||
    new Set(modifiers).size !== modifiers.length ||
    !(
      NAMED_KEYS.includes(key) ||
      /^F(?:[1-9]|1\d|2[0-4])$/u.test(key) ||
      (modifiers.length > 0 && /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(key))
    )
  ) {
    return null;
  }
  return keys;
};
