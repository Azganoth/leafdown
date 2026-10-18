export const FILE_ICON_STYLES = ["neutral", "colored"] as const;
export type FileIconStyle = (typeof FILE_ICON_STYLES)[number];

export type FileIconKind =
  | "article"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "data"
  | "spreadsheet"
  | "archive"
  | "pdf"
  | "document"
  | "other";

const FILE_ICON_EXTENSIONS = {
  image: [
    "avif",
    "bmp",
    "gif",
    "heic",
    "heif",
    "ico",
    "jfif",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "tif",
    "tiff",
    "webp",
  ],
  video: ["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "webm", "wmv"],
  audio: ["aac", "aiff", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "wma"],
  code: [
    "bash",
    "bat",
    "c",
    "cc",
    "cjs",
    "cmd",
    "cpp",
    "cs",
    "css",
    "cts",
    "cxx",
    "dart",
    "ex",
    "exs",
    "fish",
    "go",
    "h",
    "hpp",
    "hs",
    "htm",
    "html",
    "java",
    "js",
    "jsx",
    "kt",
    "kts",
    "less",
    "lua",
    "mjs",
    "mts",
    "php",
    "pl",
    "ps1",
    "py",
    "r",
    "rb",
    "rs",
    "sass",
    "scala",
    "scss",
    "sh",
    "sql",
    "svelte",
    "swift",
    "ts",
    "tsx",
    "vue",
    "zsh",
  ],
  data: [
    "cfg",
    "conf",
    "env",
    "ini",
    "json",
    "json5",
    "jsonc",
    "lock",
    "properties",
    "toml",
    "xml",
    "yaml",
    "yml",
  ],
  spreadsheet: ["csv", "numbers", "ods", "tsv", "xls", "xlsx"],
  archive: ["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip", "zst"],
  pdf: ["pdf"],
  document: ["doc", "docx", "epub", "log", "odt", "pages", "rtf", "tex", "text", "txt"],
} as const satisfies Partial<Record<FileIconKind, readonly string[]>>;

const FILE_ICON_KIND_BY_EXTENSION = new Map<string, FileIconKind>(
  Object.entries(FILE_ICON_EXTENSIONS).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as FileIconKind] as const),
  ),
);

/** Classifies a file Leafdown cannot open; articles take the `article` kind from their row. */
export const getFileIconKind = (fileName: string): FileIconKind => {
  const extensionStart = fileName.lastIndexOf(".");

  if (extensionStart === -1) {
    return "other";
  }

  return (
    FILE_ICON_KIND_BY_EXTENSION.get(fileName.slice(extensionStart + 1).toLowerCase()) ?? "other"
  );
};
