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

const FALLBACK_REMOTE_IMAGE_ERROR_MESSAGE = "Image could not be loaded.";

export const isFetchRemoteImageError = (error: unknown): error is FetchRemoteImageError =>
  isTaggedPayload(error, FETCH_REMOTE_IMAGE_ERROR_KINDS);

export const getRemoteImageErrorMessage = (error: unknown) => {
  if (!isFetchRemoteImageError(error)) {
    return FALLBACK_REMOTE_IMAGE_ERROR_MESSAGE;
  }

  switch (error.kind) {
    case "invalidTarget":
      return "Image address is not allowed.";

    case "insecureScheme":
      return "Only HTTPS images can load.";

    case "blockedDestination":
      return "Local and private network addresses are blocked.";

    case "insecureRedirect":
      return "Image redirected to an insecure address.";

    case "tooManyRedirects":
      return "Image redirected too many times.";

    case "httpStatus":
      return `Image request failed (HTTP ${error.status}).`;

    case "tooLarge":
      return "Image is larger than 10 MB.";

    case "unsupportedType":
      return "Unsupported remote image format.";

    case "timeout":
      return "Image request timed out.";

    case "network":
      return "Image could not be downloaded.";
  }
};
