import { $shortcut } from "@milkdown/kit/utils";

import type { EditorCommandId } from "../commands";

type RunLeafdownCommand = (commandId: EditorCommandId) => boolean;

const LEAFDOWN_COMMAND_PRIORITY = 100;

const LEAFDOWN_KEYBOARD_COMMANDS = {
  "Mod-y": "edit.redo",
  "Mod-z": "edit.undo",
  "Shift-Mod-z": "edit.redo",
  "Mod-Alt-0": "format.paragraph",
  "Mod-Alt-1": "format.heading1",
  "Mod-Alt-2": "format.heading2",
  "Mod-Alt-3": "format.heading3",
  "Mod-Alt-4": "format.heading4",
  "Mod-Alt-5": "format.heading5",
  "Mod-Alt-6": "format.heading6",
  "Mod-Alt-x": "format.strikethrough",
  "Mod-b": "format.strong",
  "Mod-e": "format.inlineCode",
  "Mod-i": "format.emphasis",
} satisfies Record<string, EditorCommandId>;

export const createLeafdownCommandKeymapPlugin = (runCommand: RunLeafdownCommand) =>
  $shortcut(() =>
    Object.fromEntries(
      Object.entries(LEAFDOWN_KEYBOARD_COMMANDS).map(([shortcut, commandId]) => [
        shortcut,
        {
          key: shortcut,
          onRun: () => () => {
            runCommand(commandId);

            return true;
          },
          priority: LEAFDOWN_COMMAND_PRIORITY,
        },
      ]),
    ),
  );
