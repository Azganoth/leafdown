import { useRef, type KeyboardEvent } from "react";

import { Popover, PopoverContent } from "@/components/ui/popover";
import { useLocalization, type MessageId } from "@/lib/i18n";

import type { BoundaryInsertKind } from "../commands/inserting/blocks";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";

const LABEL_IDS = {
  paragraph: "editor.blockInsertion.paragraph",
  heading1: "editor.blockInsertion.heading1",
  heading2: "editor.blockInsertion.heading2",
  heading3: "editor.blockInsertion.heading3",
  heading4: "editor.blockInsertion.heading4",
  heading5: "editor.blockInsertion.heading5",
  heading6: "editor.blockInsertion.heading6",
  image: "editor.blockInsertion.image",
  blockquote: "editor.blockInsertion.blockquote",
  unorderedList: "editor.blockInsertion.unorderedList",
  orderedList: "editor.blockInsertion.orderedList",
  taskList: "editor.blockInsertion.taskList",
  codeBlock: "editor.blockInsertion.codeBlock",
  table: "editor.blockInsertion.table",
  horizontalRule: "editor.blockInsertion.horizontalRule",
  listItem: "editor.blockInsertion.listItem",
} as const satisfies Record<BoundaryInsertKind, MessageId>;

interface EditorBlockInsertionMenuProps {
  request: BlockInsertionRequest | null;
  onClose: () => void;
  onExecute: (kind: BoundaryInsertKind) => void;
  onReturnFocus: () => void;
}

export function EditorBlockInsertionMenu({
  request,
  onClose,
  onExecute,
  onReturnFocus,
}: EditorBlockInsertionMenuProps) {
  const { t } = useLocalization();
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(true);
  if (!request) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next !== null && items.length > 0) {
      event.preventDefault();
      items[(next + items.length) % items.length].focus();
    }
  };

  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        if (!open) {
          returnFocusRef.current = details.reason !== "outside-press";
          onClose();
        }
      }}
    >
      <PopoverContent
        anchor={request.anchor}
        aria-label={t("editor.blockInsertion.label")}
        className="w-44 gap-0 border border-border/70 p-1 motion-reduce:animate-none motion-reduce:duration-0"
        data-testid="editor-block-insertion-menu"
        finalFocus={() => {
          if (returnFocusRef.current) onReturnFocus();
          returnFocusRef.current = true;
          return false;
        }}
        initialFocus={() =>
          contentRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']") ?? false
        }
        onKeyDown={handleKeyDown}
        ref={contentRef}
        role="menu"
        side="right"
        sideOffset={8}
      >
        {request.kinds.map((kind) => (
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent focus:bg-accent focus:text-accent-foreground"
            key={kind}
            onClick={() => onExecute(kind)}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            {t(LABEL_IDS[kind])}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
