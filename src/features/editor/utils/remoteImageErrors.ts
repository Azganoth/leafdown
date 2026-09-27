import { t } from "@/lib/i18n";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type { FetchRemoteImageError } from "../services/markdownImageApi";

const FETCH_REMOTE_IMAGE_ERROR_KINDS = [
  "invalidTarget",
  "insecureScheme",
  "blockedDestination",
  "insecureRedirect",
  "tooManyRedirects",
  "httpStatus",
  "tooLarge",
  "unsupportedType",
  "timeout",
  "network",
] as const satisfies readonly FetchRemoteImageError["kind"][];

export const isFetchRemoteImageError = (error: unknown): error is FetchRemoteImageError =>
  isTaggedPayload(error, FETCH_REMOTE_IMAGE_ERROR_KINDS);

export const getRemoteImageErrorMessage = (error: unknown) => {
  if (!isFetchRemoteImageError(error)) {
    return t("editor.remoteImageError.fallback");
  }

  switch (error.kind) {
    case "invalidTarget":
      return t("editor.remoteImageError.invalidTarget");

    case "insecureScheme":
      return t("editor.remoteImageError.insecureScheme");

    case "blockedDestination":
      return t("editor.remoteImageError.blockedDestination");

    case "insecureRedirect":
      return t("editor.remoteImageError.insecureRedirect");

    case "tooManyRedirects":
      return t("editor.remoteImageError.tooManyRedirects");

    case "httpStatus":
      return t("editor.remoteImageError.httpStatus", { status: String(error.status) });

    case "tooLarge":
      return t("editor.remoteImageError.tooLarge");

    case "unsupportedType":
      return t("editor.remoteImageError.unsupportedType");

    case "timeout":
      return t("editor.remoteImageError.timeout");

    case "network":
      return t("editor.remoteImageError.network");
  }
};
