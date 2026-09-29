// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { redo, undo } from "../commands/editing/history";

const mountEditor = setupMilkdownEditorMount();

const accepted = [
  { dialect: "github", token: "NOTE", source: "> [!NOTE]\n> Useful **information**." },
  { dialect: "github", token: "TIP", source: "> [!TIP]\n> Useful information." },
  { dialect: "github", token: "IMPORTANT", source: "> [!IMPORTANT]\n> Useful information." },
  { dialect: "github", token: "WARNING", source: "> [!WARNING]\n> Useful information." },
  { dialect: "github", token: "CAUTION", source: "> [!CAUTION]\n> Useful information." },
  { dialect: "mkdocs", token: "note", source: "!!! note\n\n    Useful **information**." },
  { dialect: "mkdocs", token: "tip", source: '!!! tip "Custom title"\n    Useful information.' },
  { dialect: "mkdocs", token: "warning", source: "??? warning\n    Useful information." },
  { dialect: "mkdocs", token: "danger", source: '???+ danger "Expanded"\n    Useful information.' },
  { dialect: "docusaurus", token: "note", source: ":::note\n\nUseful information.\n\n:::" },
  {
    dialect: "docusaurus",
    token: "warning",
    source: ":::warning[Custom title]\nUseful information.\n:::",
  },
  { dialect: "vitepress", token: "info", source: "::: info\nUseful information.\n:::" },
  {
    dialect: "vitepress",
    token: "danger",
    source: "::: danger Custom title\nUseful information.\n:::",
  },
  {
    dialect: "vitepress",
    token: "details",
    source: "::: details Read more\nUseful information.\n:::",
  },
] as const;

