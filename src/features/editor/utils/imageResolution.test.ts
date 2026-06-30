import { convertFileSrc } from "@tauri-apps/api/core";
import { describe, expect, it } from "vitest";

import { CancellationError, CancellationToken, CancellationTokenSource } from "@/lib/cancellation";
import { createMarkdownReferenceContext } from "@/test/factories/editor";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

import { resolveMarkdownImage } from "./imageResolution";

type RenderableImageTargetResult = { kind: "renderable"; path: string };
type MissingImageTargetResult = { kind: "missing"; path: string };

describe("imageResolution", () => {
  it("resolves renderable backend paths into encoded asset URLs", async () => {
    const imageResult = {
      kind: "renderable" as const,
      path: "C:\\Notes\\assets\\icon special.png",
    };
    mockTauriApiCommand("resolveMarkdownImageTarget", () => imageResult);

    await expect(
      resolveMarkdownImage({
        ...createMarkdownReferenceContext(),
        target: "./assets/icon special.png",
      }),
    ).resolves.toEqual({
      ...imageResult,
      assetUrl: "asset://localhost/C%3A%2FNotes%2Fassets%2Ficon%20special.png",
    });
    expect(getLastTauriApiArgs("resolveMarkdownImageTarget")).toEqual({
      ...createMarkdownReferenceContext(),
      target: "./assets/icon special.png",
      explicitLoad: false,
    });
  });

  it("returns blocked and placeholder states without asset URL conversion", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({ kind: "remoteBlocked" }));

    await expect(
      resolveMarkdownImage({
        ...createMarkdownReferenceContext(),
        target: "https://example.com/icon.png",
      }),
    ).resolves.toEqual({ kind: "remoteBlocked" });
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("rejects without invoking the backend when already cancelled", async () => {
    await expect(
      resolveMarkdownImage(
        {
          ...createMarkdownReferenceContext(),
          target: "./assets/icon.png",
        },
        CancellationToken.Cancelled,
      ),
    ).rejects.toThrow(CancellationError);
    expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(0);
  });

  it("rejects resolved backend results when cancelled before completion", async () => {
    const source = new CancellationTokenSource();
    const resolution = Promise.withResolvers<RenderableImageTargetResult>();

    mockTauriApiCommand("resolveMarkdownImageTarget", () => resolution.promise);

    const result = resolveMarkdownImage(
      {
        ...createMarkdownReferenceContext(),
        target: "./assets/icon.png",
      },
      source.token,
    );

    source.cancel();
    resolution.resolve({ kind: "renderable", path: "C:\\Notes\\assets\\icon.png" });

    await expect(result).rejects.toThrow(CancellationError);
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("rejects failed backend results as cancellation when cancelled before completion", async () => {
    const source = new CancellationTokenSource();
    const resolution = Promise.withResolvers<never>();

    mockTauriApiCommand("resolveMarkdownImageTarget", () => resolution.promise);

    const result = resolveMarkdownImage(
      {
        ...createMarkdownReferenceContext(),
        target: "./assets/icon.png",
      },
      source.token,
    );

    source.cancel();
    resolution.reject(new Error("Backend failed."));

    await expect(result).rejects.toThrow(CancellationError);
  });

  it("limits concurrent backend resolution requests", async () => {
    const resolutions = Array.from({ length: 5 }, () =>
      Promise.withResolvers<MissingImageTargetResult>(),
    );
    let resolutionIndex = 0;

    mockTauriApiCommand("resolveMarkdownImageTarget", () => resolutions[resolutionIndex++].promise);

    const requests = resolutions.map((_, index) =>
      resolveMarkdownImage({
        ...createMarkdownReferenceContext(),
        target: `./assets/icon-${index}.png`,
      }),
    );

    expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(4);

    resolutions[0].resolve({ kind: "missing", path: "C:\\Notes\\assets\\icon-0.png" });

    await expect(requests[0]).resolves.toEqual({
      kind: "missing",
      path: "C:\\Notes\\assets\\icon-0.png",
    });
    expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(5);

    for (let index = 1; index < resolutions.length; index += 1) {
      resolutions[index].resolve({
        kind: "missing",
        path: `C:\\Notes\\assets\\icon-${index}.png`,
      });
    }

    await expect(Promise.all(requests)).resolves.toEqual(
      resolutions.map((_, index) => ({
        kind: "missing",
        path: `C:\\Notes\\assets\\icon-${index}.png`,
      })),
    );
  });
});
