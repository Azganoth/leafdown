import { findTab, getTabDocumentKey, useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";

/** Switches to a tab and gives its editor focus, as choosing a tab or a tab shortcut does. */
export const activateDocumentTab = (tabId: string) => {
  const session = useSessionStore.getState();
  const tab = findTab(session, tabId);

  if (!tab) {
    return false;
  }

  session.activateTab(tab.id);
  documentEditorBridge.focusWhenShown(getTabDocumentKey(tab));

  return true;
};

/** Turns a preview tab into an ordinary one, so the next preview opens beside it. */
export const keepDocumentTab = (tabId: string) => {
  const session = useSessionStore.getState();

  if (!findTab(session, tabId)?.preview) {
    return false;
  }

  session.keepTab(tabId);

  return true;
};

export const keepActiveDocumentTab = () => {
  const { activeTabId } = useSessionStore.getState();

  return activeTabId ? keepDocumentTab(activeTabId) : false;
};

/** Moves through the tabs in strip order, wrapping at either end. */
export const activateAdjacentTab = (offset: 1 | -1) => {
  const { activeTabId, tabs } = useSessionStore.getState();
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  if (activeIndex === -1 || tabs.length < 2) {
    return false;
  }

  return activateDocumentTab(tabs[(activeIndex + offset + tabs.length) % tabs.length].id);
};

/** Switches to the tab at a position in the strip, counting from the end for a negative one. */
export const activateTabAt = (index: number) => {
  const { tabs } = useSessionStore.getState();
  const tab = tabs.at(index);

  return tab ? activateDocumentTab(tab.id) : false;
};
