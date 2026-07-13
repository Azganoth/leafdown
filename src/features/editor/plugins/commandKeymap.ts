import { $shortcut } from "@milkdown/kit/utils";

import type { EditorCommandId } from "../commands";

type RunLeafdownCommand = (commandId: EditorCommandId) => boolean;

const LEAFDOWN_KEYBOARD_COMMANDS = {
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
        () => runCommand(commandId),
      ]),
    ),
  );
