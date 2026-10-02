export interface MermaidFrameRequest {
  type: "leafdown-mermaid-render";
  id: number;
  source: string;
}

export type MermaidFrameResponse =
  | { type: "leafdown-mermaid-ready" }
  | { type: "leafdown-mermaid-result"; id: number; svg: string; error?: never }
  | { type: "leafdown-mermaid-result"; id: number; error: string; svg?: never };
