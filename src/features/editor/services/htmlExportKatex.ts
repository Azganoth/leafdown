import { encodeBase64 } from "@/lib/base64";

import katexStylesheet from "katex/dist/katex.min.css?inline";

const FONT_SOURCE_PATTERN = /src:([^;}]*)/gu;
const WOFF2_URL_PATTERN = /url\(\s*(["']?)([^"')]+\.woff2(?:[?#][^"')]*)?)\1\s*\)/u;

export type FontLoader = (url: string) => Promise<ArrayBuffer>;

const fetchFont: FontLoader = async (url) => {
  const response = await fetch(new URL(url, document.baseURI));

  if (!response.ok) {
    throw new Error(`KaTeX font request failed with status ${response.status}.`);
  }

  return response.arrayBuffer();
};

/**
 * KaTeX's stylesheet with each font embedded, so exported math renders without Leafdown's origin.
 * The build already leaves each face with its woff2 file alone. Returns `null` when a font cannot
 * be read.
 */
export const loadEmbeddedKatexStylesheet = async (
  loadFont: FontLoader = fetchFont,
  stylesheet: string = katexStylesheet,
) => {
  const fontUrls = new Set<string>();

  for (const [, source] of stylesheet.matchAll(FONT_SOURCE_PATTERN)) {
    const url = WOFF2_URL_PATTERN.exec(source)?.[2];

    if (url) {
      fontUrls.add(url);
    }
  }

  let fontData: Map<string, string>;

  try {
    fontData = new Map(
      await Promise.all(
        [...fontUrls].map(
          async (url) =>
            [url, `data:font/woff2;base64,${encodeBase64(await loadFont(url))}`] as const,
        ),
      ),
    );
  } catch {
    return null;
  }

  return stylesheet.replaceAll(FONT_SOURCE_PATTERN, (declaration, source: string) => {
    const url = WOFF2_URL_PATTERN.exec(source)?.[2];
    const data = url ? fontData.get(url) : undefined;

    return data ? `src:url(${data}) format("woff2")` : declaration;
  });
};
