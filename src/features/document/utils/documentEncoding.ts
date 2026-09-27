import type { Localization, MessageId } from "@/lib/i18n";

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
  labelId: MessageId;
}

export const ENCODING_CHOICES: readonly EncodingChoice[] = [
  { name: "UTF-8", labelId: "document.encodingChoice.utf8" },
  { name: "windows-1250", labelId: "document.encodingChoice.windows1250" },
  { name: "windows-1251", labelId: "document.encodingChoice.windows1251" },
  { name: "windows-1252", labelId: "document.encodingChoice.windows1252" },
  { name: "windows-1253", labelId: "document.encodingChoice.windows1253" },
  { name: "windows-1254", labelId: "document.encodingChoice.windows1254" },
  { name: "windows-1255", labelId: "document.encodingChoice.windows1255" },
  { name: "windows-1256", labelId: "document.encodingChoice.windows1256" },
  { name: "windows-1257", labelId: "document.encodingChoice.windows1257" },
  { name: "windows-1258", labelId: "document.encodingChoice.windows1258" },
  { name: "ISO-8859-2", labelId: "document.encodingChoice.iso88592" },
  { name: "ISO-8859-15", labelId: "document.encodingChoice.iso885915" },
  { name: "KOI8-R", labelId: "document.encodingChoice.koi8r" },
  { name: "KOI8-U", labelId: "document.encodingChoice.koi8u" },
  { name: "Shift_JIS", labelId: "document.encodingChoice.shiftJis" },
  { name: "EUC-JP", labelId: "document.encodingChoice.eucJp" },
  { name: "GBK", labelId: "document.encodingChoice.gbk" },
  { name: "gb18030", labelId: "document.encodingChoice.gb18030" },
  { name: "Big5", labelId: "document.encodingChoice.big5" },
  { name: "EUC-KR", labelId: "document.encodingChoice.eucKr" },
  { name: "UTF-16LE", labelId: "document.encodingChoice.utf16le" },
  { name: "UTF-16BE", labelId: "document.encodingChoice.utf16be" },
];

export const formatEncodingName = (name: TextEncodingName) => ENCODING_LABELS[name];

export const formatDocumentEncoding = ({ name, bom }: DocumentEncoding, { t }: Localization) =>
  bom ? t("document.encoding.withBom", { encoding: ENCODING_LABELS[name] }) : ENCODING_LABELS[name];

export const isSameEncoding = (left: DocumentEncoding, right: DocumentEncoding) =>
  left.name === right.name && left.bom === right.bom;

export const isUtf8Encoding = (encoding: DocumentEncoding) => encoding.name === "UTF-8";
