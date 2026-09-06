import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isPrimaryModifierEvent } from "@/lib/input";

import {
  findFootnoteDefinitionByLabel,
  getFootnoteDefinitionBodyPosition,
} from "../utils/footnoteDefinitions";
import { getFootnoteReferenceLabelAtTarget } from "../utils/footnoteReferenceElements";

export const leafdownFootnoteNavigationPluginKey = new PluginKey("leafdownFootnoteNavigation");

export const jumpToFootnoteDefinitionLabel = (view: EditorView, label: string) => {
  const definition = findFootnoteDefinitionByLabel(view.state.doc, label);

  if (!definition) {
    return false;
  }

  const selection = TextSelection.near(
    view.state.doc.resolve(getFootnoteDefinitionBodyPosition(definition)),
    1,
  );

  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();

  return true;
};

// The plain click is the reference's own gesture: it places the caret and opens the source
// projection. Navigation takes the modifier instead, which is the rule a link already follows.
export const createLeafdownFootnoteNavigationPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownFootnoteNavigationPluginKey,
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              if (event.button !== 0 || !isPrimaryModifierEvent(event)) {
                return false;
              }

              const label = getFootnoteReferenceLabelAtTarget(view.dom, event.target);

              if (label === null) {
                return false;
              }

              event.preventDefault();

              return jumpToFootnoteDefinitionLabel(view, label);
            },
          },
        },
      }),
  );
