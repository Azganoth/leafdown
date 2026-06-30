import { useVirtualizer, type ScrollToOptions, type VirtualItem } from "@tanstack/react-virtual";
import { Slot } from "radix-ui";
import {
  createContext,
  useContext,
  useImperativeHandle,
  useState,
  type ComponentProps,
  type Key,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "@/lib/cn";
import { invariant } from "@/lib/errors";

import { ScrollArea } from "./ScrollArea";

interface VirtualListContextValue<T> {
  getItem: (index: number) => T;
  totalSize: number;
  virtualItems: VirtualItem[];
  isEmpty: boolean;
  isScrolling: boolean;
}

const VirtualListContext = createContext<VirtualListContextValue<unknown> | null>(null);

const useVirtualListContext = <T,>() => {
  const context = useContext(VirtualListContext);
  invariant(context, "VirtualList components must be used within VirtualList");

  return context as VirtualListContextValue<T>;
};

interface VirtualListProps<T> extends Omit<ComponentProps<typeof ScrollArea>, "viewportRef"> {
  items: T[];
  estimateHeight: number;
  getItemKey?: (item: T, index: number) => Key;
  initialViewportHeight?: number;
  overscan?: number;
  virtualListRef?: Ref<VirtualListHandle>;
}

export interface VirtualListHandle {
  scrollToIndex: (index: number, options?: ScrollToOptions) => void;
}

function VirtualList<T>({
  items,
  estimateHeight,
  getItemKey,
  initialViewportHeight = estimateHeight * 16,
  overscan = 8,
  virtualListRef,
  children,
  ...props
}: VirtualListProps<T>) {
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);

  // TanStack Virtual returns instance methods that React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => estimateHeight,
    getItemKey: (index) => getItemKey?.(items[index], index) ?? index,
    getScrollElement: () => viewportElement,
    initialRect: {
      height: initialViewportHeight,
      width: 0,
    },
    overscan,
  });

  useImperativeHandle(
    virtualListRef,
    () => ({
      scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
    }),
    [virtualizer],
  );

  const measuredVirtualItems = virtualizer.getVirtualItems();
  const virtualItems =
    measuredVirtualItems.length > 0
      ? measuredVirtualItems
      : items.map((item, index) => {
          const start = index * estimateHeight;

          return {
            end: start + estimateHeight,
            index,
            key: getItemKey?.(item, index) ?? index,
            lane: 0,
            size: estimateHeight,
            start,
          } satisfies VirtualItem;
        });

  const context: VirtualListContextValue<T> = {
    getItem: (index) => items[index],
    totalSize: virtualizer.getTotalSize(),
    virtualItems,
    isEmpty: items.length === 0,
    isScrolling: virtualizer.isScrolling,
  };

  return (
    <VirtualListContext.Provider value={context}>
      <ScrollArea viewportRef={setViewportElement} {...props}>
        {children}
      </ScrollArea>
    </VirtualListContext.Provider>
  );
}

function VirtualListContent({
  asChild = false,
  className,
  style,
  ...props
}: ComponentProps<"ul"> & {
  asChild?: boolean;
}) {
  const { isEmpty, totalSize } = useVirtualListContext();
  const Comp = asChild ? Slot.Root : "ul";

  if (isEmpty) return null;

  return (
    <Comp
      data-slot="virtual-list-content"
      className={cn("relative", className)}
      style={{ ...style, height: `${totalSize}px` }}
      {...props}
    />
  );
}

interface VirtualListItemsProps<T> {
  children: (item: T, virtualRow: VirtualItem, index: number, isScrolling: boolean) => ReactNode;
}

function VirtualListItems<T>({ children }: VirtualListItemsProps<T>) {
  const { getItem, isEmpty, isScrolling, virtualItems } = useVirtualListContext<T>();

  if (isEmpty) return null;

  return virtualItems.map((virtualRow) =>
    children(getItem(virtualRow.index), virtualRow, virtualRow.index, isScrolling),
  );
}

function VirtualListItem({
  asChild = false,
  className,
  style,
  virtualRow,
  ...props
}: ComponentProps<"li"> & {
  asChild?: boolean;
  virtualRow: VirtualItem;
}) {
  const Comp = asChild ? Slot.Root : "li";

  return (
    <Comp
      data-slot="virtual-list-item"
      className={cn("absolute top-0 left-0 w-full", className)}
      style={{
        ...style,
        contain: "layout paint style",
        transform: `translate3d(0, ${virtualRow.start}px, 0)`,
      }}
      {...props}
    />
  );
}

function VirtualListEmpty({ children }: { children: ReactNode }) {
  const { isEmpty } = useVirtualListContext();

  if (!isEmpty) return null;

  return children;
}

export { VirtualList, VirtualListContent, VirtualListEmpty, VirtualListItem, VirtualListItems };
