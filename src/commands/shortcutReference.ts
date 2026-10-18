import { EDITOR_KEYBOARD_INTERACTIONS } from "@/features/editor";
import type { MessageId } from "@/lib/i18n";
import { formatKeyboardKey, normalizeKeyboardKey } from "@/lib/input";

import { APP_COMMAND_IDS } from "./dispatch";
import {
  COMMAND_DEFINITIONS,
  formatShortcut,
  getCommandLabelId,
  getCommandMenuLabelId,
  getShortcutKeyLabels,
  matchesShortcut,
  type CommandMenuId,
  type CommandShortcut,
} from "./metadata";

export interface ShortcutReferenceEntry {
  id: string;
  labelId: MessageId;
  shortcuts: readonly CommandShortcut[];
}

export interface ShortcutReferenceGroup {
  id: CommandMenuId;
  labelId: MessageId;
  entries: ShortcutReferenceEntry[];
}

const MENU_IDS: readonly CommandMenuId[] = ["file", "edit", "insert", "format", "view", "help"];

export const getShortcutReferenceGroups = (): ShortcutReferenceGroup[] =>
  MENU_IDS.map((id) => ({
    id,
    labelId: getCommandMenuLabelId(id),
    entries: [
      ...APP_COMMAND_IDS.filter((commandId) => commandId.startsWith(`${id}.`)).flatMap(
        (commandId) => {
          const shortcuts = COMMAND_DEFINITIONS[commandId].shortcuts;
          return shortcuts?.length
            ? [{ id: commandId, labelId: getCommandLabelId(commandId), shortcuts }]
            : [];
        },
      ),
      ...EDITOR_KEYBOARD_INTERACTIONS.filter((interaction) => interaction.menu === id),
    ],
  }));

const MODIFIER_TERMS = {
  mod: ["mod", "ctrl", "control", "cmd", "command"],
  alt: ["alt", "option"],
  shift: ["shift"],
} as const;

const getShortcutTerms = (shortcut: CommandShortcut) => {
  const { alt, key, mod, shift } = shortcut;
  return [
    ...(mod ? MODIFIER_TERMS.mod : []),
    ...(alt ? MODIFIER_TERMS.alt : []),
    ...(shift ? MODIFIER_TERMS.shift : []),
    normalizeKeyboardKey(key),
    normalizeKeyboardKey(formatKeyboardKey(key)),
    ...getShortcutKeyLabels(shortcut).map(normalizeKeyboardKey),
    ...getShortcutQueryTerms(formatShortcut(shortcut)),
  ];
};

export const getShortcutQueryTerms = (query: string) =>
  query
    .toLocaleLowerCase()
    .split(/[\s+]+/u)
    .filter(Boolean);

export const filterShortcutReferenceGroups = (
  groups: readonly ShortcutReferenceGroup[],
  query: string,
  translate: (labelId: MessageId) => string,
): ShortcutReferenceGroup[] => {
  const terms = getShortcutQueryTerms(query);
  if (!terms.length) {
    return [...groups];
  }

  return groups
    .map((group) => {
      const groupLabel = translate(group.labelId).toLocaleLowerCase();
      return {
        ...group,
        entries: group.entries.filter((entry) => {
          const label = `${translate(entry.labelId).toLocaleLowerCase()} ${groupLabel}`;
          const keys = new Set(entry.shortcuts.flatMap(getShortcutTerms));
          return terms.every((term) => keys.has(term) || (term.length > 1 && label.includes(term)));
        }),
      };
    })
    .filter((group) => group.entries.length);
};

export const filterShortcutReferenceGroupsByEvent = (
  groups: readonly ShortcutReferenceGroup[],
  event: KeyboardEvent,
): ShortcutReferenceGroup[] =>
  groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        entry.shortcuts.some((shortcut) => matchesShortcut(event, shortcut)),
      ),
    }))
    .filter((group) => group.entries.length);
