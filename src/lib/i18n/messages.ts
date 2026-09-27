import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";

import SOURCE_MESSAGES from "@/locales/en.json";

export type MessageId = keyof typeof SOURCE_MESSAGES;
export type MessageSource = string | MessageFormatElement[];
export type MessageCatalog = Partial<Record<MessageId, MessageSource>>;

export const SOURCE_LOCALE = "en";

export { SOURCE_MESSAGES };
