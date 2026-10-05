import type { FileMetadataSnapshot } from "@/features/document";
import { PathMap } from "@/lib/path";

// In UTF-16 units: the searchable text of about 10,000 notes of a few kilobytes each.
const DEFAULT_TEXT_BUDGET = 32 * 1024 * 1024;

export interface CachedSearchText {
  metadata: FileMetadataSnapshot;
  fingerprint: string;
  text: string;
}

/**
 * The searchable text of files already read, by the version of the file it was read from, so a
 * later search reads a file again only once it changes. Files past the budget are not kept.
 */
export class FolderSearchTextCache {
  private readonly texts = new PathMap<CachedSearchText>();
  private length = 0;

  constructor(private readonly budget = DEFAULT_TEXT_BUDGET) {}

  get(path: string) {
    return this.texts.get(path);
  }

  set(path: string, entry: CachedSearchText) {
    this.delete(path);

    if (this.length + entry.text.length > this.budget) {
      return;
    }

    this.texts.set(path, entry);
    this.length += entry.text.length;
  }

  delete(path: string) {
    const cached = this.texts.get(path);

    if (cached) {
      this.texts.delete(path);
      this.length -= cached.text.length;
    }
  }

  clear() {
    this.texts.clear();
    this.length = 0;
  }
}
