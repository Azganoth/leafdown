import { toast } from "sonner";

import type { MessageData } from "./messages";

export function notifyError(message: MessageData): void;
export function notifyError(title: string, description?: unknown): void;
export function notifyError(messageOrTitle: MessageData | string, description?: unknown) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.error, message.title, message.description);
}

export function notifySuccess(message: MessageData): void;
export function notifySuccess(title: string, description?: unknown): void;
export function notifySuccess(messageOrTitle: MessageData | string, description?: unknown) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.success, message.title, message.description);
}

export function notifyWarning(message: MessageData): void;
export function notifyWarning(title: string, description?: unknown): void;
export function notifyWarning(messageOrTitle: MessageData | string, description?: unknown) {
  const message = getToastMessage(messageOrTitle, description);
  showToast(toast.warning, message.title, message.description);
}

const getToastMessage = (
  messageOrTitle: MessageData | string,
  description: unknown,
): { title: string; description?: unknown } =>
  typeof messageOrTitle === "string" ? { title: messageOrTitle, description } : messageOrTitle;

const showToast = (
  show: (title: string, options?: { description: string }) => unknown,
  title: string,
  description: unknown,
) => {
  const options = getToastOptions(description);

  if (options) {
    show(title, options);
    return;
  }

  show(title);
};

const getToastOptions = (description: unknown) => {
  if (description === undefined) {
    return undefined;
  }

  if (typeof description === "string") {
    return { description };
  }

  // Renders "[object Object]" for a non-primitive description. Deferred: choosing a
  // readable rendering is a user-facing behavior change, not a lint fix.
  // oxlint-disable-next-line typescript/no-base-to-string
  return { description: String(description) };
};
