import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

interface CodeLineNumbersPluginState {
  enabled: boolean;
  decorations: DecorationSet;
}

export const leafdownCodeLineNumbersPluginKey = new PluginKey<CodeLineNumbersPluginState>(
  "leafdownCodeLineNumbers",
);

// Reserving two digits keeps code from shifting as a short block grows past its ninth line.
const MINIMUM_GUTTER_DIGITS = 2;

// Numbers are generated content rather than widgets. A widget between two characters is a stop
// the browser's caret motion lands on, so a line start would swallow one arrow press. The block
// draws the first number, and each line ending draws the number of the line it opens, which
// reaches an empty last line that holds no character of its own.
const addCodeBlockDecorations = (
  node: ProseMirrorNode,
  position: number,
  decorations: Decoration[],
) => {
  const contentStart = position + 1;
  // A code block holds unmarked text only, so its string offsets are document offsets.
  const text = node.textContent;
  let lineNumber = 1;

  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lineNumber += 1;
    decorations.push(
      Decoration.inline(contentStart + index, contentStart + index + 1, {
        class: "leafdown-code-line-break",
        "data-next-line-number": String(lineNumber),
      }),
    );
  }

  decorations.push(
    Decoration.node(position, position + node.nodeSize, {
      class: "leafdown-code-block--numbered",
      style: `--leafdown-code-line-number-digits: ${Math.max(MINIMUM_GUTTER_DIGITS, String(lineNumber).length)}`,
    }),
  );
};

const createLineNumberDecorations = (doc: ProseMirrorNode) => {
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (node.type.name === "code_block") {
      addCodeBlockDecorations(node, position, decorations);
    }

    return !node.isTextblock;
  });

  return DecorationSet.create(doc, decorations);
};

const createPluginState = (enabled: boolean, doc: ProseMirrorNode) => ({
  enabled,
  decorations: enabled ? createLineNumberDecorations(doc) : DecorationSet.empty,
});

const applyPluginState = (
  transaction: Transaction,
  pluginState: CodeLineNumbersPluginState,
): CodeLineNumbersPluginState => {
  const requested = transaction.getMeta(leafdownCodeLineNumbersPluginKey) as boolean | undefined;
  const enabled = requested ?? pluginState.enabled;

  if (enabled === pluginState.enabled && !(enabled && transaction.docChanged)) {
    return pluginState;
  }

  return createPluginState(enabled, transaction.doc);
};

export const areCodeLineNumbersEnabled = (state: EditorState) =>
  leafdownCodeLineNumbersPluginKey.getState(state)?.enabled ?? false;

// The setting reaches an open document as a transaction that changes no content, so it neither
// dirties the document nor enters its history.
export const setCodeLineNumbersEnabled = (view: EditorView, enabled: boolean) => {
  if (areCodeLineNumbersEnabled(view.state) === enabled) {
    return;
  }

  view.dispatch(
    view.state.tr.setMeta(leafdownCodeLineNumbersPluginKey, enabled).setMeta("addToHistory", false),
  );
};

export const createLeafdownCodeLineNumbersPlugin = (isEnabled: () => boolean) =>
  $prose(
    () =>
      new Plugin<CodeLineNumbersPluginState>({
        key: leafdownCodeLineNumbersPluginKey,
        state: {
          init: (_config, state) => createPluginState(isEnabled(), state.doc),
          apply: applyPluginState,
        },
        props: {
          decorations: (state) => leafdownCodeLineNumbersPluginKey.getState(state)?.decorations,
        },
      }),
  );
