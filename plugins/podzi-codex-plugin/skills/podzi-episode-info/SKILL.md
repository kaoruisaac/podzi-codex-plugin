---
name: podzi-episode-info
description: Read current Podzi episode metadata from the user's already-open Chrome Podzi editor tab. Use when the user asks for Podzi episode title, keywords, edited duration, or language; it calls `window.podzi_cli.run("episode_info")` through the Podzi core bridge and consumes only the returned JSON.
---

# Podzi Episode Info

Use this skill for read-only episode metadata tasks. The only source material is the JSON returned by `window.podzi_cli.run("episode_info")`.

`episode_info` returns:

```json
{
  "content": {
    "title": "Episode title",
    "keywords": "episode content keywords",
    "modified_audio_duration_seconds": 123.456,
    "language": "zh-TW"
  }
}
```

`keywords` means the episode content keywords or transcription prompt provided when the episode was created. `modified_audio_duration_seconds` is the episode length after editing.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only metadata returned by `episode_info`.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Fetch Workflow

In `mcp__node_repl__.js`, resolve the plugin skills directory and import the shared helper:

```js
const { runPodziCliTool } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);

const result = await runPodziCliTool("episode_info");
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. You may add one short Traditional Chinese explanation after the stop signal.

If `result.ok` is true, read `result.result.content[0].data.content` and use only those fields to answer the user.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_TAB_BUSY`
- `PODZI_ERROR: ...`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.
