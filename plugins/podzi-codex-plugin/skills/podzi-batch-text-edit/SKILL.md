---
name: podzi-batch-text-edit
description: Preview batch transcript text edits in the user's already-open Chrome Podzi editor tab. Use this when the user asks to correct, rewrite, punctuate, normalize terminology, or batch-edit Podzi transcript text; it reads editable segments with `get_editable_text(fromTimestamp, toTimestamp)` and sends complete replacement segment text through `window.podzi_cli.run("batch_text_edit", { [segmentIndex]: text })` via the Podzi core bridge. Before editing, fetch episode metadata with `episode_info`, then dispatch `get_editable_text` and `batch_text_edit` to subagents in time windows of at most 20 minutes each so the main agent does not accumulate full-transcript context.
---

# Podzi Batch Text Edit

Use this skill to create review-preview transcript text edits for Podzi segments returned by `get_editable_text`. The edits are sent to Podzi's review UI with `isReviewing`; do not claim they are permanently applied.

The **main agent** orchestrates the task: call `episode_info` first, split the episode into time windows, dispatch subagents, and aggregate results. Do not fetch the full episode transcript in the main thread.

Each **subagent** handles one time window: fetch editable segments with `get_editable_text`, build replacement text, and submit with `batch_text_edit`.

Do not invent speaker names, timestamps, segment indexes, or target segments.

## Hard Rules

- Use `mcp__node_repl__.js`.
- Import `../podzi/scripts/run-podzi-cli-tool.mjs` by `file:///` URL.
- Do not open, navigate, reload, or create any browser tab.
- Do not use Playwright.
- Do not inspect page text, DOM text, screenshots, or other sources.
- Before any `get_editable_text` or `batch_text_edit` call, the main agent must successfully call `episode_info` and use the returned `keywords` and `modified_audio_duration_seconds` for planning.
- The main agent must not run large-range `get_editable_text` calls itself; dispatch both `get_editable_text` and `batch_text_edit` to subagents within their assigned time windows.
- Each subagent's `[fromTimestamp, toTimestamp)` span must not exceed 1200 edited seconds (20 minutes). If the episode is longer, the main agent must split it into multiple windows and dispatch one subagent per window.
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

### Pre-flight: Episode Info

The main agent calls `episode_info` before dispatching any subagent:

```js
const episode = await runPodziCliTool("episode_info");
nodeRepl.write(JSON.stringify(episode, null, 2));
```

If `episode.ok` is false, stop and report `episode.step` plus `episode.result`.

If `episode.ok` is true, read `episode.result.content[0].data.content` and keep:

- `keywords` — episode content keywords or transcription prompt; pass this to each subagent for terminology alignment.
- `modified_audio_duration_seconds` — edited episode length; use this as the upper bound for time-window planning.

### Chunk Planning

The main agent splits the episode from `0` to `modified_audio_duration_seconds` into windows where each window satisfies `toTimestamp - fromTimestamp <= 1200`.

Example for a 3600-second episode:

- `[0, 1200)`
- `[1200, 2400)`
- `[2400, 3600)`

The main agent keeps only episode metadata, the list of `{ fromTimestamp, toTimestamp }` windows, and a short summary of the user's edit intent. Do not retain full transcript text in the main thread.

### Subagent Dispatch

For each time window, the main agent starts a subagent (for example, with the Cursor `Task` tool). Each subagent prompt must include:

- The user's edit request
- The assigned `fromTimestamp` and `toTimestamp`
- The episode `keywords`
- Instructions to follow this skill's Hard Rules and the Per-chunk Workflow below

Multiple subagents may queue on the Podzi tab lock or return `PODZI_TAB_BUSY`. The subagent should report that stop signal; the main agent may retry that window after the other caller finishes.

After all subagents complete, the main agent aggregates how many segment edits were previewed per window, reports any stop signals, and reminds the user to review, apply, or reject the edits in Podzi.

### Per-chunk Workflow (Subagent)

The subagent runs this workflow inside its assigned time window. `fromTimestamp` and `toTimestamp` are edited seconds assigned by the main agent and must span at most 1200 seconds.

Fetch editable transcript text for the assigned window:

```js
const editable = await runPodziCliTool("get_editable_text", fromTimestamp, toTimestamp);
nodeRepl.write(JSON.stringify(editable, null, 2));
```

If `editable.ok` is false, stop and report `editable.step` plus `editable.result`. If the helper returns `NO_VISIBLE_TRANSCRIPT`, stop and report that there is no editable transcript text to edit in this window.

Parse only lines formatted as:

`[segmentIndex] Speaker Name: text`

Build one object property for each segment that needs a change:

```js
{
  2: "complete replacement transcript text",
  3: "another complete replacement transcript text"
}
```

Submit all edits for this window in one batch:

```js
const edits = {
  2: "complete replacement transcript text"
};
const result = await runPodziCliTool("batch_text_edit", edits);
nodeRepl.write(JSON.stringify(result, null, 2));
```

If `result.ok` is false, stop and report `result.step` plus `result.result`. If `result.ok` is true, report how many segment edits were previewed in this window based on the submitted `edits` object (for example, `Object.keys(edits).length`), optionally summarize which `segmentIndex` keys were submitted, and return that summary to the main agent. Do not claim the edits are permanently applied.

On success, read `result.result.content[0].data.success === true` as confirmation only.

## Edit Construction

- Treat each editable transcript line as one segment candidate.
- Use the number inside `[segmentIndex]` as the object key.
- Use the text after `Speaker Name:` as the source text for deciding replacements.
- Include unchanged surrounding words in the replacement value; Podzi replaces the segment text exactly with the provided value.
- `segmentIndex` is the index in Podzi's full effective edited segment list.
- Do not include empty or whitespace-only replacement values.
- For terminology normalization or content polishing, the subagent should use the `keywords` passed by the main agent, but each replacement value must still be based only on segments returned by `get_editable_text` in that subagent's window.

For broad cleanup requests such as punctuation, casing, filler-word removal, or terminology normalization, edit only segments where the intended change is clear from the user's request and editable context.

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

If a subagent returns `PODZI_TAB_BUSY`, report the affected time window to the main agent so it can retry that window after the Podzi tab is available.
