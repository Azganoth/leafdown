import { useRef, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { useLocalization } from "@/lib/i18n";

import { getHelpPageSections, HELP_PAGES, type HelpPageId } from "../services/pages";
import { HelpMarkdown } from "./help-markdown";
import { HelpPageContent, HelpPageHeader } from "./help-page";

interface HelpDialogProps {
  page: HelpPageId | null;
  onPageChange: (page: HelpPageId | null) => void;
}

const HELP_PAGE_LABELS = {
  "getting-started": "command.help.gettingStarted",
  "markdown-reference": "command.help.markdownReference",
  "file-and-folder-workflows": "command.help.fileAndFolderWorkflows",
  "settings-reference": "command.help.settingsReference",
} as const;

export function HelpDialog({ page, onPageChange }: HelpDialogProps) {
  const { t } = useLocalization();
  const followedLinkRef = useRef(false);
  const [shownPage, setShownPage] = useState(page);
  if (page && page !== shownPage) {
    setShownPage(page);
  }

  const followPageLink = (target: HelpPageId) => {
    followedLinkRef.current = true;
    onPageChange(target);
  };

  const focusAfterPageLink = (article: HTMLElement | null) => {
    if (article && followedLinkRef.current) {
      followedLinkRef.current = false;
      article.focus({ preventScroll: true });
    }
  };

  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onPageChange(null)}>
      <HelpPageContent kind="guide">
        {shownPage && (
          <>
            <HelpPageHeader title={t(HELP_PAGE_LABELS[shownPage])} />
            <HelpMarkdown
              key={shownPage}
              ref={focusAfterPageLink}
              source={HELP_PAGES[shownPage]}
              sections={getHelpPageSections(HELP_PAGES[shownPage])}
              onPageLink={followPageLink}
            />
          </>
        )}
      </HelpPageContent>
    </Dialog>
  );
}
