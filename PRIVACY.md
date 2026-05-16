# Privacy

The Podzi Codex plugin itself does not store transcript data.

The plugin reads visible, non-muted transcript segments from the Podzi page that the user has already opened in Chrome. It uses the page-provided `window.podzi_cli` bridge and the `get_visible_segments_text` command as its source of transcript text.

The plugin itself does not send transcript data to any new service outside the Podzi page and the Codex execution environment used to answer the user's request.

Podzi's service terms are available at <https://podzi.cc/about/service>.
