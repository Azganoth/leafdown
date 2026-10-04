import "./heading-outline.css";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type TransitionEvent,
} from "react";

import { useLocalization } from "@/lib/i18n";

import {
  getShownHeadingPosition,
  getVisibleOutlineHeadings,
  OUTLINE_DEPTHS,
  type HeadingOutlineState,
  type OutlineDepth,
  type OutlineHeading,
} from "../utils/headingOutline";
import { getOutlinePanelLayout, type OutlinePanelLayout } from "../utils/outlinePanelLayout";

interface HeadingOutlineProps {
  outline: HeadingOutlineState;
  depth: OutlineDepth;
  onDepthChange: (depth: OutlineDepth) => void;
  onNavigate: (position: number) => void;
}

const INDENT_STEP = 14;
// Over this strip along the marks, moving the pointer scrolls a long list instead of choosing.
const SCRUB_STRIP_WIDTH = 26;
const OPEN_DELAY_MS = 70;
const CLOSE_DELAY_MS = 300;
const POINTER_FOCUS_WINDOW_MS = 1000;

const getRows = (list: HTMLElement | null) =>
  list ? [...list.querySelectorAll<HTMLButtonElement>("button[data-outline-position]")] : [];

const getRowPosition = (row: HTMLElement) => Number(row.dataset.outlinePosition);

const findNearestRow = (list: HTMLElement | null, clientY: number) => {
  let nearest: HTMLButtonElement | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const row of getRows(list)) {
    const rect = row.getBoundingClientRect();
    const rowDistance = Math.abs(rect.top + rect.height / 2 - clientY);
    if (rowDistance < distance) {
      nearest = row;
      distance = rowDistance;
    }
  }
  return nearest;
};

const centerRow = (list: HTMLElement, position: number | null) => {
  const row = getRows(list).find((candidate) => getRowPosition(candidate) === position);
  list.scrollTop = row ? row.offsetTop - (list.clientHeight - row.offsetHeight) / 2 : 0;
};

