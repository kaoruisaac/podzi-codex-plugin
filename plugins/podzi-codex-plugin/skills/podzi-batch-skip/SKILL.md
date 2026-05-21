---
name: podzi-batch-skip
description: Preview batch skipped ranges in the user's already-open Chrome Podzi editor tab. Use this when the user asks to skip, cut, mute, or remove transcript ranges, filler words, ads, or other sections from the currently visible Podzi transcript; it reads visible segments with `get_visible_segments_text` and sends edited-time ranges through `window.podzi_cli.run("batch_skip", skips)` via the Podzi core bridge.
---

# Podzi Batch Skip

Use this skill to create review-preview skip ranges for Podzi transcript content. The skips are sent to Podzi's review UI with `isReviewing`; do not claim they are permanently applied or merged until the user applies them in Podzi.

Always gather visible segment context first. Do not invent speaker names, timestamps, or target ranges.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only visible, non-muted transcript segments returned by `get_visible_segments_text` to choose speakers and edited-time ranges.
- Preserve each returned `speakerName` exactly.
- Convert timestamps from `HH:MM:SS.mmm` to edited seconds before calling `batch_skip`.
- Ask the user for clarification if the target speaker, range, or skip intent is ambiguous.
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

If `visible.ok` is false, stop and report `visible.step` plus `visible.result`. If the helper returns `NO_VISIBLE_TRANSCRIPT`, stop and report that there is no visible transcript text to skip.

Parse only lines formatted as:

`[HH:MM:SS.mmm] Speaker Name: text`

Build a skip item for each range that should be previewed:

```js
{
  speakerName: "Speaker Name",
  start: 1.234,
  end: 5.678
}
```

Submit all skips in one batch:

```js
const skips = [
  { speakerName: "Speaker Name", start: 1.234, end: 5.678 }
];
const result = await runPodziCliTool("batch_skip", skips);
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. If `result.ok` is true, tell the user how many skip ranges were previewed and remind them to review/apply or reject them in Podzi.

On success, read `result.result.content[0].data` for `appliedCount` and `skips`. Each returned skip includes `speakerName`, `trackId`, `start`, and `end` in original timeline seconds.

## Skip Construction

- Do not send a `text` field; `batch_skip` only accepts `{ speakerName, start, end }`.
- Each range must overlap transcript content on that speaker's track. A range with no overlap returns `PODZI_ERROR: batch_skip range ... does not overlap ...`.
- A range may span multiple segments. It does not need to align to a single segment boundary.
- You may merge adjacent visible lines from the same speaker into one `{ start, end }` range when the user wants to skip the whole block.
- You may use a sub-range within a visible segment's edited timestamps when the user's request is narrower than the full line.
- Require finite numbers with `start < end`. Do not send an empty array.
- Unlike `batch_text_edit`, duplicate segment targeting is not rejected, but overlapping or ambiguous ranges should be avoided when the user's intent is unclear.

For broad cleanup requests such as removing filler words, ads, off-topic sections, or repeated lines, skip only ranges where the target is clear from the user's request and visible context.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_ERROR: ...`
- `NO_VISIBLE_TRANSCRIPT`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.
