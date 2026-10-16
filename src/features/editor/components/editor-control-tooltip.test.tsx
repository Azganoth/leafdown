// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { render, waitFor } from "@/test/utils/react";
import { queryTooltip } from "@/test/utils/tooltip";

import { EditorControlTooltip } from "./editor-control-tooltip";

describe("EditorControlTooltip", () => {
  it("shows the requested control's label until the request is withdrawn", async () => {
    const anchor = document.body.appendChild(document.createElement("button"));
    const { rerender } = render(<EditorControlTooltip request={null} />);

    expect(queryTooltip()).toBeNull();

    rerender(<EditorControlTooltip request={{ anchor, label: "Insert block" }} />);

    await waitFor(() => expect(queryTooltip()).toHaveTextContent("Insert block"));

    rerender(<EditorControlTooltip request={null} />);

    await waitFor(() => expect(queryTooltip()).toBeNull());
    anchor.remove();
  });
});