describe("Callout Markdown", () => {
  it.each(accepted)("reads and writes $dialect $token", async ({ dialect, token, source }) => {
    const opened = await mountEditor(source);
    const callout = opened.view.state.doc.firstChild;

    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs).toMatchObject({ dialect, token });
    expect(callout?.textContent).toContain("Useful information.");

    const written = opened.getMarkdown();
    const reopened = await mountEditor(written);
    expect(reopened.view.state.doc.toJSON()).toEqual(opened.view.state.doc.toJSON());
    expect(written).toBe(`${source}\n`);
  });

  it.each([
    "note",
    "abstract",
    "info",
    "tip",
    "success",
    "question",
    "warning",
    "failure",
    "danger",
    "bug",
    "example",
    "quote",
  ])("accepts the MkDocs %s type without changing its token", async (token) => {
    const opened = await mountEditor(`!!! ${token}\n    Text`);
    expect(opened.view.state.doc.firstChild?.attrs.token).toBe(token);
    expect(opened.getMarkdown()).toBe(`!!! ${token}\n    Text\n`);
  });

  it.each(["note", "tip", "info", "warning", "danger"])(
    "accepts the Docusaurus %s type",
    async (token) => {
      const opened = await mountEditor(`:::${token}\nText\n:::`);
      expect(opened.view.state.doc.firstChild?.attrs).toMatchObject({
        dialect: "docusaurus",
        token,
      });
    },
  );

  it.each(["info", "tip", "warning", "danger", "details"])(
    "accepts the VitePress %s type",
    async (token) => {
      const opened = await mountEditor(`::: ${token}\nText\n:::`);
      expect(opened.view.state.doc.firstChild?.attrs).toMatchObject({
        dialect: "vitepress",
        token,
      });
    },
  );

  it("keeps Markdown source in a Docusaurus title", async () => {
    const source = ":::note[Read [the guide](guide.md) **first**]\nText\n:::";
    const opened = await mountEditor(source);
    expect(opened.view.state.doc.firstChild?.attrs.title).toBe(
      "Read [the guide](guide.md) **first**",
    );
    expect(opened.getMarkdown()).toBe(`${source}\n`);
  });

  it("does not close a colon callout on a marker inside fenced code", async () => {
    const source = "::: warning\n```md\n::: tip\n::: \n```\nAfter code\n:::";
    const opened = await mountEditor(source);
    expect(opened.view.state.doc.firstChild?.type.name).toBe("callout");
    expect(opened.view.state.doc.firstChild?.child(0).type.name).toBe("code_block");
    expect(opened.view.state.doc.firstChild?.textContent).toContain("After code");
    expect(opened.getMarkdown()).toBe(`${source}\n`);
  });

  it("keeps nested colon fences separate when the outer fence is longer", async () => {
    const source = ":::: info Outer\nParent\n\n:::tip[Inner]\nChild\n:::\n::::";
    const opened = await mountEditor(source);
    const outer = opened.view.state.doc.firstChild!;
    expect(outer.attrs).toMatchObject({ dialect: "vitepress", marker: "::::" });
    expect(outer.child(1).type.name).toBe("callout");
    expect(outer.child(1).attrs).toMatchObject({ dialect: "docusaurus", marker: ":::" });
    expect((await mountEditor(opened.getMarkdown())).view.state.doc.toJSON()).toEqual(
      opened.view.state.doc.toJSON(),
    );
  });

  it("keeps nested Markdown editable through an edit, undo, redo, and reopen", async () => {
    const source =
      ":::warning[Keep this title]\nA [link](target.md) and **strong** text.\n\n- first\n- second\n\n```js\nconst value = 1;\n```\n:::";
    const opened = await mountEditor(source);
    const callout = opened.view.state.doc.firstChild!;
    const names: string[] = [];
    callout.descendants((node) => {
      names.push(node.type.name);
    });
    expect(names).toContain("bullet_list");
    expect(names).toContain("code_block");

    setTextSelection(opened.view, getEditorTextPosition(opened, "strong") + 6);
    typeText(opened.view, "er");
    expect(opened.getMarkdown()).toContain("**stronger**");
    expect(undo(opened.view)).toBe(true);
    expect(opened.getMarkdown()).toContain("**strong**");
    expect(redo(opened.view)).toBe(true);

    const written = opened.getMarkdown();
    const reopened = await mountEditor(written);
    expect(reopened.view.state.doc.toJSON()).toEqual(opened.view.state.doc.toJSON());
    expect(written).toContain(":::warning[Keep this title]");
  });

  it.each([
    { partial: "!!! no", completion: "te", dialect: "mkdocs" },
    { partial: ":::warni", completion: "ng", dialect: "docusaurus" },
    { partial: "::: warni", completion: "ng", dialect: "vitepress" },
    { partial: "> [!NO", completion: "TE]", dialect: "github" },
  ])(
    "turns a typed $dialect marker into an editable container",
    async ({ partial, completion, dialect }) => {
      const opened = await mountEditor(partial);
      setSelectionAtDocumentEnd(opened.view);
      typeText(opened.view, completion);
      expect(runKeyDownHandlers(opened.view, "Enter").handled).toBe(true);
      expect(opened.view.state.doc.firstChild?.type.name).toBe("callout");
      typeText(opened.view, "Body");
      expect(opened.view.state.doc.firstChild?.textContent).toBe("Body");
      expect(opened.view.state.doc.firstChild?.attrs.dialect).toBe(dialect);
    },
  );

  it.each([
    "> [!UNKNOWN]\n> Text",
    ':::note{title="Garden"}\nText\n:::',
    ":::custom\nText\n:::",
    "::: tip {no-title}\nText\n:::",
    ":::: warning\nText\n:::",
    "```md\n::: warning\nText\n::: \n```",
    "::: note without a close",
  ])(
    "leaves unsupported or ambiguous source with its existing Markdown meaning: %j",
    async (source) => {
      const opened = await mountEditor(source);
      let callouts = 0;
      opened.view.state.doc.descendants((node) => {
        if (node.type.name === "callout") callouts += 1;
      });
      expect(callouts).toBe(0);
    },
  );

  it("keeps separate callouts and their dialects", async () => {
    const source = "> [!NOTE]\n> One\n\n!!! tip\n    Two\n\n:::warning\nThree\n:::";
    const opened = await mountEditor(source);
    expect(
      Array.from({ length: opened.view.state.doc.childCount }, (_, index) =>
        String(opened.view.state.doc.child(index).attrs.dialect),
      ),
    ).toEqual(["github", "mkdocs", "docusaurus"]);
    expect((await mountEditor(opened.getMarkdown())).view.state.doc.toJSON()).toEqual(
      opened.view.state.doc.toJSON(),
    );
  });

  it("separates adjacent colon callouts without a blank line", async () => {
    const source = ":::note\nOne\n:::\n::: warning\nTwo\n:::\nAfter";
    const opened = await mountEditor(source);
    expect(opened.view.state.doc.childCount).toBe(3);
    expect(opened.view.state.doc.child(0).attrs.dialect).toBe("docusaurus");
    expect(opened.view.state.doc.child(1).attrs.dialect).toBe("vitepress");
    expect(opened.view.state.doc.child(2).textContent).toBe("After");
    expect((await mountEditor(opened.getMarkdown())).view.state.doc.toJSON()).toEqual(
      opened.view.state.doc.toJSON(),
    );
  });

  it.each([
    { marker: "???", expanded: false },
    { marker: "???+", expanded: true },
  ])(
    "lets a MkDocs $marker callout open for editing without changing its authored marker",
    async ({ marker, expanded }) => {
      const opened = await mountEditor(`${marker} note "Garden"\n    Content`);
      const toggle = opened.view.dom.querySelector<HTMLButtonElement>(".leafdown-callout-toggle")!;
      const body = opened.view.dom.querySelector<HTMLDivElement>(".leafdown-callout-body")!;

      expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
      expect(body.hidden).toBe(!expanded);
      toggle.click();
      expect(body.hidden).toBe(expanded);
      expect(opened.getMarkdown()).toContain(`${marker} note "Garden"`);
    },
  );

  it("edits a custom title in its authored dialect", async () => {
    const opened = await mountEditor("::: warning Existing\nContent\n:::");
    const title = opened.view.dom.querySelector<HTMLInputElement>(".leafdown-callout-title")!;
    title.value = "Revised";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    expect(opened.getMarkdown()).toContain("::: warning Revised");
    expect((await mountEditor(opened.getMarkdown())).view.state.doc.firstChild?.attrs.title).toBe(
      "Revised",
    );
  });

  it("parses a pasted callout through the Markdown clipboard path", async () => {
    const opened = await mountEditor("");
    const source = ":::tip[Paste]\nPasted [link](target.md).\n:::";
    const { event } = dispatchClipboardEvent(opened.view.dom, "paste", { "text/plain": source });
    expect(event.defaultPrevented).toBe(true);
    expect(opened.view.state.doc.firstChild?.type.name).toBe("callout");
    expect(opened.getMarkdown()).toContain(":::tip[Paste]");
  });
});
