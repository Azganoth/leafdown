import "./milkdown-editor.css";
import { useLocalization } from "@/lib/i18n";

import type { DocumentTypography } from "../utils/documentTypography";

export function DocumentTypographyPreview({ font, textSize, lineSpacing }: DocumentTypography) {
  const { t } = useLocalization();

  return (
    <div
      aria-hidden
      className="leafdown-editor leafdown-typography-preview"
      data-document-font={font}
      data-text-size={textSize}
      data-line-spacing={lineSpacing}
      data-testid="document-typography-preview"
    >
      <div className="ProseMirror">
        <h2>{t("editor.typographyPreview.heading")}</h2>
        <p>{t("editor.typographyPreview.paragraph")}</p>
        <ul>
          <li>
            <p>{t("editor.typographyPreview.listItem")}</p>
          </li>
          <li>
            <p>
              <em>{t("editor.typographyPreview.emphasis")}</em>
            </p>
          </li>
        </ul>
        <pre>
          <code>const answer = 42;</code>
        </pre>
      </div>
    </div>
  );
}
