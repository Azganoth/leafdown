import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { getSaveMenuItem } from "../support/ui.js";

const diagrams = () => $$("pre[data-mermaid-mode]");
const benchmarkCase = process.env.LEAFDOWN_MERMAID_BENCHMARK;

describe("desktop Mermaid diagrams", () => {
  let server: Server;
  let requests = 0;
  let expectedMarkdown = "";

  before(async () => {
    server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    const { mermaid } = await getDesktopE2ERunContext();
    if (benchmarkCase) {
      const source =
        benchmarkCase === "pathological"
          ? [
              "flowchart LR",
              ...Array.from({ length: 180 }, (_, index) => `  N${index} --> N${index + 1}`),
            ].join("\r\n")
          : "flowchart LR\r\n  A[Start] --> B[Finish]";
      expectedMarkdown =
        benchmarkCase === "many"
          ? Array.from(
              { length: 40 },
              (_, index) => `\`\`\`mermaid\r\nflowchart LR\r\n  A${index} --> B${index}\r\n\`\`\``,
            ).join("\r\n\r\n") + "\r\n"
          : `\`\`\`mermaid\r\n${source}\r\n\`\`\`\r\n`;
      await writeFile(mermaid.path, expectedMarkdown);
      return;
    }
    expectedMarkdown = [
      "# Mermaid",
      "",
      '~~~Mermaid title="flow"',
      "flowchart LR",
      "  A[Start] --> B[Finish]",
      `  click A "http://127.0.0.1:${port}/probe.png"`,
      "~~~",
      "",
      "```mermaid",
      "flowchart LR",
      `  R@{ img: "http://127.0.0.1:${port}/probe.png" }`,
      "```",
      "",
      "Ordinary paragraph.",
      "",
    ].join("\r\n");
    await writeFile(mermaid.path, expectedMarkdown);
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("renders an inert image in an opaque child, preserves source, and follows the caret", async () => {
    const { mermaid } = await getDesktopE2ERunContext();
    if (benchmarkCase) {
      const started = Date.now();
      await $(`//button[@title="${mermaid.path}"]`).click();
      const count = benchmarkCase === "many" ? 40 : 1;
      await browser.waitUntil(async () => (await diagrams().length) === count, {
        timeout: 10_000,
        timeoutMsg: "Benchmark diagrams were not recognized.",
      });
      await browser.waitUntil(
        async () => diagrams()[0].$("img.leafdown-code-mermaid-image").isDisplayed(),
        {
          timeout: 10_000,
          timeoutMsg: "Benchmark first diagram did not render.",
        },
      );
      const firstMs = Date.now() - started;
      if (benchmarkCase === "many") {
        const initiallyRendered = await browser.execute(
          () => document.querySelectorAll('pre[data-mermaid-mode] img[src^="blob:"]').length,
        );
        const lastStarted = Date.now();
        await browser.execute(() =>
          document.querySelectorAll("pre[data-mermaid-mode]")[39]?.scrollIntoView(),
        );
        expect(initiallyRendered).toBeLessThan(40);
        await browser.waitUntil(
          async () => diagrams()[39].$("img.leafdown-code-mermaid-image").isDisplayed(),
          {
            timeout: 10_000,
            timeoutMsg: "Benchmark last diagram did not render.",
          },
        );
        console.log(
          JSON.stringify({
            benchmarkCase,
            firstMs,
            lastMs: Date.now() - lastStarted,
            initiallyRendered,
          }),
        );
      } else {
        console.log(JSON.stringify({ benchmarkCase, firstMs }));
      }
      return;
    }
    await $(`//button[@title="${mermaid.path}"]`).click();
    await browser.waitUntil(async () => (await diagrams().length) === 2, {
      timeoutMsg: "Mermaid code blocks were not recognized.",
    });

    const first = diagrams()[0];
    const image = first.$("img.leafdown-code-mermaid-image");
    await browser.waitUntil(async () => image.isDisplayed(), {
      timeout: 30_000,
      timeoutMsg: "The Mermaid diagram did not load as an image.",
    });
    await expect(image).toHaveAttribute("alt", "Mermaid diagram");
    expect(await image.getComputedRole()).toBe("img");
    expect(await image.getComputedLabel()).toBe("Mermaid diagram");
    expect((await image.getAttribute("src"))?.startsWith("blob:")).toBe(true);
    expect(
      String(await first.$(".sr-only").getProperty("textContent")).replaceAll("\r\n", "\n"),
    ).toBe(
      `flowchart LR\n  A[Start] --> B[Finish]\n  click A "http://127.0.0.1:${(server.address() as AddressInfo).port}/probe.png"`,
    );
    await expect($("iframe[title='Diagram renderer']")).toHaveAttribute("sandbox", "allow-scripts");
    expect(
      await browser.execute(
        () => document.querySelectorAll(".leafdown-code-mermaid-panel svg").length,
      ),
    ).toBe(0);
    await expect(first.$("code")).not.toBeDisplayed();

    await browser.action("pointer").move({ origin: image }).down().up().perform();
    expect(await diagrams().length).toBe(2);
    await expect(first).toHaveAttribute("data-mermaid-mode", "source");
    await expect(first.$("code")).toBeDisplayed();
    await expect(image).toBeDisplayed();
    expect(
      await browser.execute(() => document.activeElement?.closest(".ProseMirror") !== null),
    ).toBe(true);

    await browser.execute(() => {
      const heading = document.querySelector<HTMLElement>(".ProseMirror h1")!;
      const text = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode()!;
      heading.closest<HTMLElement>(".ProseMirror")!.focus();
      window.getSelection()!.collapse(text, text.textContent!.length);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect(first).toHaveAttribute("data-mermaid-mode", "diagram");
    await expect(first.$("code")).not.toBeDisplayed();

    await browser.keys("ArrowDown");
    await expect(first).toHaveAttribute("data-mermaid-mode", "source");
    await expect(first.$("code")).toBeDisplayed();
    await browser.keys("Escape");
    await expect(first).toHaveAttribute("data-mermaid-mode", "diagram");

    const failed = diagrams()[1];
    await browser.waitUntil(
      async () => (await failed.getAttribute("data-mermaid-mode")) === "source",
      {
        timeoutMsg: "The blocked resource did not leave its source editable.",
      },
    );
    expect(await failed.$("[role='alert']").getComputedRole()).toBe("alert");

    await (await getSaveMenuItem()).click();
    expect(await readFile(mermaid.path, "utf8")).toBe(expectedMarkdown);
    await browser.pause(500);
    expect(requests).toBe(0);
  });
});
