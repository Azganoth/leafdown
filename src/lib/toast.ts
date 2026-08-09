import { Toast } from "@base-ui/react/toast";

import type { MessageData } from "./messages";

export const toastManager = Toast.createToastManager();

export function notifyError(message: MessageData): void;
export function notifyError(title: string, description?: string): void;
export function notifyError(messageOrTitle: MessageData | string, description?: string) {
  showToast("error", messageOrTitle, description);
}

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

  toastManager.add({
    description: message.description,
    title: message.title,
    type,
  });
};
