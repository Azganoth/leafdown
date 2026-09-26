/* oxlint-disable -- untyped Node measurement scripts kept as spike evidence; see README.md */
// Launches the isolated release build with WebView2 remote debugging and measures
// folder-context workloads end to end over the DevTools protocol. See README.md.
// Usage: node drive.mjs <out.jsonl> <plan>   plan = comma list of steps (see the plan loop)
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXE = fileURLToPath(
  new URL("../../src-tauri/target/release/leafdown-perf.exe", import.meta.url),
);
const APP_ID = "com.azganoth.leafdown.perf";
const PORT = 9340;
const FIXTURES = process.env.PERF_FIXTURE_ROOT ?? "L:\\fixtures";
const OUT = process.argv[2];
const PLAN = (process.argv[3] ?? "").split(",").filter(Boolean);
const SIZES = { 1000: 1000, 10000: 10000, 50000: 50000 };
const ALL = ["flat", "shallow", "deep"].flatMap((shape) =>
  Object.keys(SIZES).map((size) => `${shape}-${size}`),
);

const log = (record) => {
  console.log(JSON.stringify(record));
  appendFileSync(OUT, `${JSON.stringify(record)}\n`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const epoch = () => performance.timeOrigin + performance.now();
const fixturePath = (name) => `${FIXTURES}\\${name}`;
const articleCount = (name) => SIZES[name.split("-")[1]];

// ---------- app lifecycle ----------
const appData = path.join(process.env.APPDATA, APP_ID);
const localData = path.join(process.env.LOCALAPPDATA, APP_ID);
rmSync(appData, { recursive: true, force: true });
rmSync(localData, { recursive: true, force: true });
mkdirSync(path.join(appData, "tauri-plugin-zustand"), { recursive: true });
writeFileSync(
  path.join(appData, "tauri-plugin-zustand", "recent-items.json"),
  JSON.stringify({
    recentFiles: [],
    recentFolders: ALL.slice(0, 10).map((name) => ({ path: fixturePath(name) })),
    version: 2,
  }),
);

const app = spawn(EXE, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: "ignore",
});

let target;
for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
  await sleep(200);
  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = targets.find((candidate) => candidate.type === "page");
  } catch {}
}
if (!target) throw new Error("no CDP page target");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(data.error.message)) : resolve(data.result);
  }
};
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
};

const shutdown = async () => {
  try {
    ws.close();
  } catch {}
  app.kill();
  await sleep(1500);
};

// ---------- in-page instrumentation ----------
const HELPER = String.raw`
window.__perf ??= (() => {
  const perf = { longTasks: [], ipc: [], events: 0, eventPaths: 0, clickAt: 0, inputAt: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) perf.longTasks.push([entry.startTime, entry.duration]);
  }).observe({ type: "longtask" });
  document.addEventListener("click", () => { perf.clickAt = performance.now(); }, true);
  document.addEventListener("input", () => { perf.inputAt = performance.now(); }, true);
  document.addEventListener("keydown", () => { perf.keyAt = performance.now(); }, true);
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("http://ipc.localhost/")) return originalFetch(input, init);
    const entry = { cmd: decodeURIComponent(url.slice(21)), start: performance.now() };
    perf.ipc.push(entry);
    const response = await originalFetch(input, init);
    entry.headersAt = performance.now();
    entry.bytes = Number(response.headers.get("content-length") ?? -1);
    const json = response.json.bind(response);
    response.json = async () => {
      const value = await json();
      entry.parsedAt = performance.now();
      return value;
    };
    return response;
  };
  window.__TAURI__.event.listen("leafdown://folder-changed", (event) => {
    perf.events += 1;
    perf.eventPaths += event.payload.paths.length;
  });
  perf.nextFrame = () => new Promise((resolve) => {
    let done = false;
    requestAnimationFrame(() => setTimeout(() => { done = true; resolve({ at: performance.now(), raf: true }); }, 0));
    setTimeout(() => { if (!done) { done = true; resolve({ at: performance.now(), raf: false }); } }, 2000);
  });
  perf.waitFor = (predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const startedAt = performance.now();
    let observer;
    let timer;
    const check = () => {
      let ok = false;
      try { ok = Boolean(predicate()); } catch {}
      if (ok || performance.now() - startedAt > timeoutMs) {
        observer?.disconnect();
        clearInterval(timer);
        ok ? resolve(performance.now()) : reject(new Error("waitFor timeout"));
        return true;
      }
      return false;
    };
    if (check()) return;
    observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    timer = setInterval(check, 10);
  });
  perf.blocking = (from, to) => perf.longTasks
    .filter(([start, duration]) => start + duration > from && start < to)
    .reduce((acc, [, duration]) => ({ count: acc.count + 1, totalMs: Math.round(acc.totalMs + duration), maxMs: Math.round(Math.max(acc.maxMs, duration)) }), { count: 0, totalMs: 0, maxMs: 0 });
  perf.badgeCount = () => {
    const badge = [...document.querySelectorAll("[aria-label]")].find((element) => /^\d+ articles?$/.test(element.getAttribute("aria-label")));
    return badge ? Number(badge.getAttribute("aria-label").split(" ")[0]) : null;
  };
  perf.hasFolderTitle = (folderPath) => [...document.querySelectorAll("[title]")].some((element) => element.getAttribute("title") === folderPath && !element.matches('[role="treeitem"]'));
  perf.visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
  perf.findText = (text) => [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], button')]
    .filter((element) => perf.visible(element) && element.textContent.trim() === text).at(-1) ?? null;
  perf.center = (element) => { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; };
  perf.ipcSince = (from, cmd) => perf.ipc.filter((entry) => entry.start >= from && entry.cmd === cmd);
  perf.round = (value) => value === undefined ? null : Math.round(value);
  return perf;
})();
true`;

