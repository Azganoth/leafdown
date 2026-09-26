import { writeFileSync } from "node:fs";

import { COMMAND_DEFINITIONS, COMMAND_MENU_LABELS } from "../../../src/commands/metadata";

const messages: Record<string, string> = {};

for (const [menuId, label] of Object.entries(COMMAND_MENU_LABELS)) {
  messages[`menu.${menuId}`] = label;
}

for (const [commandId, definition] of Object.entries(COMMAND_DEFINITIONS)) {
  messages[`command.${commandId}`] = definition.label;
}

writeFileSync(process.argv[2], `${JSON.stringify(messages, null, 2)}\n`);
console.log(`${Object.keys(messages).length} messages`);
