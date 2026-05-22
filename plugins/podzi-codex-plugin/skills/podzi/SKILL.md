---
name: podzi
description: Core Podzi bridge for the user's already-open Chrome Podzi tab. Use when any Podzi task needs window.podzi_cli from an existing Chrome tab whose URL contains /episode/editor.
---

# Podzi Core Bridge

Use this skill as the shared first step for Podzi tasks. Its only job is to reach the user's existing Chrome Podzi editor tab and confirm `window.podzi_cli` is available.

Task skills should import the same helper and call their specific `window.podzi_cli.run(...)` tool.

Do not add an extra confirmation step unless the user asks for one; Podzi provides its own preview UI for those operations.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import and run `scripts/run-podzi-cli-tool.mjs` from this skill directory.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Select the first existing Chrome tab whose URL contains `/episode/editor`.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Prepare Workflow

In `mcp__node_repl__.js`, resolve this skill directory path and import the helper by `file:///` URL:

```js
const { preparePodziCli } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);

const result = await preparePodziCli();
nodeRepl.write(JSON.stringify(result, null, 2));
```

On success, the helper returns:

```json
{
  "ok": true,
  "step": "Prepare Podzi CLI",
  "tab": {
    "title": "...",
    "url": "...",
    "id": "..."
  }
}
```

On failure, return the helper result as-is. You may add one short Traditional Chinese explanation after the stop signal for the user.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_ERROR: ...`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.

If a tab was claimed, the helper finalizes it before returning.