// ---------- input ----------
const clickAt = async ({ x, y }) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
};
const centerOfText = (text) =>
  evaluate(`(async () => {
    await __perf.waitFor(() => __perf.findText(${JSON.stringify(text)}), 10000);
    return __perf.center(__perf.findText(${JSON.stringify(text)}));
  })()`);
const clickText = async (text) => clickAt(await centerOfText(text));
const menu = async (...labels) => {
  for (const label of labels.slice(0, -1)) {
    await sleep(250);
    await clickText(label);
  }
  await sleep(300);
  return centerOfText(labels.at(-1));
};
const pressEscape = async () => {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
};

// ---------- memory ----------
const processMemory = () => {
  const script = `
    $host_ = Get-Process -Name leafdown-perf -ErrorAction SilentlyContinue | Select-Object -First 1
    $children = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${APP_ID}*' }
    $renderer = $children | Where-Object { $_.CommandLine -like '*--type=renderer*' } | ForEach-Object { Get-Process -Id $_.ProcessId } | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
    $total = ($children | ForEach-Object { (Get-Process -Id $_.ProcessId).WorkingSet64 } | Measure-Object -Sum).Sum
    [pscustomobject]@{
      hostWorkingSetMB = [math]::Round($host_.WorkingSet64 / 1MB); hostPeakMB = [math]::Round($host_.PeakWorkingSet64 / 1MB);
      rendererWorkingSetMB = [math]::Round($renderer.WorkingSet64 / 1MB); rendererPeakMB = [math]::Round($renderer.PeakWorkingSet64 / 1MB);
      webviewTotalMB = [math]::Round($total / 1MB)
    } | ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", script]).toString());
};
const heapMB = async (collect = false) => {
  if (collect) await send("HeapProfiler.collectGarbage");
  const { usedSize } = await send("Runtime.getHeapUsage");
  return Math.round(usedSize / 1048576);
};
const sampleHeapPeak = () => {
  let peak = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        peak = Math.max(peak, (await send("Runtime.getHeapUsage")).usedSize);
      } catch {}
      await sleep(25);
    }
  })();
  return async () => {
    running = false;
    await loop;
    return Math.round(peak / 1048576);
  };
};

// ---------- measurements ----------
const openFolder = async (name, { label = "open" } = {}) => {
  const folderPath = fixturePath(name);
  const expected = articleCount(name);
  const point = await menu("File", "Open recent", folderPath);
  const stopHeap = sampleHeapPeak();
  await evaluate(`__perf.mark = performance.now(); true`);
  await clickAt(point);
  const result = await evaluate(`(async () => {
    const folderPath = ${JSON.stringify(folderPath)};
    const renderedAt = await __perf.waitFor(() => __perf.hasFolderTitle(folderPath) && __perf.badgeCount() === ${expected} && document.querySelector('[role="tree"] [role="treeitem"]'), 20000).catch(() => { throw new Error("open wait failed " + JSON.stringify({ badge: __perf.badgeCount(), title: __perf.hasFolderTitle(folderPath), titles: [...document.querySelectorAll("[title]")].slice(0, 5).map((e) => e.getAttribute("title")), tree: Boolean(document.querySelector('[role="tree"]')), ipc: __perf.ipc.map((e) => e.cmd), body: document.body.innerText.slice(0, 300) })); });
    const frame = await __perf.nextFrame();
    const clickAt = __perf.clickAt;
    const open = __perf.ipcSince(__perf.mark, "open_markdown_folder").at(-1) ?? {};
    await __perf.waitFor(() => __perf.ipcSince(__perf.mark, "watch_markdown_folder").some((entry) => entry.parsedAt || entry.headersAt), 30000).catch(() => null);
    const watch = __perf.ipcSince(__perf.mark, "watch_markdown_folder").at(-1) ?? {};
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const settledTasks = __perf.longTasks.filter(([start]) => start >= clickAt);
    const lastTaskEnd = settledTasks.reduce((end, [start, duration]) => Math.max(end, start + duration), frame.at);
    return {
      clickToIpcMs: __perf.round(open.start - clickAt),
      ipcToHeadersMs: __perf.round(open.headersAt - open.start),
      bodyParseMs: __perf.round(open.parsedAt - open.headersAt),
      parsedToRenderedMs: __perf.round(renderedAt - open.parsedAt),
      renderedToFrameMs: __perf.round(frame.at - renderedAt),
      clickToUsableMs: __perf.round(frame.at - clickAt),
      clickToWatchReadyMs: __perf.round((watch.headersAt ?? NaN) - clickAt),
      clickToMainThreadIdleMs: __perf.round(lastTaskEnd - clickAt),
      rafFired: frame.raf,
      ipcBytes: open.bytes,
      blocking: __perf.blocking(clickAt, frame.at),
      rowsInDom: document.querySelectorAll('[role="treeitem"]').length,
    };
  })()`);
  const heapPeakMB = await stopHeap();
  log({
    fixture: name,
    op: label,
    ...result,
    heapPeakMB,
    heapAfterGcMB: await heapMB(true),
    ...processMemory(),
  });
};

const expandCollapse = async (name) => {
  const result = await evaluate(`(async () => {
    const row = [...document.querySelectorAll('[role="treeitem"][aria-expanded="false"]')][0] ?? [...document.querySelectorAll('[role="treeitem"][aria-expanded]')][0];
    if (!row) return { skipped: true };
    const initiallyExpanded = row.getAttribute("aria-expanded") === "true";
    const rowPath = row.getAttribute("data-navigator-path");
    const selector = '[data-navigator-path="' + CSS.escape(rowPath) + '"]';
    const measure = async (expanded) => {
      const element = document.querySelector(selector);
      const startedAt = performance.now();
      element.click();
      await __perf.waitFor(() => document.querySelector(selector)?.getAttribute("aria-expanded") === String(expanded));
      const frame = await __perf.nextFrame();
      return { ms: __perf.round(frame.at - startedAt), blocking: __perf.blocking(startedAt, frame.at) };
    };
    const first = await measure(!initiallyExpanded);
    const second = await measure(initiallyExpanded);
    return initiallyExpanded ? { collapse: first, expand: second, allExpanded: true } : { expand: first, collapse: second };
  })()`);
  log({ fixture: name, op: "expandCollapse", ...result });
};

const menuAction = async (name, op, labels, settle) => {
  const point = await menu(...labels);
  await evaluate(`__perf.mark = performance.now(); true`);
  await clickAt(point);
  const result = await evaluate(`(async () => {
    const clickAt = __perf.clickAt;
    await __perf.waitFor(${settle});
    const frame = await __perf.nextFrame();
    return { ms: __perf.round(frame.at - clickAt), rafFired: frame.raf, blocking: __perf.blocking(clickAt, frame.at),
      rowsInDom: document.querySelectorAll('[role="treeitem"]').length };
  })()`);
  log({ fixture: name, op, ...result });
};

const expandAll = async (name) => {
  await menuAction(
    name,
    "expandAll",
    ["View", "Expand all folders"],
    `() => [...document.querySelectorAll('[role="treeitem"][aria-expanded]')].every((row) => row.getAttribute("aria-expanded") === "true")`,
  );
  await expandCollapse(name);
  await menuAction(
    name,
    "collapseAll",
    ["View", "Collapse all folders"],
    `() => [...document.querySelectorAll('[role="treeitem"][aria-expanded]')].every((row) => row.getAttribute("aria-expanded") === "false")`,
  );
};

const filter = async (name) => {
  const input = await evaluate(
    `__perf.center(document.querySelector('input[aria-label="Filter articles"]'))`,
  );
  await clickAt(input);
  const keystrokes = [];
  for (const character of "meeting") {
    await evaluate(`__perf.inputAt = 0; true`);
    await send("Input.insertText", { text: character });
    keystrokes.push(
      await evaluate(`(async () => {
        const inputAt = __perf.inputAt;
        const frame = await __perf.nextFrame();
        return { ms: __perf.round(frame.at - inputAt), blockingMaxMs: __perf.blocking(inputAt, frame.at).maxMs,
          rows: document.querySelector('[role="tree"]') ? Number(document.querySelector('[role="treeitem"]')?.getAttribute("aria-setsize")) : 0 };
      })()`),
    );
  }
  const clearPoint = await evaluate(
    `__perf.center(document.querySelector('[aria-label="Clear article filter"]'))`,
  );
  await evaluate(`__perf.mark = performance.now(); true`);
  await clickAt(clearPoint);
  const clear = await evaluate(`(async () => {
    const clickAt = __perf.clickAt;
    await __perf.waitFor(() => document.querySelector('input[aria-label="Filter articles"]').value === "");
    const frame = await __perf.nextFrame();
    return { ms: __perf.round(frame.at - clickAt), blocking: __perf.blocking(clickAt, frame.at) };
  })()`);
  log({
    fixture: name,
    op: "filter",
    keystrokes: keystrokes.map((stroke, index) => ({ key: "meeting"[index], ...stroke })),
    clear,
  });
};

const sortTo = async (name, label, command) => {
  const point = await menu("View", "Sort articles by", label);
  await evaluate(`__perf.mark = performance.now(); true`);
  await clickAt(point);
  const result = await evaluate(`(async () => {
    const clickAt = __perf.clickAt;
    await __perf.waitFor(() => __perf.ipcSince(__perf.mark, "scan_markdown_folder").some((entry) => entry.parsedAt));
    const scan = __perf.ipcSince(__perf.mark, "scan_markdown_folder").at(-1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frame = await __perf.nextFrame();
    return { ms: __perf.round(frame.at - clickAt), ipcToHeadersMs: __perf.round(scan.headersAt - scan.start),
      bodyParseMs: __perf.round(scan.parsedAt - scan.headersAt), parsedToFrameMs: __perf.round(frame.at - scan.parsedAt),
      blocking: __perf.blocking(clickAt, frame.at) };
  })()`);
  log({ fixture: name, op: `sort:${command}`, ...result });
};

const pageEpochWhen = (predicate, fromMark = true) =>
  evaluate(`(async () => {
    const startedAt = performance.now();
    const at = await __perf.waitFor(${predicate});
    const frame = await __perf.nextFrame();
    return { epochFrame: performance.timeOrigin + frame.at, blocking: __perf.blocking(startedAt, frame.at) };
  })()`);

const resetCounters = () =>
  evaluate(`__perf.events = 0; __perf.eventPaths = 0; __perf.mark = performance.now(); true`);
const counters = () =>
  evaluate(`({ events: __perf.events, eventPaths: __perf.eventPaths,
    scans: __perf.ipcSince(__perf.mark, "scan_markdown_folder").length,
    scanMs: __perf.ipcSince(__perf.mark, "scan_markdown_folder").map((entry) => __perf.round((entry.parsedAt ?? entry.headersAt) - entry.start)) })`);

const watchSingle = async (name) => {
  const root = fixturePath(name);
  const expected = articleCount(name);
  const created = path.join(root, "aaa-perf-watch.md");
  const renamed = path.join(root, "aab-perf-watch.md");

  await resetCounters();
  let startedAt = epoch();
  writeFileSync(created, "# watch\n");
  let page = await pageEpochWhen(`() => __perf.badgeCount() === ${expected + 1}`);
  log({
    fixture: name,
    op: "watch:create",
    ms: Math.round(page.epochFrame - startedAt),
    blocking: page.blocking,
    ...(await counters()),
  });

  await resetCounters();
  startedAt = epoch();
  renameSync(created, renamed);
  page = await pageEpochWhen(
    `() => __perf.ipcSince(__perf.mark, "scan_markdown_folder").some((entry) => entry.parsedAt)`,
  );
  await sleep(1000);
  log({
    fixture: name,
    op: "watch:rename",
    ms: Math.round(page.epochFrame - startedAt),
    blocking: page.blocking,
    ...(await counters()),
  });

  await resetCounters();
  startedAt = epoch();
  rmSync(renamed);
  page = await pageEpochWhen(`() => __perf.badgeCount() === ${expected}`);
  log({
    fixture: name,
    op: "watch:delete",
    ms: Math.round(page.epochFrame - startedAt),
    blocking: page.blocking,
    ...(await counters()),
  });
  await sleep(1000);
};

const watchBurst = async (name, count, extension = "md") => {
  const root = fixturePath(name);
  const expected = articleCount(name);
  const dir = path.join(root, `zz-burst-${extension}-${count}`);
  await resetCounters();
  const startedAt = epoch();
  mkdirSync(dir);
  for (let index = 0; index < count; index += 1) {
    writeFileSync(path.join(dir, `burst-${index}.${extension}`), "# b\n");
  }
  const writtenAt = epoch();
  if (extension === "md") {
    const page = await pageEpochWhen(`() => __perf.badgeCount() === ${expected + count}`);
    await sleep(2000);
    log({
      fixture: name,
      op: `watch:burst${count}`,
      writeMs: Math.round(writtenAt - startedAt),
      fromFirstWriteMs: Math.round(page.epochFrame - startedAt),
      fromLastWriteMs: Math.round(page.epochFrame - writtenAt),
      blocking: page.blocking,
      ...(await counters()),
    });
  } else {
    await sleep(4000);
    log({
      fixture: name,
      op: `watch:burst${count}.${extension}`,
      writeMs: Math.round(writtenAt - startedAt),
      ...(await counters()),
    });
  }

  await resetCounters();
  const deletedFrom = epoch();
  rmSync(dir, { recursive: true, force: true });
  if (extension === "md") {
    const page = await pageEpochWhen(`() => __perf.badgeCount() === ${expected}`);
    await sleep(2000);
    log({
      fixture: name,
      op: `watch:deleteDir${count}`,
      fromDeleteMs: Math.round(page.epochFrame - deletedFrom),
      blocking: page.blocking,
      ...(await counters()),
    });
  } else {
    await sleep(3000);
  }
};

const rapidSwitch = async (names) => {
  const final = names.at(-1);
  const clicks = [];
  await evaluate(`__perf.mark = performance.now(); true`);
  for (const name of names) {
    const point = await menu("File", "Open recent", fixturePath(name));
    await clickAt(point);
    clicks.push(await evaluate(`__perf.clickAt`));
  }
  const result = await evaluate(`(async () => {
    const renderedAt = await __perf.waitFor(() => __perf.hasFolderTitle(${JSON.stringify(fixturePath(final))}) && __perf.badgeCount() === ${articleCount(final)});
    const frame = await __perf.nextFrame();
    const lastClick = ${JSON.stringify(clicks)}.at(-1);
    const opens = __perf.ipcSince(__perf.mark, "open_markdown_folder").map((entry) => ({ startMs: __perf.round(entry.start - __perf.mark), durationMs: __perf.round((entry.parsedAt ?? entry.headersAt) - entry.start) }));
    return { lastClickToUsableMs: __perf.round(frame.at - lastClick), clicksAtMs: ${JSON.stringify(clicks)}.map((at) => __perf.round(at - __perf.mark)), opens,
      blocking: __perf.blocking(${JSON.stringify(clicks)}[0], frame.at) };
  })()`);
  await sleep(8000);
  const stillFinal = await evaluate(
    `__perf.hasFolderTitle(${JSON.stringify(fixturePath(final))}) && __perf.badgeCount() === ${articleCount(final)}`,
  );
  const lateOpens = await evaluate(
    `__perf.ipcSince(__perf.mark, "open_markdown_folder").map((entry) => __perf.round((entry.parsedAt ?? entry.headersAt ?? NaN) - __perf.mark))`,
  );
  log({
    op: "rapidSwitch",
    sequence: names,
    ...result,
    stillFinalAfter8s: stillFinal,
    openCompletionsMs: lateOpens,
  });
};

const keyNavigation = async (name) => {
  const pressArrows = async (label) => {
    const samples = [];
    for (let index = 0; index < 8; index += 1) {
      await evaluate(`__perf.keyAt = 0; true`);
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "ArrowUp",
        code: "ArrowUp",
        windowsVirtualKeyCode: 38,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "ArrowUp",
        code: "ArrowUp",
        windowsVirtualKeyCode: 38,
      });
      samples.push(
        await evaluate(
          `(async () => { const keyAt = __perf.keyAt; const frame = await __perf.nextFrame(); return { ms: __perf.round(frame.at - keyAt), blockingMaxMs: __perf.blocking(keyAt, frame.at).maxMs, focused: document.activeElement?.getAttribute("data-navigator-path")?.split("\\\\").at(-1) }; })()`,
        ),
      );
    }
    log({ fixture: name, op: `keys:${label}`, samples });
  };
  const key = async (keyName, code, keyCode) => {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: keyName,
      code,
      windowsVirtualKeyCode: keyCode,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: keyName,
      code,
      windowsVirtualKeyCode: keyCode,
    });
  };
  await evaluate(`document.querySelector('[role="treeitem"]').focus(); true`);
  await key("End", "End", 35);
  await sleep(500);
  await evaluate(`__perf.keyAt = 0; true`);
  await key("Enter", "Enter", 13);
  const opened = await evaluate(
    `(async () => { const keyAt = __perf.keyAt; await __perf.waitFor(() => document.querySelector('[role="treeitem"][aria-selected="true"]'), 20000); const frame = await __perf.nextFrame(); return { ms: __perf.round(frame.at - keyAt), blocking: __perf.blocking(keyAt, frame.at) }; })()`,
  );
  log({ fixture: name, op: "openArticleFromNavigator", ...opened });
  await sleep(1500);
  await evaluate(`document.querySelector('[role="treeitem"][aria-selected="true"]').focus(); true`);
  await pressArrows("beforeReveal");
  const point = await menu("File", "Reveal in sidebar");
  await clickAt(point);
  await sleep(1500);
  await evaluate(`document.querySelector('[role="treeitem"][aria-selected="true"]').focus(); true`);
  await pressArrows("afterReveal");
};

// ---------- plan ----------
try {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const ready = await evaluate(
        `location.href.startsWith("http://tauri.localhost") && Boolean(window.__TAURI__) && document.readyState === "complete" && Boolean(document.querySelector('[role="menubar"]'))`,
      );
      if (ready) break;
    } catch (error) {
      if (attempt > 100) throw error;
    }
    await sleep(200);
  }
  await sleep(1500);
  await evaluate(HELPER);
  log({
    op: "launch",
    heapMB: await heapMB(true),
    ...processMemory(),
    viewport: await evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`),
  });

  for (const step of PLAN) {
    const [kind, name, extra] = step.split(":");
    if (kind === "open") await openFolder(name);
    else if (kind === "reopen") await openFolder(name, { label: "reopen" });
    else if (kind === "expand") await expandCollapse(name);
    else if (kind === "expandAll") await expandAll(name);
    else if (kind === "filter") await filter(name);
    else if (kind === "sort") {
      await sortTo(name, "Modified date", "modifiedDate");
      await sortTo(name, "Type", "type");
      await sortTo(name, "Name", "name");
    } else if (kind === "watch") await watchSingle(name);
    else if (kind === "burst") await watchBurst(name, Number(extra ?? 1000));
    else if (kind === "burstTxt") await watchBurst(name, Number(extra ?? 1000), "txt");
    else if (kind === "rapid") await rapidSwitch(name.split("+"));
    else if (kind === "keys") await keyNavigation(name);
    else if (kind === "dump") {
      const describe = `[...document.querySelectorAll('[role="menubar"] *, [role="menu"] *')].filter((element) => element.getAttribute("role") || element.tagName === "BUTTON").map((element) => [element.tagName, element.getAttribute("role"), element.textContent.trim().slice(0, 60), __perf.visible(element)])`;
      log({ op: "dump", before: await evaluate(describe) });
      for (const label of name.split("+")) {
        await clickText(label);
        await sleep(400);
      }
      log({ op: "dump", after: await evaluate(describe) });
    } else if (kind === "idle") {
      await sleep(Number(name));
      log({ op: "idle", heapMB: await heapMB(true), ...processMemory() });
    } else throw new Error(`unknown step ${step}`);
    await pressEscape();
    await sleep(300);
  }
} catch (error) {
  log({ op: "error", message: String(error?.stack ?? error) });
} finally {
  await shutdown();
}
