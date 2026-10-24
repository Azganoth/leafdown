import {
  Code2Icon,
  ImageIcon,
  InfoIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PilcrowIcon,
  TableIcon,
  TextQuoteIcon,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalization } from "@/lib/i18n";

import type { EditorCommandId } from "../commands";
import type { CalloutTypeChoices, InsertCalloutChoice } from "../commands/formatting/callouts";
import type { BoundaryInsertKind } from "../commands/inserting/blocks";
import { getEditorCommandLabelId } from "../commands/metadata";
import { CalloutTypeIcon } from "./callout-type-icon";

/** A block the Insert menu offers; a list item is offered only where no other block fits. */
export type InsertMenuKind = Exclude<BoundaryInsertKind, "listItem">;

export const INSERT_MENU_COMMAND_IDS = {
  paragraph: "insert.paragraph",
  heading1: "insert.heading1",
  heading2: "insert.heading2",
  heading3: "insert.heading3",
  heading4: "insert.heading4",
  heading5: "insert.heading5",
  heading6: "insert.heading6",
  image: "insert.image",
  blockquote: "insert.blockquote",
  callout: "insert.callout",
  unorderedList: "insert.unorderedList",
  orderedList: "insert.orderedList",
  taskList: "insert.taskList",
  codeBlock: "insert.codeBlock",
  table: "insert.table",
  horizontalRule: "insert.horizontalRule",
} as const satisfies Record<InsertMenuKind, EditorCommandId>;

const HEADING_KINDS = [
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
] as const satisfies readonly InsertMenuKind[];

type InsertMenuEntry = { kind: InsertMenuKind; icon: LucideIcon };

const CONTAINER_ENTRIES = [
  { kind: "blockquote", icon: TextQuoteIcon },
  { kind: "callout", icon: InfoIcon },
  { kind: "orderedList", icon: ListOrderedIcon },
  { kind: "unorderedList", icon: ListIcon },
  { kind: "taskList", icon: ListTodoIcon },
] as const satisfies readonly InsertMenuEntry[];

const OBJECT_ENTRIES = [
  { kind: "image", icon: ImageIcon },
  { kind: "codeBlock", icon: Code2Icon },
  { kind: "table", icon: TableIcon },
  { kind: "horizontalRule", icon: MinusIcon },
] as const satisfies readonly InsertMenuEntry[];

interface InsertCalloutProps {
  onChooseCalloutType: (choice: InsertCalloutChoice, token: string) => void;
  readCalloutTypes: () => CalloutTypeChoices | null;
}

interface EditorInsertMenuItemsProps extends InsertCalloutProps {
  canInsert: (kind: InsertMenuKind) => boolean;
  onInsert: (kind: InsertMenuKind) => void;
}

/** The Insert menu's groups, shared by the context popup's submenu and the gutter's menu. */
export function EditorInsertMenuItems({
  canInsert,
  onChooseCalloutType,
  onInsert,
  readCalloutTypes,
}: EditorInsertMenuItemsProps) {
  const { t } = useLocalization();

  const renderEntry = ({ kind, icon: Icon }: InsertMenuEntry) => {
    if (kind === "callout") {
      return (
        <InsertCalloutSubmenu
          enabled={canInsert(kind)}
          icon={Icon}
          key={kind}
          onChooseCalloutType={onChooseCalloutType}
          readCalloutTypes={readCalloutTypes}
        />
      );
    }

    return (
      <DropdownMenuItem
        closeOnClick={false}
        disabled={!canInsert(kind)}
        key={kind}
        onClick={() => onInsert(kind)}
      >
        <Icon />
        {t(getEditorCommandLabelId(INSERT_MENU_COMMAND_IDS[kind]))}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.insertMenu.text")}</DropdownMenuLabel>
        {renderEntry({ kind: "paragraph", icon: PilcrowIcon })}
      </DropdownMenuGroup>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.insertMenu.heading")}</DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-0.5 px-1 pb-1">
          {HEADING_KINDS.map((kind, index) => (
            <DropdownMenuItem
              aria-label={t(getEditorCommandLabelId(INSERT_MENU_COMMAND_IDS[kind]))}
              className="justify-center px-0 text-xs ring-1 ring-border"
              closeOnClick={false}
              disabled={!canInsert(kind)}
              key={kind}
              onClick={() => onInsert(kind)}
            >
              <span aria-hidden="true">H{index + 1}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.insertMenu.containers")}</DropdownMenuLabel>
        {CONTAINER_ENTRIES.map(renderEntry)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.insertMenu.objects")}</DropdownMenuLabel>
        {OBJECT_ENTRIES.map(renderEntry)}
      </DropdownMenuGroup>
    </>
  );
}

interface InsertCalloutSubmenuProps extends InsertCalloutProps {
  enabled: boolean;
  icon: LucideIcon;
}

function InsertCalloutSubmenu({
  enabled,
  icon: Icon,
  onChooseCalloutType,
  readCalloutTypes,
}: InsertCalloutSubmenuProps) {
  const { t } = useLocalization();
  const label = t("editor.insertMenu.callout");

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={!enabled}>
        <Icon />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuGroup aria-label={label}>
          <InsertCalloutItems
            onChooseCalloutType={onChooseCalloutType}
            readCalloutTypes={readCalloutTypes}
          />
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function InsertCalloutItems({ onChooseCalloutType, readCalloutTypes }: InsertCalloutProps) {
  const { t } = useLocalization();
  const choices = readCalloutTypes();

  if (!choices) {
    return null;
  }

  return (
    <>
      {choices.options.map(({ label, token }) => (
        <DropdownMenuItem
          closeOnClick={false}
          key={token}
          onClick={() => onChooseCalloutType("insert", token)}
        >
          <CalloutTypeIcon token={token} />
          {label}
        </DropdownMenuItem>
      ))}
      {choices.otherDialects && (
        <>
          <DropdownMenuSeparator />
          {choices.otherDialects.map(({ dialect, options }) => (
            <DropdownMenuSub key={dialect}>
              <DropdownMenuSubTrigger inset>
                {t(`editor.calloutDialect.${dialect}`)}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                <DropdownMenuGroup aria-label={t(`editor.calloutDialect.${dialect}`)}>
                  {options.map(({ label, token }) => (
                    <DropdownMenuItem
                      closeOnClick={false}
                      key={token}
                      onClick={() => onChooseCalloutType({ type: "insert", dialect }, token)}
                    >
                      <CalloutTypeIcon token={token} />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </>
      )}
    </>
  );
}
