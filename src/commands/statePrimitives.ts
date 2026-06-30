export type CommandState =
  | {
      enabled: true;
      checked?: boolean;
    }
  | {
      enabled: false;
      reason: string;
    };

export const enabled = (): CommandState => ({ enabled: true });

export const checked = (value: boolean): CommandState => ({ enabled: true, checked: value });

export const disabled = (reason: string): CommandState => ({ enabled: false, reason });
