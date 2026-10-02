import type { MessageId } from "@/lib/i18n";

interface EditorKeyboardInteraction {
  id: string;
  labelId: MessageId;
  menu: "edit" | "insert";
  shortcuts: readonly {
    key: string;
    alt?: boolean;
    mod?: boolean;
    shift?: boolean;
  }[];
}

export const EDITOR_KEYBOARD_INTERACTIONS: readonly EditorKeyboardInteraction[] = [
  {
    id: "editor.openContextMenu",
    labelId: "shortcuts.editor.openContextMenu",
    menu: "edit",
    shortcuts: [{ key: "F10", shift: true }, { key: "ContextMenu" }],
  },
  {
    id: "editor.previewFootnote",
    labelId: "shortcuts.editor.previewFootnote",
    menu: "edit",
    shortcuts: [{ key: "p", mod: true, alt: true }],
  },
  {
    id: "editor.toggleBlockSelection",
    labelId: "shortcuts.editor.toggleBlockSelection",
    menu: "edit",
    shortcuts: [{ key: "Escape" }],
  },
  {
    id: "editor.moveBlockSelection",
    labelId: "shortcuts.editor.moveBlockSelection",
    menu: "edit",
    shortcuts: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
  },
  {
    id: "editor.extendBlockSelection",
    labelId: "shortcuts.editor.extendBlockSelection",
    menu: "edit",
    shortcuts: [
      { key: "ArrowUp", shift: true },
      { key: "ArrowDown", shift: true },
    ],
  },
  {
    id: "editor.returnToEditing",
    labelId: "shortcuts.editor.returnToEditing",
    menu: "edit",
    shortcuts: [{ key: "Enter" }],
  },
  {
    id: "editor.insertBlock",
    labelId: "shortcuts.editor.insertBlock",
    menu: "insert",
    shortcuts: [{ key: "i", mod: true, alt: true }],
  },
];
