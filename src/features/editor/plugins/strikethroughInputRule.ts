import { strikethroughSchema } from "@milkdown/kit/preset/gfm";
import { markRule } from "@milkdown/kit/prose";
import { $inputRule } from "@milkdown/kit/utils";

// GFM reads a strikethrough only where the closing delimiter run matches the opening one. The
// preset's `(~{1,2})` backtracks to a one-tilde run when no two-tilde closing run exists yet.
const STRIKETHROUGH_INPUT_RULE = /(?<![\w:/~])(~{1,2})([^~].*?)(?<!~)\1$/u;

export const createLeafdownStrikethroughInputRule = () =>
  $inputRule((ctx) => markRule(STRIKETHROUGH_INPUT_RULE, strikethroughSchema.type(ctx)));
