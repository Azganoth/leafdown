import { create } from "zustand";

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  detail?: string;
}

interface ConfirmationRequest extends ConfirmationOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
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

export const requestConfirmation = (options: ConfirmationOptions): Promise<boolean> =>
  new Promise((resolve) => {
    const request = { ...options, id: nextRequestId++, resolve };

    useConfirmationStore.setState(({ current, queued }) =>
      current ? { queued: [...queued, request] } : { current: request },
    );
  });

export const answerConfirmation = (id: number, confirmed: boolean) => {
  let resolve: ConfirmationRequest["resolve"] | undefined;

  useConfirmationStore.setState((state) => {
    const { current, queued } = state;
    if (current?.id !== id) {
      return state;
    }

    resolve = current.resolve;
    return { current: queued[0] ?? null, queued: queued.slice(1) };
  });

  resolve?.(confirmed);
};

export const cancelPendingConfirmations = () => {
  const { current, queued } = useConfirmationStore.getState();
  useConfirmationStore.setState({ current: null, queued: [] });
  current?.resolve(false);
  queued.forEach((request) => request.resolve(false));
};
