import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { TOOLTIP_DELAY, TOOLTIP_INSTANT_TIMEOUT } from "@/components/ui/tooltip";

import { isEditorChromeElement } from "../utils/editorSurface";

export const leafdownControlTooltipPluginKey = new PluginKey("leafdownControlTooltip");

const CONTROL_TOOLTIP_ATTRIBUTE = "data-leafdown-tooltip";

export interface ControlTooltipRequest {
  anchor: Element;
  label: string;
}

export interface LeafdownControlTooltipPluginOptions {
  onClose?: () => void;
  onRequest?: (request: ControlTooltipRequest) => void;
}

/** Names a control of the editor's own chrome in the tooltip its pointer or keyboard focus shows. */
export const setControlTooltip = (control: Element, label: string) => {
  control.setAttribute(CONTROL_TOOLTIP_ATTRIBUTE, label);
};

// Shared by every editor, so passing from one editor's control to another's keeps the instant phase
// the app's other tooltips follow.
const instantPhase = { open: false, endsAt: 0 };

const isInstantPhase = () => instantPhase.open || Date.now() < instantPhase.endsAt;

const matchesFocusVisible = (element: Element) => {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
};

// Node views and the gutter build their controls outside React, so one listener per editor finds
// them by attribute and hands the hovered or focused control to the editor's tooltip.
class ControlTooltipView {
  private shown: { control: Element; source: "focus" | "pointer" } | null = null;
  private pending: { control: Element; timeout: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly options: LeafdownControlTooltipPluginOptions,
  ) {
    const doc = view.dom.ownerDocument;
    doc.addEventListener("mouseover", this.handleMouseOver);
    doc.addEventListener("mouseout", this.handleMouseOut);
    doc.addEventListener("mousemove", this.handleMouseMove);
    doc.addEventListener("mousedown", this.hide, true);
    doc.addEventListener("keydown", this.handleKeyDown, true);
    doc.addEventListener("focusin", this.handleFocusIn);
    doc.addEventListener("focusout", this.handleFocusOut);
    doc.defaultView?.addEventListener("blur", this.hide);
  }

  update() {
    const control = this.shown?.control;

    if (control && (!control.isConnected || !control.hasAttribute(CONTROL_TOOLTIP_ATTRIBUTE))) {
      this.hide();
    }
  }

  destroy() {
    const doc = this.view.dom.ownerDocument;
    doc.removeEventListener("mouseover", this.handleMouseOver);
    doc.removeEventListener("mouseout", this.handleMouseOut);
    doc.removeEventListener("mousemove", this.handleMouseMove);
    doc.removeEventListener("mousedown", this.hide, true);
    doc.removeEventListener("keydown", this.handleKeyDown, true);
    doc.removeEventListener("focusin", this.handleFocusIn);
    doc.removeEventListener("focusout", this.handleFocusOut);
    doc.defaultView?.removeEventListener("blur", this.hide);
    this.hide();
  }

  private findControl(target: EventTarget | null) {
    const control =
      target instanceof Element ? target.closest(`[${CONTROL_TOOLTIP_ATTRIBUTE}]`) : null;

    return control && isEditorChromeElement(this.view, control) ? control : null;
  }

  private show(control: Element, source: "focus" | "pointer") {
    this.cancelPending();
    const label = control.getAttribute(CONTROL_TOOLTIP_ATTRIBUTE);

    if (!label || !control.isConnected) {
      this.hide();
      return;
    }

    this.shown = { control, source };
    instantPhase.open = true;
    this.options.onRequest?.({ anchor: control, label });
  }

  // Like the app's other tooltips, the first one waits for the pointer to rest on its control.
  private schedule(control: Element) {
    if (isInstantPhase()) {
      this.show(control, "pointer");
      return;
    }

    this.cancelPending();
    this.pending = {
      control,
      timeout: setTimeout(() => this.show(control, "pointer"), TOOLTIP_DELAY),
    };
  }

  private cancelPending() {
    if (this.pending) {
      clearTimeout(this.pending.timeout);
      this.pending = null;
    }
  }

  private readonly hide = () => {
    this.cancelPending();

    if (!this.shown) {
      return;
    }

    this.shown = null;
    instantPhase.open = false;
    instantPhase.endsAt = Date.now() + TOOLTIP_INSTANT_TIMEOUT;
    this.options.onClose?.();
  };

  // The pointer reaches a control only while nothing covers it, so a menu or popup over the
  // gutter keeps its tooltip closed, and a held button means a press or drag is under way.
  private readonly handleMouseOver = (event: MouseEvent) => {
    if (event.buttons !== 0) {
      this.hide();
      return;
    }

    const control = this.findControl(event.target);

    if (control) {
      if (control !== this.shown?.control && control !== this.pending?.control) {
        this.schedule(control);
      }
    } else {
      this.cancelPending();
      if (this.shown?.source === "pointer") this.hide();
    }
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    const control = this.pending?.control;

    if (control && event.buttons === 0 && this.findControl(event.target) === control) {
      this.schedule(control);
    }
  };

  private readonly handleMouseOut = (event: MouseEvent) => {
    if (event.relatedTarget !== null) {
      return;
    }

    this.cancelPending();
    if (this.shown?.source === "pointer") this.hide();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.hide();
    }
  };

  private readonly handleFocusIn = (event: FocusEvent) => {
    const control = this.findControl(event.target);

    if (control && control === event.target && matchesFocusVisible(control)) {
      this.show(control, "focus");
    }
  };

  private readonly handleFocusOut = (event: FocusEvent) => {
    if (this.shown?.source === "focus" && this.shown.control === event.target) {
      this.hide();
    }
  };
}

export const createLeafdownControlTooltipPlugin = (
  options: LeafdownControlTooltipPluginOptions = {},
) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownControlTooltipPluginKey,
        view: (view) => new ControlTooltipView(view, options),
      }),
  );
