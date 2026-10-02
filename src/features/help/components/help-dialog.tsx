import { useRef, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocalization } from "@/lib/i18n";

import { HELP_PAGES, type HelpPageId } from "../services/pages";
import { HelpMarkdown } from "./help-markdown";

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
      <DialogContent className="flex h-[min(40rem,calc(100dvh-2rem))] min-h-0 flex-col gap-4 sm:max-w-2xl">
        {shownPage && (
          <>
            <DialogHeader className="shrink-0 pr-10">
              <DialogTitle>{t(HELP_PAGE_LABELS[shownPage])}</DialogTitle>
            </DialogHeader>
            <HelpMarkdown
              key={shownPage}
              ref={focusAfterPageLink}
              source={HELP_PAGES[shownPage]}
              onPageLink={followPageLink}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
