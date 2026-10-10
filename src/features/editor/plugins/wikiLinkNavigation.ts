import { parserCtx, ParserReady } from "@milkdown/kit/core";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";

import { notifyOperationFailure } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { isPrimaryModifierEvent } from "@/lib/input";
import { isSamePath } from "@/lib/path";
import { notifyWarning } from "@/lib/toast";

import { resolveWikiLinkTarget } from "../services/markdownLinkApi";
import { activateMarkdownLink, type MarkdownLinkContext } from "../utils/linkActivation";
import {
  findWikiHeading,
  findWikiHeadingFromState,
  jumpToWikiHeading,
} from "../utils/wikiHeadings";
import { parseWikiLink, WIKI_LINK_NODE_NAME, type WikiLink } from "../utils/wikiLinkMarkdown";

export const leafdownWikiLinkNavigationPluginKey = new PluginKey("leafdownWikiLinkNavigation");

const getWikiLinkElement = (root: HTMLElement, target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('[data-type="wiki-link"]');
  return element && root.contains(element) ? element : null;
};

export const createLeafdownWikiLinkNavigationPlugin = (getContext: () => MarkdownLinkContext) =>
  $proseAsync(async (ctx) => {
    await ctx.wait(ParserReady);
    const parser = ctx.get(parserCtx);

    const resolve = async (view: EditorView, link: WikiLink, allowOutsideFolder = false) => {
      if (!link.path) {
        return findWikiHeadingFromState(view.state, link.heading ?? "")
          ? { kind: "sameDocument" as const }
          : { kind: "missingHeading" as const };
      }
      const context = getContext();
      const result = await resolveWikiLinkTarget({
        allowOutsideFolder,
        documentPath: context.documentPath,
        folderContextPath: context.folderContextPath,
        target: link.path,
      });
      if (result.kind === "outsideFolder" && !allowOutsideFolder) {
        return resolve(view, link, true);
      }
      if (result.kind !== "localMarkdown" || !link.heading) return result;
      if (context.documentPath && isSamePath(result.path, context.documentPath)) {
        return findWikiHeadingFromState(view.state, link.heading)
          ? { kind: "sameDocument" as const }
          : { kind: "missingHeading" as const };
      }
      if (!context.onReadMarkdownPath) return { kind: "missingHeading" as const };
      const content = await context.onReadMarkdownPath(result.path);
      return findWikiHeading(parser(content), link.heading)
        ? result
        : { kind: "missingHeading" as const };
    };

    const activate = async (view: EditorView, link: WikiLink) => {
      try {
        const result = await resolve(view, link);
        if (result.kind === "sameDocument") {
          jumpToWikiHeading(view, link.heading ?? "");
        } else if (result.kind === "localMarkdown") {
          await activateMarkdownLink({
            ...getContext(),
            target: result.path,
            heading: link.heading ?? undefined,
          });
        } else if (result.kind === "missingHeading") {
          notifyWarning(t("editor.link.missing"), link.heading ?? link.path);
        } else if (result.kind === "missing") {
          notifyWarning(t("editor.link.missing"), result.path);
        } else if (result.kind === "untitledRelative") {
          notifyWarning(t("editor.link.untitledRelative"));
        } else if (result.kind === "invalidPath") {
          notifyWarning(t("editor.link.invalidPath"), result.path);
        } else if (result.kind === "permissionDenied") {
          notifyWarning(t("editor.link.permissionDenied"), result.message || result.path);
        } else if (result.kind === "metadataFailed") {
          notifyWarning(t("editor.link.metadataFailed"), result.message || result.path);
        } else if (result.kind === "outsideFolder") {
          notifyWarning(t("editor.link.outsideFolder"), result.path);
        } else {
          notifyWarning(t("editor.link.unsupportedTarget"), link.source);
        }
      } catch (error) {
        notifyOperationFailure(t("editor.link.resolveFailed"), error, "activateWikiLink");
      }
    };

    return new Plugin({
      key: leafdownWikiLinkNavigationPluginKey,
      props: {
        handleDOMEvents: {
          // Selecting the link on mousedown would replace it with its source before click.
          mousedown: (view, event) => {
            if (
              event.button !== 0 ||
              !isPrimaryModifierEvent(event) ||
              !getWikiLinkElement(view.dom, event.target)
            ) {
              return false;
            }
            event.preventDefault();
            return true;
          },
          click: (view, event) => {
            const element = getWikiLinkElement(view.dom, event.target);
            const link = element ? parseWikiLink(element.dataset.source ?? "") : null;
            if (!element || !link) return false;
            event.preventDefault();
            if (event.button !== 0) return true;
            if (isPrimaryModifierEvent(event)) {
              void activate(view, link);
              return true;
            }
            const position = view.posAtDOM(element, 0);
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)),
            );
            view.focus();
            return true;
          },
        },
      },
      view: (view) => {
        let lastDocument = view.state.doc;
        let lastContext = "";
        let revision = 0;
        let destroyed = false;
        const resolutionCache = new Map<
          string,
          { expiresAt: number; task: ReturnType<typeof resolve> }
        >();
        const refresh = () => {
          const current = ++revision;
          const now = Date.now();
          for (const [key, cached] of resolutionCache) {
            if (cached.expiresAt <= now) resolutionCache.delete(key);
          }
          const context = getContext();
          const entries: { position: number; link: WikiLink }[] = [];
          view.state.doc.descendants((node, position) => {
            if (node.type.name !== WIKI_LINK_NODE_NAME) return true;
            const link = parseWikiLink(node.attrs.source as string);
            if (link) entries.push({ position, link });
            return false;
          });
          for (const { position, link } of entries) {
            const element = view.nodeDOM(position);
            if (!(element instanceof HTMLElement)) continue;
            element.dataset.wikiStatus = "unresolved";
            const key = `${context.documentPath ?? ""}\0${context.folderContextPath ?? ""}\0${link.source}`;
            const cached = link.path ? resolutionCache.get(key) : null;
            const task = cached?.task ?? resolve(view, link);
            if (link.path && task !== cached?.task) {
              resolutionCache.set(key, { expiresAt: now + 2_000, task });
              void task
                .then((result) => {
                  if (
                    (result.kind === "sameDocument" || result.kind === "missingHeading") &&
                    resolutionCache.get(key)?.task === task
                  ) {
                    resolutionCache.delete(key);
                  }
                })
                .catch(() => {
                  if (resolutionCache.get(key)?.task === task) resolutionCache.delete(key);
                });
            }
            void task
              .then((result) => {
                if (destroyed || revision !== current || !view.dom.contains(element)) return;
                element.dataset.wikiStatus =
                  result.kind === "localMarkdown" || result.kind === "sameDocument"
                    ? "resolved"
                    : "unresolved";
              })
              .catch(() => {
                if (!destroyed && revision === current) element.dataset.wikiStatus = "unresolved";
              });
          }
        };
        refresh();
        return {
          update: (updatedView) => {
            const { documentPath, folderContextPath } = getContext();
            const context = `${documentPath ?? ""}\0${folderContextPath ?? ""}`;
            if (updatedView.state.doc !== lastDocument || context !== lastContext) {
              lastDocument = updatedView.state.doc;
              lastContext = context;
              refresh();
            }
          },
          destroy: () => {
            destroyed = true;
            revision += 1;
            resolutionCache.clear();
          },
        };
      },
    });
  });
