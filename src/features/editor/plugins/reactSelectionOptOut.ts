import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

/**
 * Before every commit, React DOM saves the selection of a focused element whose `contentEditable`
 * property reads "true" by counting text offsets across every node beneath it, so each React update
 * while the editor has focus walks the whole document. The editor's selection is ProseMirror's to
 * keep, so its root reports "inherit" to that property read. The attribute, `isContentEditable`,
 * and editing are unchanged.
 */
export const createLeafdownReactSelectionOptOutPlugin = () =>
  $prose(
    () =>
      new Plugin({
        view: (view) => {
          const dom = view.dom;
          const prototype: object = Object.getPrototypeOf(dom);

          Object.defineProperty(dom, "contentEditable", {
            configurable: true,
            get: () => {
              const value: unknown = Reflect.get(prototype, "contentEditable", dom);
              return value === "true" ? "inherit" : value;
            },
            set: (value: string) => Reflect.set(prototype, "contentEditable", value, dom),
          });

          return {
            destroy: () => {
              Reflect.deleteProperty(dom, "contentEditable");
            },
          };
        },
      }),
  );
