import { ListPlusIcon } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useLocalization } from "@/lib/i18n";

import type { CalloutTypeChoices, InsertCalloutChoice } from "../commands/formatting/callouts";
import type { BoundaryInsertKind } from "../commands/inserting/blocks";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";
import { isDismissedFromOutside } from "../utils/popoverDismissal";
import { EditorInsertMenuItems } from "./editor-insert-menu";

const ENABLED_ITEM_SELECTOR = "[role='menuitem']:not([data-disabled])";

interface EditorBlockInsertionMenuProps {
  request: BlockInsertionRequest | null;
  onChooseCalloutType: (choice: InsertCalloutChoice, token: string) => void;
  onClose: () => void;
  onExecute: (kind: BoundaryInsertKind) => void;
  onReturnFocus: () => void;
  readCalloutTypes: () => CalloutTypeChoices | null;
}

export function EditorBlockInsertionMenu({
  request,
  onChooseCalloutType,
  onClose,
  onExecute,
  onReturnFocus,
  readCalloutTypes,
}: EditorBlockInsertionMenuProps) {
  const { t } = useLocalization();
  const contentRef = useRef<HTMLDivElement>(null);

  // A menu opened without a trigger keeps focus where it was, so its first choice takes it.
  useEffect(() => {
    if (!request) return undefined;
    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>(ENABLED_ITEM_SELECTOR)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [request]);

  if (!request) return null;

  // Between list items nothing but another item fits, so the full menu would be all disabled.
  const offersListItem = request.kinds.includes("listItem");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      onReturnFocus();
      onClose();
    }
  };

  return (
    <DropdownMenu
      modal={false}
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (!isDismissedFromOutside(details)) onReturnFocus();
        onClose();
      }}
    >
      <DropdownMenuContent
        anchor={request.anchor}
        aria-label={t("editor.blockInsertion.label")}
        className="w-56"
        data-testid="editor-block-insertion-menu"
        finalFocus={false}
        onKeyDown={handleKeyDown}
        ref={contentRef}
        side="right"
        sideOffset={8}
      >
        {offersListItem ? (
          <DropdownMenuItem closeOnClick={false} onClick={() => onExecute("listItem")}>
            <ListPlusIcon />
            {t("editor.blockInsertion.listItem")}
          </DropdownMenuItem>
        ) : (
          <EditorInsertMenuItems
            canInsert={(kind) => request.kinds.includes(kind)}
            onChooseCalloutType={onChooseCalloutType}
            onInsert={onExecute}
            readCalloutTypes={readCalloutTypes}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
