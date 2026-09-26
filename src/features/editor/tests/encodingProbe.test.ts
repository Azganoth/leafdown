// @vitest-environment happy-dom

import { expect, it } from "vitest";

import { formatMarkdownForSave } from "@/features/document";
import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

it.each([
  ["﻿# Café\n\nText\n", "# Café\n\nText\n"],
  ["﻿# Café\r\n\r\nText\r\n", "# Café\n\nText\n"],
  ["﻿plain paragraph\n", "plain paragraph\n"],
  ["#\u0000 \u0000T\u0000i\u0000\n\u0000", "#� �T�i�\n�\n"],
])("encoding probe %j", async (source, expectedSave) => {
  const editor = await mountEditor(source);
  const markdown = editor.getMarkdown();
  const saved = formatMarkdownForSave(markdown, "lf", true);

  console.log(
    JSON.stringify({ source, markdown, saved, docText: editor.view.state.doc.textContent }),
  );

  expect(saved).toBe(expectedSave);
});
