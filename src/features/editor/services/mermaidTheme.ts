import type { MermaidTheme } from "./mermaidMessages";

let cached: { theme: MermaidTheme; key: string } | null = null;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

// The renderer frame cannot read the app's style sheet, so it receives the colors as CSS text.
export const readMermaidTheme = (codeBlock: Element) => {
  if (cached) return cached;
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => root.getPropertyValue(name).trim();
  const theme: MermaidTheme = {
    dark: document.documentElement.classList.contains("dark"),
    background: token("--background"),
    block: getComputedStyle(codeBlock).backgroundColor,
    node: token("--card"),
    border: token("--border"),
    subtle: token("--muted"),
    text: token("--foreground"),
    line: token("--muted-foreground"),
  };
  const read = { theme, key: JSON.stringify(theme) };
  // A detached element has no computed background to remember.
  if (theme.block) cached = read;
  return read;
};

export const onMermaidThemeChange = (listener: () => void) => {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      cached = null;
      for (const notify of listeners) notify();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    observer?.disconnect();
    observer = null;
    cached = null;
  };
};
