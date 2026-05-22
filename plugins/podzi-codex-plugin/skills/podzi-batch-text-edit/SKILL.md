---
name: podzi-batch-text-edit
description: Preview batch transcript text edits in the user's already-open Chrome Podzi editor tab. Use this when the user asks to correct, rewrite, punctuate, normalize terminology, or batch-edit Podzi transcript text; it reads editable segments with `get_editable_text(fromTimestamp, toTimestamp)` and sends complete replacement segment text through `window.podzi_cli.run("batch_text_edit", { [segmentIndex]: text })` via the Podzi core bridge.
---

# Podzi Batch Text Edit

Use this skill to create review-preview transcript text edits for Podzi segments returned by `get_editable_text`. The edits are sent to Podzi's review UI with `isReviewing`; do not claim they are permanently applied.

Always gather editable segment context first. Do not invent speaker names, timestamps, segment indexes, or target segments.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Use only editable transcript segments returned by `get_editable_text`.
- Use only `segmentIndex` values returned by `get_editable_text` as edit targets.
- Send only complete replacement text for full target segments. Do not send diffs, partial snippets, or commentary as edit text.
- Ask the user for clarification if the target segment index or intended replacement text is ambiguous.
- Stop if any step returns a stop signal. Report the step name and exact result; do not search for another method.

## Workflow

In `mcp__node_repl__.js`, resolve the plugin skills directory and import the shared helper:

```js
const { runPodziCliTool } = await import(
  "file:///PATH/TO/skills/podzi/scripts/run-podzi-cli-tool.mjs"
);
```

Fetch editable transcript text first. `fromTimestamp` and `toTimestamp` are edited seconds:

```js
const editable = await runPodziCliTool("get_editable_text", fromTimestamp, toTimestamp);
nodeRepl.write(JSON.stringify(editable, null, 2));
```

If `editable.ok` is false, stop and report `editable.step` plus `editable.result`. If the helper returns `NO_VISIBLE_TRANSCRIPT`, stop and report that there is no editable transcript text to edit.

Parse only lines formatted as:

`[segmentIndex] Speaker Name: text`

Build one object property for each segment that needs a change:

```js
{
  2: "complete replacement transcript text",
  3: "another complete replacement transcript text"
}
```

Submit all edits in one batch:

```js
const edits = {
  2: "complete replacement transcript text"
};
const result = await runPodziCliTool("batch_text_edit", edits);
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. If `result.ok` is true, tell the user how many segment edits were previewed based on the submitted `edits` object (for example, `Object.keys(edits).length`), optionally summarize which `segmentIndex` keys were submitted, and remind them to review/apply or reject them in Podzi. Do not claim the edits are permanently applied.

On success, read `result.result.content[0].data.success === true` as confirmation only.

## Edit Construction

- Treat each editable transcript line as one segment candidate.
- Use the number inside `[segmentIndex]` as the object key.
- Use the text after `Speaker Name:` as the source text for deciding replacements.
- Include unchanged surrounding words in the replacement value; Podzi replaces the segment text exactly with the provided value.
- `segmentIndex` is the index in Podzi's full effective edited segment list.
- Do not include empty or whitespace-only replacement values.

For broad cleanup requests such as punctuation, casing, filler-word removal, or terminology normalization, edit only segments where the intended change is clear from the user's request and editable context.

## Stop Signals

- `NO_BROWSER_CLIENT`
- `NO_CHROME_EXTENSION_BACKEND`
- `NO_PODZI_TAB`
- `NO_CHROME_EXTENSION_PIPE`
- `PODZI_CLI_NOT_READY`
- `PODZI_ERROR: ...`
- `NO_VISIBLE_TRANSCRIPT`

If the result is `NO_BROWSER_CLIENT`, ask the user to install/enable the Codex Browser plugin and Chrome plugin.
