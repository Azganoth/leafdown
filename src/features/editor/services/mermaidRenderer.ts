import type { MermaidFrameResponse, MermaidTheme } from "./mermaidMessages";

interface RenderRequest {
  id: number;
  source: string;
  theme: MermaidTheme;
  signal: AbortSignal;
  resolve: (svg: string) => void;
  reject: (error: Error) => void;
  onAbort: () => void;
}

let nextId = 0;
let frame: HTMLIFrameElement | null = null;
let ready = false;
let active: RenderRequest | null = null;
let readyTimer: number | null = null;
let renderTimer: number | null = null;
const queue: RenderRequest[] = [];

const clearTimers = () => {
  if (readyTimer !== null) window.clearTimeout(readyTimer);
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  readyTimer = null;
  renderTimer = null;
};

const finish = (request: RenderRequest, result: string | Error) => {
  request.signal.removeEventListener("abort", request.onAbort);
  if (result instanceof Error) request.reject(result);
  else request.resolve(result);
};

const startNext = () => {
  if (!ready || active || queue.length === 0 || !frame?.contentWindow) return;
  active = queue.shift()!;
  renderTimer = window.setTimeout(() => {
    const expired = active;
    active = null;
    retireFrame();
    if (expired) finish(expired, new Error("Diagram rendering took too long."));
    if (queue.length > 0) createFrame();
  }, 30_000);
  frame.contentWindow.postMessage(
    {
      type: "leafdown-mermaid-render",
      id: active.id,
      source: active.source,
      theme: active.theme,
    },
    "*",
  );
};

const createFrame = () => {
  if (frame) return;
  window.addEventListener("message", receive);
  frame = document.createElement("iframe");
  frame.title = "Diagram renderer";
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.sandbox.add("allow-scripts");
  frame.src = `${import.meta.env.BASE_URL}mermaid-renderer.html`;
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1024px";
  frame.style.height = "768px";
  frame.style.pointerEvents = "none";
  frame.style.opacity = "0";
  document.body.append(frame);
  readyTimer = window.setTimeout(() => {
    retireFrame();
    for (const request of queue.splice(0)) {
      finish(request, new Error("Diagram renderer could not start."));
    }
  }, 20_000);
};

const retireFrame = () => {
  clearTimers();
  frame?.remove();
  frame = null;
  ready = false;
  window.removeEventListener("message", receive);
};

const receive = (event: MessageEvent<MermaidFrameResponse>) => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== "null") return;
  if (event.data?.type === "leafdown-mermaid-ready") {
    ready = true;
    if (readyTimer !== null) window.clearTimeout(readyTimer);
    readyTimer = null;
    startNext();
    return;
  }
  if (event.data?.type !== "leafdown-mermaid-result" || event.data.id !== active?.id) return;
  const completed = active;
  active = null;
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  renderTimer = null;
  finish(
    completed,
    typeof event.data.svg === "string"
      ? event.data.svg
      : new Error(typeof event.data.error === "string" ? event.data.error : "Diagram failed."),
  );
  startNext();
};

export const renderMermaid = (
  source: string,
  theme: MermaidTheme,
  signal: AbortSignal,
): Promise<string> => {
  if (signal.aborted) return Promise.reject(new Error("Diagram render cancelled."));
  return new Promise((resolve, reject) => {
    const request: RenderRequest = {
      id: ++nextId,
      source,
      theme,
      signal,
      resolve,
      reject,
      onAbort: () => {
        if (active === request) {
          active = null;
          retireFrame();
          if (queue.length > 0) createFrame();
        } else {
          const index = queue.indexOf(request);
          if (index !== -1) queue.splice(index, 1);
        }
        finish(request, new Error("Diagram render cancelled."));
      },
    };
    signal.addEventListener("abort", request.onAbort, { once: true });
    queue.push(request);
    createFrame();
    startNext();
  });
};
