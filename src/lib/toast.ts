import { Toast } from "@base-ui/react/toast";

import type { MessageData } from "./messages";

export interface ToastActionMenuItem {
  label: string;
  checked?: boolean;
  run: () => void;
}

export interface ToastActionMenu {
  label: string;
  items: readonly ToastActionMenuItem[];
}

export interface ToastData {
  actionMenu?: ToastActionMenu;
}

export const toastManager = Toast.createToastManager<ToastData>();

export function notifyError(message: MessageData): void;
export function notifyError(title: string, description?: string): void;
export function notifyError(messageOrTitle: MessageData | string, description?: string) {
  showToast("error", messageOrTitle, description);
}

/** The toast stays until dismissed or used, so it cannot time out from under its open menu. */
export const notifyErrorWithActionMenu = (message: MessageData, actionMenu: ToastActionMenu) => {
  const toastId = toastManager.add({
    data: {
      actionMenu: {
        label: actionMenu.label,
        items: actionMenu.items.map((item) => ({
          ...item,
          run: () => {
            toastManager.close(toastId);
            item.run();
          },
        })),
      },
    },
    description: message.description,
    timeout: 0,
    title: message.title,
    type: "error",
  });
};

export function notifySuccess(message: MessageData): void;
export function notifySuccess(title: string, description?: string): void;
export function notifySuccess(messageOrTitle: MessageData | string, description?: string) {
  showToast("success", messageOrTitle, description);
}

export function notifyWarning(message: MessageData): void;
export function notifyWarning(title: string, description?: string): void;
export function notifyWarning(messageOrTitle: MessageData | string, description?: string) {
  showToast("warning", messageOrTitle, description);
}

const showToast = (
  type: "error" | "success" | "warning",
  messageOrTitle: MessageData | string,
  description: string | undefined,
) => {
  const message: MessageData =
    typeof messageOrTitle === "string" ? { title: messageOrTitle, description } : messageOrTitle;

  // A per-toast timeout would override the provider default that holds toasts open in the E2E build.
  toastManager.add({
    description: message.description,
    title: message.title,
    type,
  });
};
