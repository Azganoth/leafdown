import { $nodeSchema } from "@milkdown/kit/utils";

import {
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  footnoteDefinitionLabelNodeSchema,
} from "../utils/footnoteDefinitionLabel";

export const leafdownFootnoteDefinitionLabelSchema = $nodeSchema(
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  () => footnoteDefinitionLabelNodeSchema,
);
