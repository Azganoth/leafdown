export type DocumentFont =
  | "inter"
  | "ibm-plex-sans"
  | "atkinson-hyperlegible"
  | "literata"
  | "system";

export type DocumentTextSize = 14 | 16 | 18 | 20;

export type DocumentLineSpacing = "compact" | "default" | "relaxed";

export interface DocumentTypography {
  font: DocumentFont;
  textSize: DocumentTextSize;
  lineSpacing: DocumentLineSpacing;
}
