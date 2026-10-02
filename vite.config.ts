import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

const mermaidFrameScript = () =>
  transformSync(
    readFileSync(
      new URL("./src/features/editor/services/mermaidFrame.ts", import.meta.url),
      "utf8",
    ),
    { loader: "ts", target: "es2022", format: "iife" },
  ).code;

const bundledMermaidFrame = (): Plugin => ({
  name: "leafdown:bundled-mermaid-frame",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const asset = request.url?.split("?", 1)[0];
      if (asset !== "/mermaid.min.js" && asset !== "/mermaid-frame.js") return next();
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(
        asset === "/mermaid.min.js"
          ? readFileSync(new URL(import.meta.resolve("mermaid/dist/mermaid.min.js")))
          : mermaidFrameScript(),
      );
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "mermaid.min.js",
      source: readFileSync(new URL(import.meta.resolve("mermaid/dist/mermaid.min.js"))),
    });
    this.emitFile({
      type: "asset",
      fileName: "mermaid-frame.js",
      source: mermaidFrameScript(),
    });
  },
});

const KATEX_STYLESHEET_PATTERN = /[\\/]katex[\\/]dist[\\/]katex(?:\.min)?\.css(?:\?|$)/u;
const KATEX_FALLBACK_FONT_PATTERN =
  /,\s*url\([^)]*\.woff\)\s*format\("woff"\),\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/gu;

// KaTeX lists woff and ttf copies after each woff2 font. Every WebView Leafdown runs in loads
// woff2, so the copies would only ship about 800 KiB of fonts that are never requested.
const katexWoff2Fonts = (): Plugin => ({
  name: "leafdown:katex-woff2-fonts",
  enforce: "pre",
  transform(code, id) {
    if (!KATEX_STYLESHEET_PATTERN.test(id)) {
      return;
    }
    const stylesheet = code.replace(KATEX_FALLBACK_FONT_PATTERN, "");
    if (/\.(?:woff|ttf)\)/u.test(stylesheet)) {
      this.error("KaTeX's font sources changed shape; update the woff2-only font transform.");
    }
    return stylesheet;
  },
});

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    katexWoff2Fonts(),
    bundledMermaidFrame(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  clearScreen: false,
  build: {
    // Inlined fonts become data URIs that `font-src 'self'` blocks, and the assets
    // ship with the app anyway.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? false : undefined),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup/common.ts", "./src/test/setup/dom.ts"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/components/ui/!(virtual-list).tsx",
      ],
      thresholds: {
        statements: 88,
        branches: 78,
        functions: 89,
        lines: 89,
      },
    },
  },
});
