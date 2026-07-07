import { TaskLimiter } from "@/lib/async";
import { CancellationToken, raceWithCancellation } from "@/lib/cancellation";
import { toTauriAssetUrl } from "@/lib/url";

import {
  resolveMarkdownImageTarget,
  type ResolveMarkdownImageTargetResult,
} from "../services/markdownImageApi";
import type { MarkdownReferenceContext } from "./markdownReferences";

export type MarkdownImageResolution =
  | Exclude<ResolveMarkdownImageTargetResult, { kind: "renderable" }>
  | { kind: "renderable"; path: string; assetUrl: string };

export interface ResolveMarkdownImageOptions extends MarkdownReferenceContext {
  allowOutsideFolder?: boolean;
  target: string;
}

const MAX_CONCURRENT_IMAGE_RESOLUTIONS = 4;

const imageResolutionTaskLimiter = new TaskLimiter(MAX_CONCURRENT_IMAGE_RESOLUTIONS);

export const resolveMarkdownImage = async (
  {
    allowOutsideFolder = false,
    documentPath,
    folderContextPath,
    target,
  }: ResolveMarkdownImageOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
): Promise<MarkdownImageResolution> => {
  const result = await imageResolutionTaskLimiter.run(
    () =>
      raceWithCancellation(cancellationToken, () =>
        resolveMarkdownImageTarget({
          allowOutsideFolder,
          documentPath,
          folderContextPath,
          target,
        }),
      ),
    cancellationToken,
  );

  if (result.kind === "renderable") {
    return {
      ...result,
      assetUrl: toTauriAssetUrl(result.path),
    };
  }

  return result;
};
