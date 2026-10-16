import { useState } from "react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";

import type { ControlTooltipRequest } from "../plugins/controlTooltip";

export interface EditorControlTooltipProps {
  request: ControlTooltipRequest | null;
}

/** The tooltip of whichever editor control, such as a block handle, the pointer or focus is on. */
export function EditorControlTooltip({ request }: EditorControlTooltipProps) {
  // Kept through the closing transition, so the tooltip fades out where and as it was.
  const [shown, setShown] = useState(request);

  if (request !== null && request !== shown) {
    setShown(request);
  }

  return (
    <Tooltip open={request !== null}>
      <TooltipContent anchor={shown?.anchor} side="top">
        {shown?.label}
      </TooltipContent>
    </Tooltip>
  );
}
