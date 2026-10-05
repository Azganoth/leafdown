import { create } from "zustand";

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  detail?: string;
}

export interface DecisionOptions extends ConfirmationOptions {
  /** A second way to go ahead, offered between cancelling and confirming. */
  alternateLabel: string;
}

export type Decision = "confirm" | "alternate" | "cancel";

interface ConfirmationRequest extends ConfirmationOptions {
  id: number;
  alternateLabel?: string;
  resolve: (decision: Decision) => void;
}

interface ConfirmationState {
  current: ConfirmationRequest | null;
  queued: ConfirmationRequest[];
}

let nextRequestId = 1;

export const useConfirmationStore = create<ConfirmationState>(() => ({
  current: null,
  queued: [],
}));

const enqueue = (options: ConfirmationOptions & { alternateLabel?: string }) =>
  new Promise<Decision>((resolve) => {
    const request = { ...options, id: nextRequestId++, resolve };

    useConfirmationStore.setState(({ current, queued }) =>
      current ? { queued: [...queued, request] } : { current: request },
    );
  });

export const requestConfirmation = async (options: ConfirmationOptions): Promise<boolean> =>
  (await enqueue(options)) === "confirm";

/** Asks for one of three answers; dismissing the dialog answers `cancel`. */
export const requestDecision = (options: DecisionOptions): Promise<Decision> => enqueue(options);

export const answerConfirmation = (id: number, answer: boolean | Decision) => {
  let resolve: ConfirmationRequest["resolve"] | undefined;

  useConfirmationStore.setState((state) => {
    const { current, queued } = state;
    if (current?.id !== id) {
      return state;
    }

    resolve = current.resolve;
    return { current: queued[0] ?? null, queued: queued.slice(1) };
  });

  resolve?.(answer === true ? "confirm" : answer === false ? "cancel" : answer);
};

export const cancelPendingConfirmations = () => {
  const { current, queued } = useConfirmationStore.getState();
  useConfirmationStore.setState({ current: null, queued: [] });
  current?.resolve("cancel");
  queued.forEach((request) => request.resolve("cancel"));
};
