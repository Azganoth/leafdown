import { FOOTNOTE_REFERENCE_NODE_NAME } from "./sourceProjectionFootnoteReferenceSyntax";

export const FOOTNOTE_REFERENCE_LABEL_ATTRIBUTE = "data-label";

const FOOTNOTE_REFERENCE_SELECTOR = `sup[data-type="${FOOTNOTE_REFERENCE_NODE_NAME}"]`;

/**
 * The rendered reference an event landed on, as the element the editor draws for the node. A
 * projected reference is source text rather than this element, so a caret already reading one is
 * left to the projection that owns it.
 */
export const getFootnoteReferenceElementAtTarget = (
  editorDom: Element,
  target: EventTarget | null,
) => {
  if (!(target instanceof Node)) {
    return null;
  }

  const element = target instanceof Element ? target : target.parentElement;
  const reference = element?.closest(FOOTNOTE_REFERENCE_SELECTOR) ?? null;

  return reference && editorDom.contains(reference) ? reference : null;
};

export const getFootnoteReferenceLabelAtTarget = (editorDom: Element, target: EventTarget | null) =>
  getFootnoteReferenceElementAtTarget(editorDom, target)?.getAttribute(
    FOOTNOTE_REFERENCE_LABEL_ATTRIBUTE,
  ) ?? null;
