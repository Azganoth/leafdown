import { afterEach, beforeEach, expect, vi } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

const createClipboardItem = (type: string, value: string): ClipboardItem =>
  ({
    types: [type],
    getType: vi.fn(async () => new Blob([value], { type })),
  }) as unknown as ClipboardItem;

export const setupClipboardMock = () => {
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const clipboard = {
    read: vi.fn<() => Promise<ClipboardItem[]>>(),
    readText: vi.fn<() => Promise<string>>(),
    write: vi.fn<(data: ClipboardItem[]) => Promise<void>>(),
    writeText: vi.fn<(text: string) => Promise<void>>(),
  };

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    clipboard.read.mockResolvedValue([]);
    clipboard.readText.mockResolvedValue("");
    clipboard.write.mockResolvedValue(undefined);
    clipboard.writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  return {
    clipboard,
    createClipboardItem,
    expectClipboardTextWritten: async (text: string) => {
      const textWriteCall = clipboard.writeText.mock.calls.at(-1);

      if (textWriteCall) {
        expect(textWriteCall[0]).toBe(text);
        return;
      }

      const richWriteCall = clipboard.write.mock.calls.at(-1);

      if (!richWriteCall) {
        throw new Error("Expected clipboard.write or clipboard.writeText to be called.");
      }

      const [[item]] = richWriteCall;

      if (!item) {
        throw new Error("Expected clipboard.write to receive a clipboard item.");
      }

      expect(item.types).toContain(TEXT_PLAIN_MIME_TYPE);
      await expect(item.getType(TEXT_PLAIN_MIME_TYPE).then((blob) => blob.text())).resolves.toBe(
        text,
      );
    },
  };
};
