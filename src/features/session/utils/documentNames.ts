import type { ActiveDocumentState } from "@/features/document";
import type { Translate } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

const UNTITLED_ID_PREFIX = "untitled:";

export const toUntitledDocumentId = (number: number) => `${UNTITLED_ID_PREFIX}${number}`;

const getUntitledNumber = (documentId: string) => {
  const number = Number(documentId.slice(UNTITLED_ID_PREFIX.length));

  return Number.isInteger(number) && number > 0 ? number : 1;
};

/** The lowest number no open untitled document uses, so names stay short as documents close. */
export const getNextUntitledNumber = (documents: readonly ActiveDocumentState[]) => {
  const used = new Set(
    documents.flatMap((document) =>
      document.status === "untitled" ? [getUntitledNumber(document.id)] : [],
    ),
  );
  let number = 1;

  while (used.has(number)) {
    number += 1;
  }

  return number;
};

export const getDocumentName = (document: ActiveDocumentState, t: Translate) =>
  document.status === "saved"
    ? getPathParts(document.path).name
    : t("session.untitledDocumentName", { number: getUntitledNumber(document.id) });
