export interface MermaidTheme {
  dark: boolean;
  background: string;
  block: string;
  node: string;
  border: string;
  subtle: string;
  text: string;
  line: string;
}

export interface MermaidFrameRequest {
  type: "leafdown-mermaid-render";
  id: number;
  source: string;
  theme: MermaidTheme;
}

export type MermaidFrameResponse =
  | { type: "leafdown-mermaid-ready" }
  | { type: "leafdown-mermaid-result"; id: number; svg: string; error?: never }
  | { type: "leafdown-mermaid-result"; id: number; error: string; svg?: never };
