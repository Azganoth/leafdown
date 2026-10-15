import { useLocalization } from "@/lib/i18n";

import { EmptyFolderArt } from "./placeholder-art";
import { PlaceholderScreen } from "./placeholder-screen";

export function EmptyFolderScreen() {
  const { t } = useLocalization();

  return (
    <PlaceholderScreen
      art={<EmptyFolderArt />}
      description={t("emptyFolder.description")}
      title={t("emptyFolder.title")}
      titleId="empty-folder-title"
    />
  );
}
