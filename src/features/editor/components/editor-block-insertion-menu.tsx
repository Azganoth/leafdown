import { useRef, type KeyboardEvent } from "react";

import { Popover, PopoverContent } from "@/components/ui/popover";

import type { BoundaryInsertKind } from "../commands/inserting/blocks";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";

const LABELS: Record<BoundaryInsertKind, string> = {
  paragraph: "Paragraph",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  heading4: "Heading 4",
  heading5: "Heading 5",
  heading6: "Heading 6",
  image: "Image",
  blockquote: "Block quote",
  unorderedList: "Bulleted list",
  orderedList: "Numbered list",
  taskList: "Task list",
  codeBlock: "Code block",
  table: "Table",
  horizontalRule: "Horizontal rule",
  listItem: "List item",
};

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
        aria-label="Insert block"
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
            {LABELS[kind]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
