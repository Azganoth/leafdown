// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import { EDITOR_COMMANDS, runEditorCommand } from "../commands";
import { validateFrontmatter } from "../plugins/frontmatter";
import { getDefaultClipboardPayload } from "../utils/clipboard";

const mountEditor = setupMilkdownEditorMount();

describe("frontmatter", () => {
  it.each([
    ["yaml", "---", "title: 'Garden'\ntags: [one, two]"],
    ["toml", "+++", "title = 'Garden'\ntags = ['one', 'two']"],
    ["json", ";;;", '{"title":"Garden","tags":["one","two"]}'],
  ] as const)("preserves %s authored source", async (format, delimiter, body) => {
    const source = `${delimiter}\n${body}\n${delimiter}\n\n# Heading\n`;
    const mounted = await mountEditor(source);
    expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
    expect(mounted.view.state.doc.firstChild?.attrs.format).toBe(format);
    expect(mounted.view.state.doc.firstChild?.textContent).toBe(body);
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("keeps a closed invalid body editable and reports its error", async () => {
    const mounted = await mountEditor(";;;\n{broken\n;;;\n");
    expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
    expect(mounted.view.dom.querySelector("[data-validation='invalid']")).not.toBeNull();
    expect(mounted.getMarkdown()).toBe(";;;\n{broken\n;;;\n");
  });

  it.each(["---", "+++", ";;;"])("keeps an empty %s block", async (delimiter) => {
    const source = `${delimiter}\n${delimiter}\n`;
    const mounted = await mountEditor(source);
    expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
    expect(mounted.getMarkdown()).toBe(source);
  });

  it("leaves unclosed and non-leading delimiters as ordinary markdown", async () => {
    const unclosed = await mountEditor("---\ntitle: Garden\n");
    expect(unclosed.view.state.doc.firstChild?.type.name).not.toBe("frontmatter");

    const later = await mountEditor("Text\n\n---\ntitle: Garden\n---\n");
    expect(
      later.view.state.doc.content.content.some((node) => node.type.name === "frontmatter"),
    ).toBe(false);
  });

  it("validates bodies without changing their source", () => {
    expect(validateFrontmatter("yaml", "a: [").error).toBeTruthy();
    expect(validateFrontmatter("toml", "a = [").error).toBeTruthy();
    expect(validateFrontmatter("json", "{").error).toBeTruthy();
    expect(validateFrontmatter("yaml", "").error).toBeNull();
  });

  it("preserves comments, nested values, quotes, and delimiter-like metadata content", async () => {
    const sources = [
      "---\n# comment\nname: 'A: B'\nnested:\n  values: [one, two]\ntext: '--- not a fence'\n---\n",
      "+++\n# comment\nname = 'A: B'\nvalues = ['one', 'two']\ntext = '+++ not a fence'\n+++\n",
      ';;;\n{"name":"A: B","values":["one","two"],"text":";;; not a fence"}\n;;;\n',
    ];
    for (const source of sources) {
      const mounted = await mountEditor(source);
      expect(mounted.getMarkdown()).toBe(source);
      expect(mounted.view.dom.querySelector("[data-validation='valid']")).not.toBeNull();
    }
  });

  it("edits source in the document and updates validation without normalizing it", async () => {
    const mounted = await mountEditor(";;;\n{broken\n;;;\n");
    const body = mounted.view.state.doc.firstChild!;
    mounted.view.dispatch(
      mounted.view.state.tr.replaceWith(
        1,
        1 + body.content.size,
        mounted.view.state.schema.text('{"a": 1}'),
      ),
    );

    expect(mounted.view.dom.querySelector("[data-validation='valid']")).not.toBeNull();
    expect(mounted.getMarkdown()).toBe(';;;\n{"a": 1}\n;;;\n');
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.view.state.doc.firstChild?.textContent).toBe('{"a": 1}');
  });

  it("keeps metadata edits in history and copies a selected block as Markdown", async () => {
    const mounted = await mountEditor("---\ntitle: Original\n---\n");
    const original = mounted.getMarkdown();
    mounted.view.dispatch(mounted.view.state.tr.insertText(" new", 1 + "title: Original".length));
    expect(mounted.getMarkdown()).toContain("title: Original new");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(original);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, 0)),
    );
    expect(getDefaultClipboardPayload(mounted.view)?.text).toContain("title: Original new");
    expect(getDefaultClipboardPayload(mounted.view)?.text).toContain("---");
  });

  it.each(["yaml", "toml", "json"] as const)(
    "inserts empty %s in one undoable action",
    async (format) => {
      const mounted = await mountEditor("# Existing\n");
      const commandId = `insert.frontmatter.${format}` as const;
      expect(EDITOR_COMMANDS[commandId].canRun(mounted.view.state)).toBe(true);
      expect(await runEditorCommand(mounted.editor, commandId)).toBe(true);
      expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
      expect(mounted.view.state.doc.firstChild?.attrs.format).toBe(format);
      expect(mounted.view.state.selection.from).toBe(1);
      const delimiter = { yaml: "---", toml: "+++", json: ";;;" }[format];
      expect(mounted.getMarkdown()).toBe(`${delimiter}\n${delimiter}\n\n# Existing\n`);
      expect(EDITOR_COMMANDS[commandId].canRun(mounted.view.state)).toBe(false);
      expect(await runEditorCommand(mounted.editor, commandId)).toBe(false);
      expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
      expect(mounted.view.state.doc.firstChild?.type.name).toBe("heading");
    },
  );

  it.each([false, true])(
    "recognizes a complete block pasted into an empty document with HTML=%s",
    async (withHtml) => {
      const mounted = await mountEditor("");
      const text = "+++\ntitle = 'Pasted'\n+++";
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      if (withHtml) clipboardData.setData("text/html", "<p>Other formatting</p>");
      mounted.view.pasteText(text, new ClipboardEvent("paste", { clipboardData }));
      expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
      expect(mounted.getMarkdown()).toBe("+++\ntitle = 'Pasted'\n+++\n");
    },
  );

  it.each(["yaml", "toml", "json"] as const)(
    "recognizes %s when its closing line is typed",
    async (format) => {
      const mounted = await mountEditor("");
      const { schema } = mounted.view.state;
      const delimiter = { yaml: "---", toml: "+++", json: ";;;" }[format];
      const opening =
        format === "yaml"
          ? schema.nodes.hr.create({ marker: "---" })
          : schema.nodes.paragraph.create(null, schema.text(delimiter));
      const body = schema.nodes.paragraph.create(null, schema.text("key: value"));
      mounted.view.dispatch(
        mounted.view.state.tr.replaceWith(0, mounted.view.state.doc.content.size, [opening, body]),
      );
      expect(mounted.view.state.doc.firstChild?.type.name).not.toBe("frontmatter");
      const closing =
        format === "yaml"
          ? schema.nodes.hr.create({ marker: "---" })
          : schema.nodes.paragraph.create(null, schema.text(delimiter));
      mounted.view.dispatch(
        mounted.view.state.tr.insert(mounted.view.state.doc.content.size, closing),
      );
      expect(mounted.getMarkdown()).toBe(`${delimiter}\nkey: value\n${delimiter}\n`);
      expect(mounted.view.state.doc.firstChild?.type.name).toBe("frontmatter");
      expect(mounted.view.state.doc.firstChild?.attrs.format).toBe(format);
    },
  );
});
