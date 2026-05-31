import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { activateMarkdownLink, type MarkdownLinkContext } from "../utils/linkActivation";

export const leafdownLinkActivationPluginKey = new PluginKey("leafdownLinkActivation");

const defaultLinkContext: MarkdownLinkContext = {
  documentPath: null,
  folderContextPath: null,
};

const isModClick = (event: MouseEvent) => event.ctrlKey || event.metaKey;

const getClickedLinkTarget = (view: EditorView, event: MouseEvent) => {
  if (!(event.target instanceof Element) || event.button !== 0) {
    return null;
  }

  const link = event.target.closest("a[href]");

  if (!link || !view.dom.contains(link)) {
    return null;
  }

  return link.getAttribute("href")?.trim() || null;
};

export const createLeafdownLinkActivationPlugin = (
  getLinkContext: () => MarkdownLinkContext = () => defaultLinkContext,
) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownLinkActivationPluginKey,
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const target = getClickedLinkTarget(view, event);

              if (!target) {
                return false;
              }

              event.preventDefault();

              if (!isModClick(event)) {
                return false;
              }

              void activateMarkdownLink({
                ...getLinkContext(),
                target,
              });

              return true;
            },
          },
        },
      }),
  );
