import { Toolbar as ToolbarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

function Toolbar({ ...props }: ComponentProps<typeof ToolbarPrimitive.Root>) {
  return <ToolbarPrimitive.Root data-slot="toolbar" {...props} />;
}

function ToolbarButton({ ...props }: ComponentProps<typeof ToolbarPrimitive.Button>) {
  return <ToolbarPrimitive.Button data-slot="toolbar-button" {...props} />;
}

export { Toolbar, ToolbarButton };
