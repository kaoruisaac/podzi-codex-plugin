---
name: podzi-editable-text
description: Read editable Podzi transcript text with stable segment indexes from the user's already-open Chrome Podzi editor tab. Use when the user asks to inspect editable transcript context or list targetable transcript segments; it calls `window.podzi_cli.run("get_editable_text", fromTimestamp, toTimestamp)` through the Podzi core bridge and consumes only the returned JSON content.
---

# Podzi Editable Text

Use this skill for read-only editable transcript context. The only source material is the JSON returned by `window.podzi_cli.run("get_editable_text", fromTimestamp, toTimestamp)`.

`get_editable_text` returns a single JSON `content` item. Its `data.content` value is newline-separated, one editable segment per line, formatted as:

`[segmentIndex] Speaker Name: text`

`segmentIndex` is the index in Podzi's full effective edited segment list.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only editable transcript segments returned by `get_editable_text`.
- Use edited seconds for `fromTimestamp` and `toTimestamp`.
- Do not invent segment indexes, speaker names, or transcript text.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Fetch Workflow

In `mcp__node_repl__.js`, resolve the plugin skills directory and import the shared helper:

```js
const { runPodziCliTool } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);

const result = await runPodziCliTool("get_editable_text", fromTimestamp, toTimestamp);
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. If the helper returns `NO_VISIBLE_TRANSCRIPT`, stop and report that there is no editable transcript text in the requested range.

If `result.ok` is true, use only `result.text` to answer the user or provide segment-index context. If structured output is needed, parse only lines matching:

`[segmentIndex] Speaker Name: text`

For each parsed line, preserve `segmentIndex` exactly as the target key for future `batch_text_edit` calls.

## Output Guidance

- When the user asks to inspect context, show the returned lines as-is or summarize them without changing segment indexes.
- When the user asks for possible edit targets, include `segmentIndex`, speaker name, and the current text.
- This skill is read-only; report editable segment context without submitting edits.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_TAB_BUSY`
- `PODZI_ERROR: ...`
- `NO_VISIBLE_TRANSCRIPT`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.
