import { useLocalization } from "@/lib/i18n";

import { NoDocumentArt } from "./placeholder-art";
import { PlaceholderScreen } from "./placeholder-screen";

export function FolderOnlyScreen() {
  const { t } = useLocalization();

  return (
    <PlaceholderScreen
      art={<NoDocumentArt />}
      description={t("folderOnly.description")}
      title={t("folderOnly.title")}
      titleId="folder-only-title"
    />
  );
}
