import type { ResolvedPos } from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";

export const isTextCaretSelection = (
  selection: Selection,
): selection is TextSelection & { $cursor: ResolvedPos } =>
  selection instanceof TextSelection && selection.$cursor !== null;

export const isCaretSelection = (state: EditorState): boolean =>
  isTextCaretSelection(state.selection);
