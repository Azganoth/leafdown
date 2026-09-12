import {
  ParserReady,
  SerializerReady,
  parserCtx,
  remarkCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { tableSchema } from "@milkdown/kit/preset/gfm";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $viewAsync } from "@milkdown/kit/utils";

import type { SourceProjectionAdapter } from "../utils/sourceProjectionAdapters";
import { createSourceProjectionAdapters } from "../utils/sourceProjectionAdapterSet";
import { getCellSourceSpans, type TableSourceSpan } from "../utils/tableSourceMetrics";

const METRICS_CLASS_NAME = "leafdown-table-metrics";

export const createLeafdownTableViewPlugin = () =>
  $viewAsync(tableSchema.node, async (ctx) => {
    await Promise.all([ctx.wait(ParserReady), ctx.wait(SerializerReady)]);

    const adapters = createSourceProjectionAdapters({
      parser: ctx.get(parserCtx),
      remark: ctx.get(remarkCtx),
      serializer: ctx.get(serializerCtx),
    });

    return (initialNode, view, getPos) =>
      new LeafdownTableNodeView(initialNode, view, getPos, adapters);
  });

class LeafdownTableNodeView implements NodeView {
  readonly dom = document.createElement("div");
  readonly contentDOM: HTMLElement;

  private node: ProseMirrorNode;
  private readonly metrics = document.createElement("tfoot");
  private readonly cellSpans = new WeakMap<ProseMirrorNode, TableSourceSpan[]>();

  constructor(
    initialNode: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly adapters: readonly SourceProjectionAdapter[],
  ) {
    this.node = initialNode;
    this.dom.className = "tableWrapper";

    const table = this.dom.appendChild(document.createElement("table"));

    this.contentDOM = table.appendChild(document.createElement("tbody"));
    this.metrics.className = METRICS_CLASS_NAME;
    this.metrics.setAttribute("aria-hidden", "true");
    table.appendChild(this.metrics);

    this.renderMetrics();
  }

  // Without this the wrapper is torn down and rebuilt on every keystroke inside a cell, which
  // takes the scroll offset with it.
  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.renderMetrics();

    return true;
  }

  // The metrics rows are the view's own chrome rather than content, so the editor is told to leave
  // what happens inside them alone.
  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    return !this.contentDOM.contains(mutation.target);
  }

  private renderMetrics() {
    const tablePosition = this.getPos();

    if (tablePosition === undefined) {
      return;
    }

    const { doc } = this.view.state;
    const rows = document.createDocumentFragment();
    let rowPosition = tablePosition + 1;

    this.node.forEach((row) => {
      const rowElement = rows.appendChild(document.createElement("tr"));
      let cellPosition = rowPosition + 1;

      row.forEach((cell) => {
        const cellElement = rowElement.appendChild(document.createElement("td"));
        let spans = this.cellSpans.get(cell);

        if (!spans) {
          spans = getCellSourceSpans(doc, this.adapters, cellPosition, cell);
          this.cellSpans.set(cell, spans);
        }

        for (const span of spans) {
          const element = cellElement.appendChild(document.createElement("span"));

          element.className = span.className;
          element.textContent = span.text;
        }

        cellPosition += cell.nodeSize;
      });

      rowPosition += row.nodeSize;
    });

    this.metrics.replaceChildren(rows);
  }
}
