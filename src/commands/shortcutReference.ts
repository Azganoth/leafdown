import { EDITOR_KEYBOARD_INTERACTIONS } from "@/features/editor";
import type { MessageId } from "@/lib/i18n";

import { APP_COMMAND_IDS } from "./dispatch";
import {
  COMMAND_DEFINITIONS,
  getCommandLabelId,
  getCommandMenuLabelId,
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
