const BROWSER_CLIENT_URL =
  "file:///C:/Users/kaoru/.codex/plugins/cache/openai-bundled/browser/0.1.0-alpha2/scripts/browser-client.mjs";

export const STOP_SIGNALS = Object.freeze({
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
  let step = "Setup Chrome Backend";
  let browser;
  let claimed = false;
  let tabInfo;

  try {
    const { setupBrowserRuntime } = await import(BROWSER_CLIENT_URL);
    await setupBrowserRuntime({ globals });

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

  const names = await fs.readdir("\\\\.\\pipe\\");
  const pipes = names
    .filter(name => name.startsWith("codex-browser-use"))
    .map(name => `\\\\.\\pipe\\${name}`);
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
