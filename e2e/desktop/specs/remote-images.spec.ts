import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

const PLACEHOLDER_SELECTOR = ".leafdown-image-placeholder";
const LOADABLE_PLACEHOLDER_SELECTOR = `${PLACEHOLDER_SELECTOR}[data-image-resolution="remoteBlocked"]:has(button)`;

let server: Server;
let port = 0;
let connections = 0;
const requestedPaths: string[] = [];

const remoteImagesMarkdown = (host: string) =>
  [
    `![Trusted remote](https://${host}:${port}/trusted.png)`,
    "",
    `![Loopback literal](https://127.0.0.1:${port}/literal.png)`,
    "",
    `![Insecure remote](http://127.0.0.1:${port}/insecure.png)`,
    "",
    `![Protocol relative](//127.0.0.1:${port}/relative.png)`,
    "",
    "Paste target.",
    "",
  ].join("\n");

const waitForRemotePlaceholders = async () => {
  await browser.waitUntil(async () => (await $$(PLACEHOLDER_SELECTOR).length) === 4, {
    timeoutMsg: "Remote image placeholders did not render.",
  });
  await expect($$(LOADABLE_PLACEHOLDER_SELECTOR)).toBeElementsArrayOfSize(2);
};

const findPlaceholder = async (text: string) => {
  const result: { placeholder?: WebdriverIO.Element } = {};

  await browser.waitUntil(
    async () => {
      for (const placeholder of await $$(PLACEHOLDER_SELECTOR).getElements()) {
        if ((await placeholder.getText()).includes(text)) {
          result.placeholder = placeholder;
          return true;
        }
      }

      return false;
    },
    { timeoutMsg: `No image placeholder contains ${text}.` },
  );

  return result.placeholder!;
};

const reopenRemoteImages = async () => {
  const { images, remoteImages } = await getDesktopE2ERunContext();

  await openRecentPath(images.path);
  await expect($('img[alt="Visible SVG"]')).toBeDisplayed();
  await openRecentPath(remoteImages.path);
  await waitForRemotePlaceholders();
};

describe("desktop remote images", () => {
  before(async () => {
    const { remoteImages } = await getDesktopE2ERunContext();
    const [cert, key, image] = await Promise.all([
      readFile(remoteImages.certificatePath),
      readFile(remoteImages.keyPath),
      readFile(remoteImages.imagePath),
    ]);

    server = createServer({ cert, key }, (request, response) => {
      requestedPaths.push(request.url ?? "");
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(image);
    });
    server.on("connection", () => {
      connections += 1;
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;
    await writeFile(remoteImages.path, remoteImagesMarkdown(remoteImages.host));
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("makes no request when a document with remote images opens or reopens", async () => {
    const { remoteImages } = await getDesktopE2ERunContext();

    await openRecentPath(remoteImages.path);
    await waitForRemotePlaceholders();

    await findPlaceholder(`Remote image from ${remoteImages.host}:${port}.`);
    await findPlaceholder(`Remote image from 127.0.0.1:${port}.`);
    await expect($$(`${PLACEHOLDER_SELECTOR}*=Remote images are blocked.`)).toBeElementsArrayOfSize(
      2,
    );

    const violation = await browser.execute(
      (url) =>
        new Promise<string>((resolve) => {
          document.addEventListener(
            "securitypolicyviolation",
            (event) => resolve(event.effectiveDirective),
            { once: true },
          );
          new Image().src = url;
        }),
      `https://127.0.0.1:${port}/direct.png`,
    );

    expect(violation).toBe("img-src");

    await reopenRemoteImages();

    expect(connections).toBe(0);
  });

  it("fails a blocked destination without making a request", async () => {
    const literal = await findPlaceholder(`Remote image from 127.0.0.1:${port}.`);

    await literal.$("button=Load image").click();

    const failure = await findPlaceholder("Local and private network addresses are blocked.");

    await expect(failure.$("button=Retry")).toBeDisplayed();
    expect(connections).toBe(0);
  });

  it("renders an approved image through a blob URL under the CSP", async () => {
    const { remoteImages } = await getDesktopE2ERunContext();
    const trusted = await findPlaceholder(`Remote image from ${remoteImages.host}:${port}.`);

    await trusted.$("button=Load image").click();

    const image = $('img[alt="Trusted remote"]');

    await expect(image).toBeDisplayed();
    await browser.waitUntil(
      async () => (await image.execute((node) => (node as HTMLImageElement).naturalWidth)) === 32,
      { timeoutMsg: "The approved remote image did not decode." },
    );
    expect(await image.getAttribute("src")).toMatch(/^blob:/u);
    expect(requestedPaths).toEqual(["/trusted.png"]);

    await reopenRemoteImages();

    await expect($('img[alt="Trusted remote"]')).not.toBeExisting();
    expect(requestedPaths).toEqual(["/trusted.png"]);
  });

  it("makes no request for pasted remote images", async () => {
    const connectionsBeforePaste = connections;

    await $("p=Paste target.").execute(async (paragraph) => {
      const editor = paragraph.closest<HTMLElement>(".ProseMirror");
      const range = document.createRange();

      editor?.focus();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    const pastes: Record<string, string>[] = [
      {
        "text/html": `<p><img src="https://127.0.0.1:${port}/pasted-html.png" alt="Pasted HTML"></p>`,
        "text/plain": "Pasted HTML",
      },
      { "text/plain": `![Pasted Markdown](https://127.0.0.1:${port}/pasted-markdown.png)` },
    ];

    await browser.execute((payloads: Record<string, string>[]) => {
      for (const payload of payloads) {
        const clipboardData = new DataTransfer();

        for (const [type, value] of Object.entries(payload)) {
          clipboardData.setData(type, value);
        }

        document
          .querySelector(".ProseMirror")
          ?.dispatchEvent(
            new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
          );
      }
    }, pastes);

    await browser.waitUntil(async () => (await $$(LOADABLE_PLACEHOLDER_SELECTOR).length) === 3, {
      timeoutMsg: "The pasted remote image did not render a placeholder.",
    });

    expect(connections).toBe(connectionsBeforePaste);
  });
});
