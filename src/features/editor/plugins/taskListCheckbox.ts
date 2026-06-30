import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { toggleTaskCheckedAt } from "../utils/taskLists";

const TASK_CHECKBOX_HIT_AREA_WIDTH_PX = 24;

export const createLeafdownTaskListCheckboxPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const taskListItem = getClickedTaskListItem(event);

              if (!taskListItem) {
                return false;
              }

              const taskListItemPos = getTaskListItemPos(view, taskListItem);

              if (taskListItemPos === null) {
                return false;
              }

              event.preventDefault();
              event.stopPropagation();

              return toggleTaskCheckedAt(view, taskListItemPos);
            },
          },
        },
      }),
  );

const getClickedTaskListItem = (event: MouseEvent) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return null;
  }

  const taskListItem = target.closest("li[data-checked]");

  if (!taskListItem) {
    return null;
  }

  const rect = taskListItem.getBoundingClientRect();

  return event.clientX <= rect.left + TASK_CHECKBOX_HIT_AREA_WIDTH_PX ? taskListItem : null;
};

const getTaskListItemPos = (view: Parameters<typeof toggleTaskCheckedAt>[0], element: Element) => {
  const pos = view.posAtDOM(element, 0);
  const $pos = view.state.doc.resolve(pos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "list_item") {
      return $pos.before(depth);
    }
  }

  return null;
};
