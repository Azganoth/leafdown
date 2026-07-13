import { SerializerReady, serializerCtx } from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Serializer } from "@milkdown/kit/transformer";

import { createLogicalLinkMarkdownSerializer } from "../utils/logicalLinkMarkdown";

export const createLeafdownLogicalLinkSerializerPlugin = (): MilkdownPlugin => (ctx) => {
  let originalSerializer: Serializer | null = null;
  let logicalLinkSerializer: Serializer | null = null;

  return async () => {
    await ctx.wait(SerializerReady);

    originalSerializer = ctx.get(serializerCtx);
    logicalLinkSerializer = createLogicalLinkMarkdownSerializer(originalSerializer);
    ctx.set(serializerCtx, logicalLinkSerializer);

    return () => {
      if (originalSerializer && ctx.get(serializerCtx) === logicalLinkSerializer) {
        ctx.set(serializerCtx, originalSerializer);
      }
    };
  };
};
