const NO_BROWSER_CLIENT_MESSAGE =
  "NO_BROWSER_CLIENT: 請安裝/啟用 Codex Browser plugin 及 Chrome plugin";

export const STOP_SIGNALS = Object.freeze({
  NO_BROWSER_CLIENT: "NO_BROWSER_CLIENT",
  NO_CHROME_EXTENSION_BACKEND: "NO_CHROME_EXTENSION_BACKEND",
  NO_PODZI_TAB: "NO_PODZI_TAB",
  NO_CHROME_EXTENSION_PIPE: "NO_CHROME_EXTENSION_PIPE",
  PODZI_CLI_NOT_READY: "PODZI_CLI_NOT_READY",
  NO_VISIBLE_TRANSCRIPT: "NO_VISIBLE_TRANSCRIPT",
});

export async function preparePodziCli() {
  return await runPodziFlow({ executeTool: false });
}

export async function runPodziCliTool(toolName, ...toolArgs) {
  if (!toolName || typeof toolName !== "string") {
    return stop("Fetch Podzi CLI Tool", "PODZI_ERROR: missing tool name");
  }

  return await runPodziFlow({ executeTool: true, toolName, toolArgs });
}

async function runPodziFlow({ executeTool, toolName, toolArgs = [] }) {
  const globals = globalThis;
  const repl = globals.nodeRepl;
  let step = "Setup Browser Client";
  let browser;
  let claimed = false;
  let tabInfo;

  try {
    const browserClient = await resolveBrowserClient(globals);
    if (!browserClient) {
      return remember(globals, stop(step, NO_BROWSER_CLIENT_MESSAGE));
    }

    const { setupBrowserRuntime } = browserClient.module;
    await setupBrowserRuntime({ globals });

    step = "Setup Chrome Backend";
    const browserList = await globals.agent.browsers.list();
    const chromeInfo = browserList.find(browserInfo => browserInfo.type === "extension");
    if (!chromeInfo) {
      return remember(globals, stop(step, STOP_SIGNALS.NO_CHROME_EXTENSION_BACKEND));
    }

    browser = await globals.agent.browsers.get(chromeInfo.id);
    globals.browser = browser;
    await browser.nameSession("Podzi CLI");

    step = "Claim Existing Podzi Tab";
    const tabs = await browser.user.openTabs();
    globals.podziOpenTabs = tabs;
    const podziCandidate = tabs.find(tab => (tab.url || "").includes("/episode/editor"));
    if (!podziCandidate) {
      return remember(globals, stop(step, STOP_SIGNALS.NO_PODZI_TAB));
    }

    const podziTab = await browser.user.claimTab(podziCandidate);
    claimed = true;
    globals.podziTab = podziTab;
    tabInfo = {
      title: await podziTab.title(),
      url: await podziTab.url(),
      id: podziTab.id,
    };

    step = "Connect Native Pipe";
    const rawChrome = await connectNativePipe(repl);
    if (!rawChrome.pipe) {
      return remember(globals, stop(step, STOP_SIGNALS.NO_CHROME_EXTENSION_PIPE, tabInfo));
    }
    globals.rawChrome = rawChrome;

    const raw = async (method, params) => {
      const msg = await rawChrome.request(
        rawChrome.pipe,
        method,
        { ...params, ...rawChrome.params },
        15000
      );
      if (msg.error) {
        throw new Error(msg.error.message || JSON.stringify(msg.error));
      }
      return msg.result;
    };
    globals.rawChromeRaw = raw;

    const tabId = Number(podziTab.id);
    await raw("attach", { tabId });

    step = "Verify Podzi CLI";
    const cliType = await raw("executeCdp", {
      target: { tabId },
      method: "Runtime.evaluate",
      commandParams: {
        expression: "typeof window.podzi_cli",
        returnByValue: true,
        awaitPromise: true,
      },
      timeoutMs: 10000,
    });

    if (cliType.result?.value !== "object") {
      return remember(globals, stop(step, STOP_SIGNALS.PODZI_CLI_NOT_READY, tabInfo));
    }

    if (!executeTool) {
      return remember(globals, {
        ok: true,
        step: "Prepare Podzi CLI",
        tab: tabInfo,
      });
    }

    step = "Fetch Podzi CLI Tool";
    const expression = buildRunExpression(toolName, toolArgs);
    const toolResult = await raw("executeCdp", {
      target: { tabId },
      method: "Runtime.evaluate",
      commandParams: {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      timeoutMs: 15000,
    });

    step = "Parse Result";
    const parsed = parsePodziToolResult(toolName, toolResult, tabInfo);
    return remember(globals, parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return remember(globals, stop(step, `PODZI_ERROR: ${message}`, tabInfo));
  } finally {
    if (claimed && browser) {
      try {
        await browser.tabs.finalize({});
      } catch {}
    }
  }
}

function buildRunExpression(toolName, toolArgs) {
  const serializedArgs = [toolName, ...toolArgs].map(arg => JSON.stringify(arg)).join(", ");
  return `(async () => await window.podzi_cli.run(${serializedArgs}))()`;
}

async function resolveBrowserClient(globals) {
  if (isBrowserClient(globals.podziBrowserClient)) {
    return globals.podziBrowserClient;
  }

  const cache = await readBrowserClientCache(globals);
  const cached = cache
    ? await loadBrowserClientCandidate(globals, cache, { requireStatMatch: true })
    : null;
  if (cached) {
    globals.podziBrowserClient = cached;
    return cached;
  }

  const candidates = await findBrowserClientCandidates(globals);
  for (const candidate of candidates) {
    const loaded = await loadBrowserClientCandidate(globals, candidate, {
      requireStatMatch: false,
    });
    if (loaded) {
      globals.podziBrowserClient = loaded;
      await writeBrowserClientCache(globals, loaded);
      return loaded;
    }
  }

  return null;
}

function isBrowserClient(value) {
  return typeof value?.module?.setupBrowserRuntime === "function";
}

async function loadBrowserClientCandidate(globals, candidate, { requireStatMatch }) {
  try {
    if (typeof candidate?.browserClientUrl !== "string") {
      return null;
    }

    const { fileURLToPath } = await import("node:url");
    const filePath = fileURLToPath(candidate.browserClientUrl);
    const fs = await import("node:fs/promises");
    const stat = await fs.stat(filePath);

    if (
      requireStatMatch &&
      (candidate.fileSize !== stat.size || candidate.mtimeMs !== stat.mtimeMs)
    ) {
      return null;
    }

    await ensureProcessForBrowserClientImport(globals);
    const module = await import(candidate.browserClientUrl);
    if (typeof module.setupBrowserRuntime !== "function") {
      return null;
    }

    return {
      module,
      browserClientUrl: candidate.browserClientUrl,
      sourcePluginFamily: candidate.sourcePluginFamily,
      versionDirectory: candidate.versionDirectory,
      fileSize: stat.size,
      mtimeMs: stat.mtimeMs,
      verifiedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function ensureProcessForBrowserClientImport(globals) {
  if (globals?.process) {
    return;
  }

  try {
    const processModule = await import("node:process");
    globals.process = processModule.default ?? processModule;
    return;
  } catch {}

  const os = await import("node:os");
  globals.process = {
    arch: os.arch(),
    argv: ["node", ""],
    config: { variables: {} },
    cwd: () => "/",
    env: {},
    execPath: "",
    on: () => globals.process,
    off: () => globals.process,
    pid: 0,
    platform: os.platform(),
    uptime: () => 0,
    version: "v20.0.0",
    versions: {
      modules: "115",
      node: "20.0.0",
      uv: "1.0.0",
    },
  };
}

async function findBrowserClientCandidates(globals) {
  const codexHome = await getCodexHome(globals);
  if (!codexHome) {
    return [];
  }

  const path = await import("node:path");
  const roots = [
    {
      sourcePluginFamily: "openai-bundled/browser",
      versionsRoot: path.join(codexHome, "plugins", "cache", "openai-bundled", "browser"),
    },
    {
      sourcePluginFamily: "openai-bundled/chrome",
      versionsRoot: path.join(codexHome, "plugins", "cache", "openai-bundled", "chrome"),
    },
  ];

  const candidates = [];
  for (const root of roots) {
    candidates.push(...(await findBrowserClientCandidatesInRoot(root)));
  }
  return candidates;
}

async function findBrowserClientCandidatesInRoot({ sourcePluginFamily, versionsRoot }) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  let entries;

  try {
    entries = await fs.readdir(versionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const versionDirectories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const candidates = [];
  for (const versionDirectory of versionDirectories) {
    const filePath = path.join(versionsRoot, versionDirectory, "scripts", "browser-client.mjs");
    try {
      const stat = await fs.stat(filePath);
      candidates.push({
        browserClientUrl: pathToFileURL(filePath).href,
        sourcePluginFamily,
        versionDirectory,
        fileSize: stat.size,
        mtimeMs: stat.mtimeMs,
        verifiedAt: null,
      });
    } catch {}
  }

  return candidates;
}

async function getCodexHome(globals) {
  const os = await import("node:os");
  const path = await import("node:path");
  const env = globals?.process?.env ?? {};
  const home = env.USERPROFILE || env.HOME || os.homedir();
  return home ? path.join(home, ".codex") : null;
}

async function getBrowserClientCachePath(globals) {
  const codexHome = await getCodexHome(globals);
  if (!codexHome) {
    return null;
  }

  const path = await import("node:path");
  return path.join(codexHome, "podzi-codex-plugin", "browser-client.json");
}

async function readBrowserClientCache(globals) {
  try {
    const cachePath = await getBrowserClientCachePath(globals);
    if (!cachePath) {
      return null;
    }

    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeBrowserClientCache(globals, browserClient) {
  try {
    const cachePath = await getBrowserClientCachePath(globals);
    if (!cachePath) {
      return;
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const cache = {
      browserClientUrl: browserClient.browserClientUrl,
      sourcePluginFamily: browserClient.sourcePluginFamily,
      versionDirectory: browserClient.versionDirectory,
      fileSize: browserClient.fileSize,
      mtimeMs: browserClient.mtimeMs,
      verifiedAt: browserClient.verifiedAt,
    };

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {}
}

function parsePodziToolResult(toolName, toolResult, tabInfo) {
  const value = toolResult.result?.value;

  if (value?.isError) {
    const text = value.content?.[0]?.text || "unknown error";
    return stop("Parse Result", `PODZI_ERROR: ${text}`, tabInfo);
  }

  if (toolName === "get_visible_segments_text") {
    const textItem = value?.content?.[0];
    if (textItem?.type !== "text" || !textItem.text?.trim()) {
      return stop("Parse Result", STOP_SIGNALS.NO_VISIBLE_TRANSCRIPT, tabInfo);
    }

    return {
      ok: true,
      step: "Parse Result",
      tab: tabInfo,
      text: textItem.text,
      result: value,
    };
  }

  return {
    ok: true,
    step: "Parse Result",
    tab: tabInfo,
    result: value ?? toolResult,
  };
}

async function connectNativePipe(repl) {
  const fs = await import("node:fs/promises");
  const net = await import("node:net");
  const os = await import("node:os");
  const path = await import("node:path");
  const { Buffer } = await import("node:buffer");

  const request = async (pipe, method, params, timeoutMs = 15000) => {
    return await new Promise((resolve, reject) => {
      const socket = net.createConnection(pipe);
      const parse = parseFrames(os, Buffer);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("timeout"));
      }, timeoutMs);

      socket.on("connect", () => {
        socket.write(frame({ jsonrpc: "2.0", method, params, id: 1 }, os, Buffer));
      });
      socket.on("data", data => {
        for (const msg of parse(data)) {
          if (msg.id === 1) {
            clearTimeout(timer);
            socket.end();
            resolve(msg);
          }
        }
      });
      socket.on("error", error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  };

  const pipes = await findNativePipeCandidates(repl, fs, os, path);
  const meta = repl?.requestMeta?.["x-codex-turn-metadata"] ?? {};
  const params = { session_id: meta.session_id, turn_id: meta.turn_id };
  const working = [];

  for (const pipe of pipes) {
    try {
      const msg = await request(pipe, "getInfo", params, 1000);
      if (msg.result?.type === "extension") {
        working.push(pipe);
      }
    } catch {}
  }

  return { request, pipe: working[0], params };
}

async function findNativePipeCandidates(repl, fs, os, path) {
  if (os.platform() === "win32") {
    try {
      const names = await fs.readdir("\\\\.\\pipe\\");
      return names
        .filter(name => name.startsWith("codex-browser-use"))
        .map(name => `\\\\.\\pipe\\${name}`);
    } catch {
      return [];
    }
  }

  const roots = uniqueStrings([repl?.tmpDir, os.tmpdir()]);
  const candidates = [];
  for (const root of roots) {
    candidates.push(...(await findUnixPipeCandidates(root, fs, path, 2)));
  }
  return uniqueStrings(candidates);
}

async function findUnixPipeCandidates(root, fs, path, depth) {
  if (!root || depth < 0) {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.name.startsWith("codex-browser-use")) {
      candidates.push(fullPath);
    }

    if (entry.isDirectory() && depth > 0 && shouldSearchPipeDirectory(entry.name)) {
      candidates.push(...(await findUnixPipeCandidates(fullPath, fs, path, depth - 1)));
    }
  }

  return candidates;
}

function shouldSearchPipeDirectory(name) {
  const normalized = name.toLowerCase();
  return (
    normalized.includes("codex") ||
    normalized.includes("browser") ||
    normalized.includes("chrome")
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === "string" && value.length > 0))];
}

function frame(message, os, Buffer) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const head = Buffer.alloc(4);
  if (os.endianness() === "LE") {
    head.writeUInt32LE(body.length, 0);
  } else {
    head.writeUInt32BE(body.length, 0);
  }
  return Buffer.concat([head, body]);
}

function parseFrames(os, Buffer) {
  let chunks = [];
  let bytes = 0;

  return data => {
    chunks.push(Buffer.from(data));
    bytes += data.byteLength;
    const out = [];

    while (bytes >= 4) {
      const joined = Buffer.concat(chunks, bytes);
      const len =
        os.endianness() === "LE" ? joined.readUInt32LE(0) : joined.readUInt32BE(0);
      if (bytes < 4 + len) {
        break;
      }

      out.push(JSON.parse(joined.subarray(4, 4 + len).toString("utf8")));
      const rest = joined.subarray(4 + len);
      chunks = rest.length ? [rest] : [];
      bytes = rest.length;
    }

    return out;
  };
}

function stop(step, result, tab) {
  return {
    ok: false,
    step,
    result,
    ...(tab ? { tab } : {}),
  };
}

function remember(globals, result) {
  globals.podziCliResult = result;
  return result;
}
