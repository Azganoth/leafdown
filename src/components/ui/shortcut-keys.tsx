import type { ComponentProps } from "react";

import { presentKeyboardKeys } from "@/lib/keyboardShortcut";
import { cn } from "@/lib/utils";

interface ShortcutKeysProps extends ComponentProps<"kbd"> {
  keys: readonly string[];
  size?: "default" | "sm";
  variant?: "default" | "primary";
}

export function ShortcutKeys({
  keys,
  size = "default",
  variant = "default",
  className,
  ...props
}: ShortcutKeysProps) {
  const presentation = presentKeyboardKeys(keys);
  return (
    <kbd
      data-slot="shortcut-keys"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 align-baseline font-sans whitespace-nowrap",
        className,
      )}
      {...props}
    >
      <span className="sr-only">{presentation.map((key) => key.accessible).join("+")}</span>
      {presentation.map(({ label }, index) => (
        <kbd
          aria-hidden
          data-slot="keycap"
          className={cn(
            "inline-flex items-center justify-center rounded border font-medium",
            size === "sm"
              ? "h-4 min-w-4 px-1 text-[0.625rem]"
              : "h-5 min-w-5 px-1.5 text-[0.6875rem]",
            variant === "primary"
              ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground shadow-[0_1px_0_color-mix(in_oklab,var(--primary-foreground)_40%,transparent)]"
              : "border-border bg-muted text-foreground shadow-[0_1px_0_var(--border)]",
            "leading-none",
          )}
          key={index}
        >
          {label}
        </kbd>
      ))}
    </kbd>
  );
}
