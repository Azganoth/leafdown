type MermaidFrameRequest = import("./mermaidMessages").MermaidFrameRequest;
type MermaidFrameResponse = import("./mermaidMessages").MermaidFrameResponse;
type MermaidTheme = import("./mermaidMessages").MermaidTheme;
type MermaidConfig = import("mermaid").MermaidConfig;

const mermaid = (
  globalThis as typeof globalThis & { mermaid: (typeof import("mermaid"))["default"] }
).mermaid;

const baseConfig: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: false,
  maxTextSize: 10_000,
  maxEdges: 200,
  suppressErrorRendering: true,
  secure: [
    "secure",
    "securityLevel",
    "htmlLabels",
    "startOnLoad",
    "maxTextSize",
    "maxEdges",
    "suppressErrorRendering",
    "flowchart",
    "layout",
  ],
};

const THEME_COLORS = ["background", "block", "node", "border", "subtle", "text", "line"] as const;

const canvas = document.createElement("canvas");
canvas.width = 1;
canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

// Mermaid's color functions cannot parse the app's oklch tokens, so each color is painted over
// the code block's background and read back as opaque hex.
const paint = (...layers: string[]) => {
  context.clearRect(0, 0, 1, 1);
  for (const layer of layers) {
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const configure = (theme: MermaidTheme) => {
  const fontFamily = "system-ui, sans-serif";
  const valid =
    typeof theme?.dark === "boolean" &&
    THEME_COLORS.every(
      (name) =>
        typeof theme[name] === "string" &&
        theme[name].length <= 100 &&
        CSS.supports("color", theme[name]),
    );
  if (!valid) {
    mermaid.initialize({ ...baseConfig, theme: "neutral", fontFamily });
    return;
  }

  const ground = [theme.background, theme.block];
  const block = paint(...ground);
  const subtle = paint(...ground, theme.subtle);
  mermaid.initialize({
    ...baseConfig,
    theme: "base",
    look: "classic",
    darkMode: theme.dark,
    fontFamily,
    themeVariables: {
      darkMode: theme.dark,
      fontFamily,
      fontSize: "14px",
      background: block,
      primaryColor: paint(...ground, theme.node),
      primaryBorderColor: paint(...ground, theme.border),
      primaryTextColor: paint(...ground, theme.text),
      secondaryColor: subtle,
      tertiaryColor: subtle,
      lineColor: paint(...ground, theme.line),
      textColor: paint(...ground, theme.text),
      edgeLabelBackground: block,
    },
  });
};

// Mermaid writes `xlink:href` on click links without declaring the prefix, which leaves the SVG
// undecodable as an image. A width of 100% would let the image stretch a small diagram to the
// column, so it takes the diagram's own size and only scales down.
const prepareImage = (svg: string) => {
  const declared = svg.replace(
    /^<svg\b(?![^>]*\bxmlns:xlink=)/u,
    '<svg xmlns:xlink="http://www.w3.org/1999/xlink"',
  );
  const parsed = new DOMParser().parseFromString(declared, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return declared;
  const root = parsed.documentElement;
  const [, , width, height] = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/u).map(Number);
  if (!(width > 0 && height > 0)) return declared;
  root.setAttribute("width", String(Math.ceil(width)));
  root.setAttribute("height", String(Math.ceil(height)));
  root.style.removeProperty("max-width");
  return new XMLSerializer().serializeToString(root);
};

const send = (message: MermaidFrameResponse) => window.parent.postMessage(message, "*");

window.addEventListener("message", async (event: MessageEvent<MermaidFrameRequest>) => {
  if (event.source !== window.parent || event.data?.type !== "leafdown-mermaid-render") return;
  const { id, source, theme } = event.data;
  if (!Number.isSafeInteger(id) || typeof source !== "string" || source.length > 10_000) return;

  try {
    configure(theme);
    const { svg } = await mermaid.render(`leafdown-mermaid-${id}`, source);
    send({ type: "leafdown-mermaid-result", id, svg: prepareImage(svg) });
  } catch (error) {
    send({ type: "leafdown-mermaid-result", id, error: String(error) });
  }
});

mermaid.initialize(baseConfig);
send({ type: "leafdown-mermaid-ready" });
