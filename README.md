# Podzi for Codex

This repository defines the official Podzi marketplace entry for Codex and packages the `podzi-codex-plugin` plugin.

The plugin helps Codex work with a Podzi episode that the user has already opened in Chrome. It first prepares the Podzi page bridge, `window.podzi_cli`, from an existing `/episode/editor` tab. Read-only transcript tasks call `get_visible_segments_text` and use only the returned visible transcript text. Batch text-edit and batch skip tasks use those visible segments to send preview edits or skip ranges to Podzi's review UI.

## Repository Shape

```text
.agents/plugins/marketplace.json
plugins/podzi-codex-plugin/
  .codex-plugin/plugin.json
  assets/
  skills/podzi/SKILL.md
  skills/podzi/scripts/run-podzi-cli-tool.mjs
  skills/podzi-visible-transcript/SKILL.md
  skills/podzi-batch-text-edit/SKILL.md
  skills/podzi-batch-skip/SKILL.md
```

The marketplace is named `podzi-official-marketplace`, shown as `Podzi for Codex`, and includes one plugin shown as `Podzi Plugin`.

The `podzi` skill is the shared core bridge. It only obtains `window.podzi_cli` from an existing Chrome tab. The `podzi-visible-transcript` skill handles summaries, Q&A, and highlights by calling `window.podzi_cli.run("get_visible_segments_text")` through the shared helper script. The `podzi-batch-text-edit` skill uses the same visible transcript format to call `window.podzi_cli.run("batch_text_edit", edits)` and preview replacement text for full segments. The `podzi-batch-skip` skill uses the same visible transcript format to call `window.podzi_cli.run("batch_skip", skips)` and preview skip ranges for review.

`get_visible_segments_text` returns one plain-text item with newline-separated segments, each formatted as:

`[HH:MM:SS.mmm - HH:MM:SS.mmm] Speaker Name: text`

Only visible, non-muted, non-skipped segments are included. Partially muted or skipped words are removed, and the remaining segments are ordered by edited time.

`batch_text_edit` accepts an array of complete segment replacements:

```js
[
  { speakerName: "Speaker", start: 1.234, end: 5.678, text: "replacement text" }
]
```

The `start` and `end` values use edited seconds from the visible transcript timestamps. Podzi stores these edits for review until the user applies or rejects them in the editor.

`batch_text_edit` requires each item to match exactly one segment. `batch_skip` accepts edited-time ranges that overlap transcript content on one speaker track and may span multiple segments:

```js
[
  { speakerName: "Speaker", start: 1.234, end: 5.678 }
]
```

Podzi stores skip ranges for review with `isReviewing` until the user applies or rejects them in the editor.

## Usage Flow

1. Open the target Podzi episode editor in Chrome.
2. Make sure the transcript segments you want Codex to use are visible in the Podzi page.
3. Ask Codex to summarize, answer questions, preview transcript text edits, or preview skip ranges using Podzi.

Example prompts:

```text
用兩百字摘要目前 Chrome Podzi 頁面可見的逐字稿。
根據目前可見的 Podzi 逐字稿回答我的問題。
列出目前可見段落的三個重點。
修正目前可見 Podzi 逐字稿的標點並送出預覽編輯。
跳過目前可見 Podzi 逐字稿中重複的廣告段落並送出預覽。
```

If no `/episode/editor` Podzi tab is open in Chrome, open the episode editor first. If the Podzi page bridge is unavailable, refresh the Podzi tab and try again.

## Basic Validation

From the repository root:

```powershell
Get-Content .agents\plugins\marketplace.json | ConvertFrom-Json | Out-Null
Get-Content plugins\podzi-codex-plugin\.codex-plugin\plugin.json | ConvertFrom-Json | Out-Null
Test-Path plugins\podzi-codex-plugin
Test-Path plugins\podzi-codex-plugin\skills
Test-Path plugins\podzi-codex-plugin\skills\podzi\scripts\run-podzi-cli-tool.mjs
Test-Path plugins\podzi-codex-plugin\skills\podzi-visible-transcript\SKILL.md
Test-Path plugins\podzi-codex-plugin\skills\podzi-batch-text-edit\SKILL.md
Test-Path plugins\podzi-codex-plugin\skills\podzi-batch-skip\SKILL.md
Test-Path plugins\podzi-codex-plugin\assets\icon.png
Test-Path plugins\podzi-codex-plugin\assets\logo.png
Test-Path plugins\podzi-codex-plugin\assets\screenshot1.png
```

This pass does not include a full Codex app marketplace installation test.
