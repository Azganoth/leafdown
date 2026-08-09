import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";

function Toolbar({ ...props }: ToolbarPrimitive.Root.Props) {
  return <ToolbarPrimitive.Root data-slot="toolbar" {...props} />;
}

function ToolbarButton({ focusableWhenDisabled = false, ...props }: ToolbarPrimitive.Button.Props) {
  return (
    <ToolbarPrimitive.Button
      data-slot="toolbar-button"
      focusableWhenDisabled={focusableWhenDisabled}
      {...props}
    />
  );
}

export { Toolbar, ToolbarButton };
