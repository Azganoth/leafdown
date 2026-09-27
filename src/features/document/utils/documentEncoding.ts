export const LEGACY_ENCODING_NAMES = [
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1255",
  "windows-1256",
  "windows-1257",
  "windows-1258",
  "ISO-8859-2",
  "ISO-8859-15",
  "KOI8-R",
  "KOI8-U",
  "Shift_JIS",
  "EUC-JP",
  "GBK",
  "gb18030",
  "Big5",
  "EUC-KR",
] as const;

export type LegacyEncodingName = (typeof LEGACY_ENCODING_NAMES)[number];
export type UnicodeEncodingName = "UTF-8" | "UTF-16LE" | "UTF-16BE";
export type TextEncodingName = UnicodeEncodingName | LegacyEncodingName;

export type DocumentEncoding =
  | { name: UnicodeEncodingName; bom: boolean }
  | { name: LegacyEncodingName; bom: false };

export const UTF8_ENCODING: DocumentEncoding = { name: "UTF-8", bom: false };
export const UTF8_WITH_BOM_ENCODING: DocumentEncoding = { name: "UTF-8", bom: true };
export const NEW_DOCUMENT_ENCODING = UTF8_ENCODING;

const ENCODING_LABELS = {
  "UTF-8": "UTF-8",
  "UTF-16LE": "UTF-16 LE",
  "UTF-16BE": "UTF-16 BE",
  "windows-1250": "Windows-1250",
  "windows-1251": "Windows-1251",
  "windows-1252": "Windows-1252",
  "windows-1253": "Windows-1253",
  "windows-1254": "Windows-1254",
  "windows-1255": "Windows-1255",
  "windows-1256": "Windows-1256",
  "windows-1257": "Windows-1257",
  "windows-1258": "Windows-1258",
  "ISO-8859-2": "ISO-8859-2",
  "ISO-8859-15": "ISO-8859-15",
  "KOI8-R": "KOI8-R",
  "KOI8-U": "KOI8-U",
  Shift_JIS: "Shift_JIS",
  "EUC-JP": "EUC-JP",
  GBK: "GBK",
  gb18030: "GB18030",
  Big5: "Big5",
  "EUC-KR": "EUC-KR",
} as const satisfies Record<TextEncodingName, string>;

export interface EncodingChoice {
  name: TextEncodingName;
  label: string;
}

export const ENCODING_CHOICES: readonly EncodingChoice[] = [
  { name: "UTF-8", label: "UTF-8" },
  { name: "windows-1250", label: "Central European (Windows-1250)" },
  { name: "windows-1251", label: "Cyrillic (Windows-1251)" },
  { name: "windows-1252", label: "Western (Windows-1252, ISO-8859-1)" },
  { name: "windows-1253", label: "Greek (Windows-1253)" },
  { name: "windows-1254", label: "Turkish (Windows-1254)" },
  { name: "windows-1255", label: "Hebrew (Windows-1255)" },
  { name: "windows-1256", label: "Arabic (Windows-1256)" },
  { name: "windows-1257", label: "Baltic (Windows-1257)" },
  { name: "windows-1258", label: "Vietnamese (Windows-1258)" },
  { name: "ISO-8859-2", label: "Central European (ISO-8859-2)" },
  { name: "ISO-8859-15", label: "Western (ISO-8859-15)" },
  { name: "KOI8-R", label: "Cyrillic (KOI8-R)" },
  { name: "KOI8-U", label: "Cyrillic (KOI8-U)" },
  { name: "Shift_JIS", label: "Japanese (Shift_JIS)" },
  { name: "EUC-JP", label: "Japanese (EUC-JP)" },
  { name: "GBK", label: "Simplified Chinese (GBK)" },
  { name: "gb18030", label: "Simplified Chinese (GB18030)" },
  { name: "Big5", label: "Traditional Chinese (Big5)" },
  { name: "EUC-KR", label: "Korean (EUC-KR)" },
  { name: "UTF-16LE", label: "UTF-16 LE without BOM" },
  { name: "UTF-16BE", label: "UTF-16 BE without BOM" },
];

export const formatEncodingName = (name: TextEncodingName) => ENCODING_LABELS[name];

export const formatDocumentEncoding = ({ name, bom }: DocumentEncoding) =>
  bom ? `${ENCODING_LABELS[name]} with BOM` : ENCODING_LABELS[name];

export const isSameEncoding = (left: DocumentEncoding, right: DocumentEncoding) =>
  left.name === right.name && left.bom === right.bom;

export const isUtf8Encoding = (encoding: DocumentEncoding) => encoding.name === "UTF-8";