export function HeadingOutline({ outline, depth, onDepthChange, onNavigate }: HeadingOutlineProps) {
  const { t } = useLocalization();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const openTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  const pointerRef = useRef<{ position: number | null; y: number }>({ position: null, y: 0 });
  const scrubOriginRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const appliedLayoutRef = useRef<{ layout: OutlinePanelLayout; settled: boolean } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pointerDownAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [layout, setLayout] = useState<OutlinePanelLayout | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const open = layout !== null;
  const visible = getVisibleOutlineHeadings(outline.headings, depth);
  const current = getShownHeadingPosition(visible, outline.activePosition);
  const tabStop = preview ?? current ?? visible[0]?.position ?? null;

  useEffect(
    () => () => {
      window.clearTimeout(openTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Rows grow as the panel opens, so the scroll is applied again once they reach full height.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (layout) {
      if (appliedLayoutRef.current?.layout !== layout) {
        appliedLayoutRef.current = { layout, settled: false };
        list.scrollTop = layout.scrollTop;
      }
      return;
    }
    appliedLayoutRef.current = null;
    centerRow(list, current);
  }, [layout, current]);

  if (visible.length === 0) return null;

  const shallowestLevel = Math.min(...visible.map((heading) => heading.level));
  const contextNames = {
    blockquote: t("editor.blockPath.blockquote"),
    bullet_list: t("editor.blockPath.unorderedList"),
    ordered_list: t("editor.blockPath.orderedList"),
    callout: t("headingOutline.callout"),
  };

  const getLocalY = (clientY: number) =>
    clientY - (rootRef.current?.getBoundingClientRect().top ?? 0);

  const openAt = (headings: OutlineHeading[], position: number | null, pointerY: number) => {
    const index = headings.findIndex((heading) => heading.position === position);
    if (index < 0 || !rootRef.current || position === null) return;
    window.clearTimeout(closeTimerRef.current);
    pointerRef.current = { position, y: pointerY };
    scrubOriginRef.current = null;
    setPreview(position);
    setLayout(
      getOutlinePanelLayout(index, headings.length, pointerY, rootRef.current.clientHeight),
    );
  };

  const close = () => {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = 0;
    scrubOriginRef.current = null;
    setLayout(null);
    setPreview(null);
    if (rootRef.current?.contains(document.activeElement)) {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  };

  const trackPointer = (clientY: number) => {
    const row = findNearestRow(listRef.current, clientY);
    pointerRef.current = { position: row ? getRowPosition(row) : null, y: getLocalY(clientY) };
  };

  const handlePointerOver = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(closeTimerRef.current);
    if (open) return;
    trackPointer(event.clientY);
    if (openTimerRef.current) return;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = 0;
      openAt(visible, pointerRef.current.position, pointerRef.current.y);
    }, OPEN_DELAY_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (!open) {
      trackPointer(event.clientY);
      return;
    }
    const list = listRef.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    if (event.clientX < bounds.right - SCRUB_STRIP_WIDTH) {
      scrubOriginRef.current = null;
      setPreview(null);
      return;
    }
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll > 0) {
      scrubOriginRef.current ??= { y: event.clientY, scrollTop: list.scrollTop };
      const origin = scrubOriginRef.current;
      list.scrollTop =
        event.clientY >= origin.y
          ? origin.scrollTop +
            ((event.clientY - origin.y) / Math.max(1, bounds.bottom - origin.y)) *
              (maxScroll - origin.scrollTop)
          : origin.scrollTop -
            ((origin.y - event.clientY) / Math.max(1, origin.y - bounds.top)) * origin.scrollTop;
    }
    const row = findNearestRow(list, event.clientY);
    if (row) setPreview(getRowPosition(row));
  };

  const handlePointerOut = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) {
      return;
    }
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = 0;
    if (open) closeTimerRef.current = window.setTimeout(close, CLOSE_DELAY_MS);
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const from = event.relatedTarget;
    if (!(from instanceof Node) || !rootRef.current?.contains(from)) {
      returnFocusRef.current = from instanceof HTMLElement ? from : null;
    }
    // A press focuses its row too, and opening there would let a tap's click choose a heading
    // the reader has not seen yet.
    const pressed = event.timeStamp - pointerDownAtRef.current < POINTER_FOCUS_WINDOW_MS;
    if (open || pressed || !(event.target instanceof HTMLElement)) return;
    const position = event.target.dataset.outlinePosition;
    if (position === undefined) return;
    const rect = event.target.getBoundingClientRect();
    openAt(visible, Number(position), getLocalY(rect.top + rect.height / 2));
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Node && rootRef.current?.contains(to)) return;
    if (!rootRef.current?.matches(":hover")) {
      returnFocusRef.current = null;
      close();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      return;
    }
    const rows = getRows(listRef.current);
    const index = rows.findIndex((row) => row === document.activeElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowDown"
        ? rows[Math.min(index + 1, rows.length - 1)]
        : event.key === "ArrowUp"
          ? rows[Math.max(index - 1, 0)]
          : event.key === "Home"
            ? rows[0]
            : event.key === "End"
              ? rows.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
    setPreview(getRowPosition(next));
  };

  const handleTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    const list = listRef.current;
    if (event.propertyName !== "height" || !list) return;
    const applied = appliedLayoutRef.current;
    if (!applied) {
      centerRow(list, current);
    } else if (!applied.settled) {
      applied.settled = true;
      list.scrollTop = applied.layout.scrollTop;
      scrubOriginRef.current = null;
    }
  };

  const changeDepth = (nextDepth: OutlineDepth) => {
    onDepthChange(nextDepth);
    const nextVisible = getVisibleOutlineHeadings(outline.headings, nextDepth);
    openAt(
      nextVisible,
      getShownHeadingPosition(nextVisible, preview ?? current),
      pointerRef.current.y,
    );
  };

  const activateRow = (row: HTMLElement) => {
    const position = getRowPosition(row);
    if (open) {
      onNavigate(position);
      return;
    }
    const rect = row.getBoundingClientRect();
    openAt(visible, position, getLocalY(rect.top + rect.height / 2));
  };

  return (
    <div
      ref={rootRef}
      className="leafdown-outline"
      data-open={open || undefined}
      data-testid="heading-outline"
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        pointerDownAtRef.current = event.timeStamp;
      }}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
      style={{ "--outline-count": visible.length } as CSSProperties}
    >
      <nav
        aria-label={t("headingOutline.title")}
        className="leafdown-outline-panel"
        onTransitionEnd={handleTransitionEnd}
        style={layout ? { top: layout.top } : undefined}
      >
        <div className="leafdown-outline-header" inert={!open}>
          <span>{t("headingOutline.heading")}</span>
          <div
            aria-label={t("headingOutline.levels")}
            className="leafdown-outline-levels"
            role="group"
          >
            {OUTLINE_DEPTHS.map((level) => (
              <button
                aria-label={t("headingOutline.showLevels", { level })}
                aria-pressed={level === depth}
                data-included={level <= depth || undefined}
                key={level}
                onClick={() => changeDepth(level)}
                type="button"
              >
                {t("headingOutline.levelOption", { level })}
              </button>
            ))}
          </div>
        </div>
        <ol ref={listRef} className="leafdown-outline-list">
          {visible.map((heading) => {
            const label = heading.text.trim() || t("headingOutline.untitled");
            const context = heading.context.map((kind) => contextNames[kind]).join(" › ");
            const rowLabel = t("headingOutline.rowLabel", { level: heading.level, label });
            return (
              <li key={heading.position}>
                <button
                  aria-current={current === heading.position ? "location" : undefined}
                  aria-label={
                    context
                      ? t("headingOutline.rowWithContext", { heading: rowLabel, context })
                      : rowLabel
                  }
                  className="leafdown-outline-row"
                  data-level={heading.level}
                  data-outline-position={heading.position}
                  data-preview={preview === heading.position || undefined}
                  onClick={(event) => activateRow(event.currentTarget)}
                  style={
                    {
                      "--outline-indent": `${(heading.level - shallowestLevel) * INDENT_STEP}px`,
                    } as CSSProperties
                  }
                  tabIndex={heading.position === tabStop ? 0 : -1}
                  title={context ? `${context} › ${label}` : label}
                  type="button"
                >
                  <span className="leafdown-outline-title">
                    <span>{label}</span>
                  </span>
                  <span aria-hidden="true" className="leafdown-outline-mark" />
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
