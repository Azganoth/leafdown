import { parserCtx, ParserReady } from "@milkdown/kit/core";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";

import { t } from "@/lib/i18n";

import { resolveWikiLinkTarget } from "../services/markdownLinkApi";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import { getWikiCompletionFiles } from "../utils/wikiCompletion";
import { getWikiHeadings, getWikiHeadingsFromState } from "../utils/wikiHeadings";
import { parseWikiLink, WIKI_LINK_NODE_NAME } from "../utils/wikiLinkMarkdown";

export const leafdownWikiCompletionPluginKey = new PluginKey("leafdownWikiCompletion");

interface CompletionOption {
  label: string;
  source: string;
}

interface CompletionRequest {
  from: number;
  to: number;
  key: string;
  mode: "file" | "heading";
  path: string;
  query: string;
}

const getRequest = (view: EditorView): CompletionRequest | null => {
  const { selection } = view.state;
  if (
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    !selection.$cursor ||
    !selection.$cursor.parent.isTextblock
  )
    return null;
  const { $cursor } = selection;
  if ($cursor.parent.type.name === "code_block") return null;
  const before = $cursor.nodeBefore?.text ?? "";
  const match = /(?:^|[^!])\[\[([^\r\n]*)$/u.exec(before);
  if (!match) return null;
  const content = match[1];
  if (content.includes("|") || content.includes("[") || content.includes("]")) return null;
  const hash = content.indexOf("#");
  const mode = hash < 0 ? "file" : "heading";
  const path = hash < 0 ? content : content.slice(0, hash);
  const query = hash < 0 ? content : content.slice(hash + 1);
  const requestFrom = selection.from - content.length - 2;
  return {
    from: requestFrom,
    to: selection.from,
    key: `${requestFrom}:${selection.from}:${content}`,
    mode,
    path,
    query,
  };
};

const getHeadingOptions = (
  texts: readonly string[],
  path: string,
  query: string,
): CompletionOption[] => {
  const seen = new Set<string>();
  return texts.flatMap((text) => {
    if (seen.has(text) || !text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return [];
    const source = `[[${path}#${text}]]`;
    if (!parseWikiLink(source)) return [];
    seen.add(text);
    return [{ label: text, source }];
  });
};

export const createLeafdownWikiCompletionPlugin = (
  getContext: () => MarkdownLinkContext,
  getPaths: () => string[],
) =>
  $proseAsync(async (ctx) => {
    await ctx.wait(ParserReady);
    const parser = ctx.get(parserCtx);
    let handleCompletionKeyDown: ((event: KeyboardEvent) => boolean) | null = null;

    return new Plugin({
      key: leafdownWikiCompletionPluginKey,
      view: (view) => {
        const popup = document.createElement("div");
        popup.className = "leafdown-wiki-completion";
        popup.setAttribute("role", "listbox");
        popup.setAttribute("aria-label", t("editor.wikiLink.suggestions"));
        popup.hidden = true;
        document.body.append(popup);
        let activeRequest: CompletionRequest | null = null;
        let options: CompletionOption[] = [];
        let activeIndex = 0;
        let revision = 0;
        let dismissedKey: string | null = null;
        let destroyed = false;

        const apply = (option: CompletionOption) => {
          const request = activeRequest;
          if (!request || getRequest(view)?.key !== request.key) return;
          const suffix = view.state.doc.textBetween(
            request.to,
            Math.min(request.to + 2, view.state.doc.content.size),
            "",
            "",
          );
          const to = suffix === "]]" ? request.to + 2 : request.to;
          const node = view.state.schema.nodes[WIKI_LINK_NODE_NAME].create({
            source: option.source,
          });
          const transaction = view.state.tr.replaceWith(request.from, to, node);
          transaction.setSelection(
            TextSelection.near(transaction.doc.resolve(request.from + node.nodeSize), 1),
          );
          view.dispatch(transaction.scrollIntoView());
          view.focus();
          activeRequest = null;
          popup.hidden = true;
        };

        const render = () => {
          popup.replaceChildren();
          if (!activeRequest || options.length === 0) {
            popup.hidden = true;
            return;
          }
          options.slice(0, 8).forEach((option, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className =
              index === activeIndex
                ? "leafdown-wiki-completion__option is-active"
                : "leafdown-wiki-completion__option";
            button.textContent = option.label;
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(index === activeIndex));
            button.addEventListener("mousedown", (event) => event.preventDefault());
            button.addEventListener("click", () => apply(option));
            popup.append(button);
          });
          try {
            const coordinates = view.coordsAtPos(activeRequest.to);
            popup.style.left = `${coordinates.left}px`;
            popup.style.top = `${coordinates.bottom + 4}px`;
          } catch {
            popup.style.left = "0px";
            popup.style.top = "0px";
          }
          popup.hidden = false;
        };

        const update = () => {
          const request = getRequest(view);
          if (!request || request.key === dismissedKey) {
            activeRequest = null;
            options = [];
            render();
            return;
          }
          if (request.key === activeRequest?.key) return;
          activeRequest = request;
          activeIndex = 0;
          const currentRevision = ++revision;
          const context = getContext();
          if (request.mode === "file") {
            options = getWikiCompletionFiles(
              getPaths(),
              context.documentPath,
              context.folderContextPath,
              request.query,
            ).flatMap((file) => {
              const source = `[[${file.sourcePath}]]`;
              return parseWikiLink(source) ? [{ label: file.label, source }] : [];
            });
            render();
            return;
          }
          if (!request.path) {
            options = getHeadingOptions(
              getWikiHeadingsFromState(view.state).map((heading) => heading.text),
              "",
              request.query,
            );
            render();
            return;
          }
          options = [];
          render();
          void resolveWikiLinkTarget({
            allowOutsideFolder: true,
            documentPath: context.documentPath,
            folderContextPath: context.folderContextPath,
            target: request.path,
          })
            .then(async (result) => {
              if (result.kind !== "localMarkdown" || !context.onReadMarkdownPath) return [];
              const content = await context.onReadMarkdownPath(result.path);
              return getWikiHeadings(parser(content)).map((heading) => heading.text);
            })
            .then((headings) => {
              if (destroyed || currentRevision !== revision) return;
              options = getHeadingOptions(headings, request.path, request.query);
              render();
            })
            .catch(() => {
              if (currentRevision === revision) {
                options = [];
                render();
              }
            });
        };
        handleCompletionKeyDown = (event) => {
          if (!activeRequest || options.length === 0 || popup.hidden) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const count = Math.min(options.length, 8);
            activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : count - 1)) % count;
            render();
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            apply(options[activeIndex]);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            dismissedKey = activeRequest.key;
            activeRequest = null;
            popup.hidden = true;
            return true;
          }
          return false;
        };
        update();
        return {
          update,
          destroy: () => {
            destroyed = true;
            revision += 1;
            popup.remove();
            handleCompletionKeyDown = null;
          },
        };
      },
      props: {
        handleKeyDown: (_view, event) => handleCompletionKeyDown?.(event) ?? false,
      },
    });
  });
