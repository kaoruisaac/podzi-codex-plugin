# Podzi for Codex

This repository defines the official Podzi marketplace entry for Codex and packages the `podzi-codex-plugin` plugin.

The plugin helps Codex summarize and answer questions from visible transcript segments in a Podzi episode that the user has already opened in Chrome. It uses the Podzi page bridge, `window.podzi_cli`, and reads only the text returned by `get_visible_segments_text`.

## Repository Shape

```text
.agents/plugins/marketplace.json
plugins/podzi-codex-plugin/
  .codex-plugin/plugin.json
  assets/
  skills/podzi/SKILL.md
```

The marketplace is named `podzi-official-marketplace`, shown as `Podzi for Codex`, and includes one plugin shown as `Podzi Plugin`.

## Usage Flow

1. Open the target Podzi episode in Chrome.
2. Make sure the transcript segments you want Codex to use are visible in the Podzi page.
3. Ask Codex to summarize or answer questions using Podzi.

Example prompts:

```text
用兩百字摘要目前 Chrome Podzi 頁面可見的逐字稿。
根據目前可見的 Podzi 逐字稿回答我的問題。
列出目前可見段落的三個重點。
```

If no Podzi tab is open in Chrome, open the episode first. If the Podzi page bridge is unavailable, refresh the Podzi tab and try again.

## Basic Validation

From the repository root:

```powershell
Get-Content .agents\plugins\marketplace.json | ConvertFrom-Json | Out-Null
Get-Content plugins\podzi-codex-plugin\.codex-plugin\plugin.json | ConvertFrom-Json | Out-Null
Test-Path plugins\podzi-codex-plugin
Test-Path plugins\podzi-codex-plugin\skills
Test-Path plugins\podzi-codex-plugin\assets\icon.png
Test-Path plugins\podzi-codex-plugin\assets\logo.png
Test-Path plugins\podzi-codex-plugin\assets\screenshot1.png
```

This pass does not include a full Codex app marketplace installation test.
