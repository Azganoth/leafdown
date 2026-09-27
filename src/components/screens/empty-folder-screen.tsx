import { FolderOpenIcon } from "lucide-react";

import { useLocalization } from "@/lib/i18n";

export function EmptyFolderScreen() {
  const { t } = useLocalization();

  return (
    <section
      aria-labelledby="empty-folder-title"
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          <FolderOpenIcon className="size-7" />
        </span>
        <h2 id="empty-folder-title" className="mt-5 text-xl font-semibold">
          {t("emptyFolder.title")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("emptyFolder.description")}
        </p>
      </div>
    </section>
  );
}
