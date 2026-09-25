import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  editorDocumentStatusesEqual,
  getEditorDocumentStatus,
  type EditorDocumentStatus,
} from "../utils/documentStatus";

export const leafdownDocumentStatusPluginKey = new PluginKey("leafdownDocumentStatus");

export const createLeafdownDocumentStatusPlugin = (
  onDocumentStatusChanged: (status: EditorDocumentStatus) => void,
) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownDocumentStatusPluginKey,
        view: (view) => {
          let status = getEditorDocumentStatus(view.state);

          return {
            update: (nextView, previousState) => {
              if (
                nextView.state.doc === previousState.doc &&
                nextView.state.selection.eq(previousState.selection)
              ) {
                return;
              }

              const nextStatus = getEditorDocumentStatus(nextView.state);

              if (editorDocumentStatusesEqual(status, nextStatus)) {
                return;
              }

              status = nextStatus;
              onDocumentStatusChanged(nextStatus);
            },
          };
        },
      }),
  );
