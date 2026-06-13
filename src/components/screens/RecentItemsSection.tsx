import { Button } from "@/components/ui/Button";
import type { LucideIcon } from "lucide-react";

interface RecentItemsSectionProps {
  emptyMessage: string;
  icon: LucideIcon;
  items: string[];
  onOpenItem: (path: string) => void;
  title: string;
  titleId: string;
}

export function RecentItemsSection({
  emptyMessage,
  icon: Icon,
  items,
  onOpenItem,
  title,
  titleId,
}: RecentItemsSectionProps) {
  return (
    <section aria-labelledby={titleId} className="min-w-0 border-t border-border pt-3">
      <h3 id={titleId} className="text-sm font-medium">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((path) => (
            <li key={path} className="min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenItem(path)}
                title={path}
                className="w-full justify-start px-2"
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="min-w-0 truncate">{path}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
