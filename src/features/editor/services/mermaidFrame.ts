type MermaidFrameRequest = import("./mermaidMessages").MermaidFrameRequest;
type MermaidFrameResponse = import("./mermaidMessages").MermaidFrameResponse;

const mermaid = (
  globalThis as typeof globalThis & { mermaid: (typeof import("mermaid"))["default"] }
).mermaid;

mermaid.initialize({
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
});

const send = (message: MermaidFrameResponse) => window.parent.postMessage(message, "*");

window.addEventListener("message", async (event: MessageEvent<MermaidFrameRequest>) => {
  if (event.source !== window.parent || event.data?.type !== "leafdown-mermaid-render") return;
  const { id, source } = event.data;
  if (!Number.isSafeInteger(id) || typeof source !== "string" || source.length > 10_000) return;

  try {
    const { svg } = await mermaid.render(`leafdown-mermaid-${id}`, source);
    send({ type: "leafdown-mermaid-result", id, svg });
  } catch (error) {
    send({ type: "leafdown-mermaid-result", id, error: String(error) });
  }
});

send({ type: "leafdown-mermaid-ready" });
