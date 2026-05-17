---
name: podzi-visible-transcript
description: Read visible Podzi transcript content for summaries, Q&A, key points, or answers based on the currently visible transcript in the user's already-open Chrome Podzi editor tab. Use this when the user asks to summarize Podzi, answer from Podzi, list highlights, or otherwise use visible transcript text; it calls window.podzi_cli.run("get_visible_segments_text") through the Podzi core bridge.
---

# Podzi Visible Transcript

Use this skill for read-only transcript tasks such as summaries, Q&A, highlights, and key points. The only source material is the text returned by `window.podzi_cli.run("get_visible_segments_text")`.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only visible, non-muted transcript segments returned by `get_visible_segments_text`.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Fetch Workflow

In `mcp__node_repl__.js`, resolve the plugin skills directory and import the shared helper:

```js
const { runPodziCliTool } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);

const result = await runPodziCliTool("get_visible_segments_text");
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. You may add one short Traditional Chinese explanation after the stop signal.

If `result.ok` is true, use only `result.text` to answer the user. Do not claim to read the full episode unless the returned text itself supports that claim.

For a 200-character Traditional Chinese summary request, write one concise paragraph around 200 Chinese characters.

## Stop Signals

- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_ERROR: ...`
- `NO_VISIBLE_TRANSCRIPT`
