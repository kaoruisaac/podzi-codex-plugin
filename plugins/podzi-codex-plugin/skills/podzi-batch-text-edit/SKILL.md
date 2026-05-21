---
name: podzi-batch-text-edit
description: Preview batch transcript text edits in the user's already-open Chrome Podzi editor tab. Use this when the user asks to correct, rewrite, punctuate, normalize terminology, or batch-edit currently visible Podzi transcript text; it reads visible segments with `get_visible_segments_text` and sends complete replacement segment text through `window.podzi_cli.run("batch_text_edit", edits)` via the Podzi core bridge.
---

# Podzi Batch Text Edit

Use this skill to create review-preview transcript text edits for currently visible Podzi segments. The edits are sent to Podzi's review UI with `isReviewing`; do not claim they are permanently applied.

Always gather visible segment context first. Do not invent speaker names, timestamps, or target segments.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only visible, non-muted transcript segments returned by `get_visible_segments_text`.
- Send only complete replacement text for full target segments. Do not send diffs, partial snippets, or commentary as edit text.
- Preserve each returned `speakerName` exactly.
- Convert timestamps from `HH:MM:SS.mmm` to edited seconds before calling `batch_text_edit`.
- Ask the user for clarification if the target segment, speaker, or intended replacement text is ambiguous.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Workflow

In `mcp__node_repl__.js`, resolve the plugin skills directory and import the shared helper:

```js
const { runPodziCliTool } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);
```

Fetch visible transcript text first:

```js
const visible = await runPodziCliTool("get_visible_segments_text");
nodeRepl.write(JSON.stringify(visible, null, 2));
```

If `visible.ok` is false, stop and report `visible.step` plus `visible.result`. If the helper returns `NO_VISIBLE_TRANSCRIPT`, stop and report that there is no visible transcript text to edit.

Parse only lines formatted as:

`[HH:MM:SS.mmm - HH:MM:SS.mmm] Speaker Name: text`

Build an edit item for each segment that needs a change:

```js
{
  speakerName: "Speaker Name",
  start: 1.234,
  end: 5.678,
  text: "complete replacement transcript text"
}
```

Submit all edits in one batch:

```js
const edits = [
  { speakerName: "Speaker Name", start: 1.234, end: 5.678, text: "replacement text" }
];
const result = await runPodziCliTool("batch_text_edit", edits);
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. If `result.ok` is true, tell the user how many segment edits were previewed and remind them to review/apply or reject them in Podzi.

## Edit Construction

- Treat each visible transcript line as one segment candidate.
- Use the line's start and end edited timestamps as the `start` and `end` seconds.
- Use the text after `Speaker Name:` as the source text for deciding replacements.
- Include unchanged surrounding words in `text`; Podzi replaces the segment text exactly with the provided value.
- Keep the batch free of duplicate target segments.
- Do not include empty or whitespace-only replacement text.

For broad cleanup requests such as punctuation, casing, filler-word removal, or terminology normalization, edit only segments where the intended change is clear from the user's request and visible context.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_ERROR: ...`
- `NO_VISIBLE_TRANSCRIPT`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.
