import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/Tooltip";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
