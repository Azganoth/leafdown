import { $, $$, browser, expect } from "@wdio/globals";
import { execFile } from "node:child_process";
import { access, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, findTreeItem, openRecentPath } from "../support/ui.js";

const execFileAsync = promisify(execFile);
const WATCHER_SETTLE_MS = 1_000;

const runPowerShell = async (script: string) =>
  (
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script])
  ).stdout.trim();

const quotePowerShell = (value: string) => `'${value.replaceAll("'", "''")}'`;

// Restoring the item proves it reached the Recycle Bin and leaves the host's bin as it was. The
// bin records the long form of the folder, while a temporary directory can carry an 8.3 short
// name such as `RUNNER~1`, so the folder is resolved before comparing.
const restoreFromRecycleBin = async (originalPath: string) => {
  const { dir, name } = path.parse(originalPath);
  const deletedFrom = await realpath(dir);
  const output = await runPowerShell(`
    $bin = (New-Object -ComObject Shell.Application).Namespace(10)
    $item = $bin.Items() | Where-Object {
      $_.ExtendedProperty('System.Recycle.DeletedFrom') -eq ${quotePowerShell(deletedFrom)} -and
      [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq ${quotePowerShell(name)}
    } | Select-Object -First 1
    if ($null -eq $item) {
      'missing; same name deleted from: ' + (($bin.Items() | Where-Object {
        [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq ${quotePowerShell(name)}
      } | ForEach-Object { $_.ExtendedProperty('System.Recycle.DeletedFrom') }) -join '; ')
    } else { $item.InvokeVerb('undelete'); 'restored' }
  `);

  return output;
};

const exists = async (filePath: string) =>
  access(filePath).then(
    () => true,
    () => false,
  );

const waitForPath = (filePath: string, present: boolean) =>
  browser.waitUntil(async () => (await exists(filePath)) === present, {
    timeoutMsg: `${filePath} was expected to ${present ? "exist" : "be gone"}.`,
  });

const activeElementText = () =>
  browser.execute(() => globalThis.document.activeElement?.textContent?.trim() ?? "");

// The WebDriver pointer raises no contextmenu event for the right button, so the event the
// right-click would produce is dispatched at the same point.
const dispatchContextMenu = (element: WebdriverIO.Element, offsetFromBottom?: number) =>
  element.execute((target, bottomOffset) => {
    const { bottom, height, left, width } = target.getBoundingClientRect();

    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        cancelable: true,
        clientX: left + width / 2,
        clientY: bottomOffset === undefined ? bottom - height / 2 : bottom - bottomOffset,
      }),
    );
  }, offsetFromBottom);

const openRowMenu = async (label: string) => {
  await dispatchContextMenu(await findTreeItem(label));
  await $('[role="menu"]').waitForDisplayed();
};

const openRootMenu = async () => {
  const trigger = await $('[data-slot="context-menu-trigger"]').getElement();

  await dispatchContextMenu(trigger, 4);
  await $('[role="menu"][aria-label="Folder context actions"]').waitForDisplayed();
};

const chooseMenuItem = async (label: string) => {
  await (await findMenuItem((text) => text === label)).click();
};

const waitForNameEditor = async (inputLabel: string) => {
  const input = $(`input[aria-label="${inputLabel}"]`);

  await input.waitForDisplayed();
  await browser.waitUntil(async () => input.isFocused(), {
    timeoutMsg: `${inputLabel} did not take focus.`,
  });

  return input;
};

const typeName = async (inputLabel: string, name: string) => {
  await waitForNameEditor(inputLabel);
  await browser.keys(name);
};

// The WebDriver keyboard appends to an input's value whatever its selection, so a rename first
// checks what the editor selected, then replaces the value outright.
const replaceName = async (inputLabel: string, selectedText: string, name: string) => {
  const input = await waitForNameEditor(inputLabel);
  const selection = await input.execute((element) => {
    const field = element as HTMLInputElement;

    return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
  });

  expect(selection).toBe(selectedText);
  await input.setValue(name);
};

const treeItemNames = async () => {
  const names: string[] = [];

  for (const item of await $$('[role="treeitem"]').getElements()) {
    names.push(await item.getText());
  }

  return names;
};

describe("desktop article navigator actions", () => {
  it("creates, renames, and trashes entries through the native filesystem", async () => {
    const { folderActions } = await getDesktopE2ERunContext();
    const folder = folderActions.path;
    const notesPath = path.join(folder, "notes");
    const planPath = path.join(folder, "plan.md");
    const roadmapPath = path.join(folder, "roadmap.md");

    await openRecentPath(folder);
    await expect($('[contenteditable="true"]')).toHaveText(
      expect.stringContaining("Actions fixture marker."),
    );

    const notesRow = await findTreeItem("notes");
    await notesRow.click();
    // The WebDriver keyboard sends F10 without the held Shift, so the chord is raised on the row.
    await notesRow.execute((row) => {
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "F10",
          shiftKey: true,
        }),
      );
    });
    await $('[role="menu"][aria-label="Folder actions"]').waitForDisplayed();
    await browser.keys("Escape");
    await browser.waitUntil(async () => (await activeElementText()) === "notes", {
      timeoutMsg: "Focus did not return to the row the menu was opened on.",
    });

    await openRootMenu();
    await chooseMenuItem("New file");
    await typeName("File name", "plan");
    await browser.keys("Enter");

    await waitForPath(planPath, true);
    expect(await readFile(planPath, "utf8")).toBe("");
    await expect(await findTreeItem("plan.md")).toHaveAttribute("aria-selected", "true");

    await openRowMenu("plan.md");
    await chooseMenuItem("Rename");
    await replaceName("File name", "plan", "roadmap");
    await browser.keys("Enter");

    await waitForPath(roadmapPath, true);
    await waitForPath(planPath, false);
    await expect(await findTreeItem("roadmap.md")).toHaveAttribute("aria-selected", "true");
    await browser.waitUntil(async () => (await activeElementText()) === "roadmap.md", {
      timeoutMsg: "Focus did not move to the renamed row.",
    });

    await openRowMenu("roadmap.md");
    await chooseMenuItem("Rename");
    await replaceName("File name", "roadmap", "discarded");
    await browser.keys("Escape");
    await expect($('input[aria-label="File name"]')).not.toExist();
    expect(await exists(path.join(folder, "discarded.md"))).toBe(false);
    expect(await exists(roadmapPath)).toBe(true);

    await openRowMenu("notes");
    await chooseMenuItem("New folder");
    await typeName("Folder name", "archive");
    await browser.keys("Enter");

    await waitForPath(path.join(notesPath, "archive"), true);
    expect((await stat(path.join(notesPath, "archive"))).isDirectory()).toBe(true);
    await browser.waitUntil(async () => (await activeElementText()) === "archive", {
      timeoutMsg: "Focus did not move to the created folder row.",
    });

    await openRowMenu("roadmap.md");
    await chooseMenuItem("Delete");
    await $("aria/Move to Recycle Bin").click();

    await waitForPath(roadmapPath, false);
    await expect($('[contenteditable="true"]')).not.toExist();

    await browser.pause(WATCHER_SETTLE_MS);
    expect(await treeItemNames()).toEqual(["notes", "archive", "idea.md", "readme.md"]);

    expect(await restoreFromRecycleBin(roadmapPath)).toBe("restored");
    await waitForPath(roadmapPath, true);
  });
});
