---
name: podzi
description: Use when the user invokes Podzi or asks to summarize or answer questions about visible transcript content in the currently open Podzi episode in Chrome. This skill requires a user-opened Chrome tab and calls window.podzi_cli.run("get_visible_segments_text").
---

# Podzi

Use the Chrome automation tool to inspect the user's currently open Chrome tabs. This plugin is for human-in-the-loop work with a Podzi episode the user has already opened in Chrome. Find the active Podzi page, evaluate JavaScript in that page context, call `window.podzi_cli`, and use the returned visible transcript text as the only source material.

The plugin only reads visible, non-muted transcript segments through `get_visible_segments_text`. Do not claim to read the full episode unless the returned text itself contains the relevant content.

## Workflow

1. Use the available Chrome automation tool, such as `@chrome` when present, to find the currently open Podzi tab.
   - Prefer a tab whose URL, title, or page content clearly identifies Podzi.
   - If multiple Podzi tabs are open, prefer the focused or most recently active tab.
   - If no Podzi tab is open, say: "Please open the Podzi episode in Chrome first, then ask me again."
2. Evaluate this in the Podzi page context:

```js
typeof window.podzi_cli
```

3. If the result is not `"object"`, wait briefly or reload only if the page is clearly still loading. Then check again. If it is still unavailable, say: "The Podzi page bridge is not loaded in this Chrome tab. Please refresh the Podzi tab and try again."
4. Optionally inspect available commands:

```js
window.podzi_cli.help()
window.podzi_cli.list()
window.podzi_cli.describe("get_visible_segments_text")
```

5. Fetch the transcript:

```js
window.podzi_cli.run("get_visible_segments_text")
```

6. Parse the MCP-style result:
   - If `result.isError` is true, report `result.content[0].text` directly.
   - Require `result.content[0].type === "text"`.
   - Use `result.content[0].text` as the transcript.
   - If the returned text is empty or only whitespace, say: "I cannot see any transcript text in the current Podzi view. Please scroll to or reveal the transcript segments in Podzi, then ask me again."
7. Answer the user's request from the transcript. Focus on summaries and Q&A. Preserve the requested language and length. If the user asks for about 200 Chinese characters, produce one concise paragraph around that length.

## Current Podzi CLI Contract

`window.podzi_cli` is provided by Podzi's frontend `PodziCli` class.

Available public methods:

- `window.podzi_cli.help()` returns command help.
- `window.podzi_cli.list()` returns available tools.
- `window.podzi_cli.describe("<tool_name>")` returns usage and output notes.
- `window.podzi_cli.run("<tool_name>", ...args)` runs a tool and returns `{ content: [...] }` or `{ isError: true, content: [{ type: "text", text: "..." }] }`.

The currently important tool is:

```js
window.podzi_cli.run("get_visible_segments_text")
```

It accepts no arguments. It always returns visible, non-muted transcript content as text with edited timestamps and speaker names:

```text
[00:00:01.234] Speaker: transcript text
[00:00:05.678] Speaker: more transcript text
```

Do not invent episode details that are not supported by the returned visible transcript.
