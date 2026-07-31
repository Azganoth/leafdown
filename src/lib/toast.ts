import { toast } from "sonner";

import type { MessageData } from "./messages";

export function notifyError(message: MessageData): void;
export function notifyError(title: string, description?: string): void;
export function notifyError(messageOrTitle: MessageData | string, description?: string) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.error, message.title, message.description);
}

export function notifySuccess(message: MessageData): void;
export function notifySuccess(title: string, description?: string): void;
export function notifySuccess(messageOrTitle: MessageData | string, description?: string) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.success, message.title, message.description);
}

export function notifyWarning(message: MessageData): void;
export function notifyWarning(title: string, description?: string): void;
export function notifyWarning(messageOrTitle: MessageData | string, description?: string) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.warning, message.title, message.description);
}

const getToastMessage = (
  messageOrTitle: MessageData | string,
  description: string | undefined,
): MessageData =>
  typeof messageOrTitle === "string" ? { title: messageOrTitle, description } : messageOrTitle;

const showToast = (
  show: (title: string, options?: { description: string }) => unknown,
  title: string,
  description: string | undefined,
) => {
  if (description === undefined) {
    show(title);
    return;
  }

  show(title, { description });
};
